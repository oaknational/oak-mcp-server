/**
 * MCP OAuth authentication middleware.
 *
 * Generic authentication middleware for MCP that enforces OAuth token verification.
 * Returns HTTP 401 + WWW-Authenticate header for auth failures, per MCP spec.
 *
 * ## Auth Model
 *
 * Per MCP spec: "Invalid or expired tokens MUST receive a HTTP 401 response"
 * Per OpenAI Apps: "If verification fails, respond with 401 Unauthorized"
 *
 * This middleware runs BEFORE the MCP SDK, allowing proper HTTP 401 responses.
 *
 */

import type { RequestHandler, Request, Response, NextFunction } from 'express';
import type { Logger } from '@oaknational/logger';
import type { TokenVerifier } from './types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

// Local declaration merge: augments Express Request with `auth?: AuthInfo`.
// Replaces the `import type {} from '.../bearerAuth.js'` side-effect import.
// Both paths reach the SDK via the `"./*"` catch-all wildcard (not a named
// export), but `server/auth/types.js` is a pure-type leaf file — less likely
// to move than the middleware module. If the SDK promotes `AuthInfo` to a
// named export, update this import path to match.
// REMOVAL CONDITION: if @modelcontextprotocol/sdk re-exports bearerAuth's
// augmentation of Request.auth as part of its public API, remove this local
// declaration to avoid merge duplication.
declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthInfo;
  }
}
import { getPRMUrl } from './get-prm-url.js';
import { getMcpResourceUrl } from './get-mcp-resource-url.js';
import { validateResourceParameter } from '../../resource-parameter-validator.js';
import type { HostValidationError } from '../../host-validation-error.js';
import { ok, type Result } from '@oaknational/result';
import {
  sendHostValidationForbidden,
  sendInvalidFormatResponse,
  sendInvalidResourceResponse,
  sendMissingAuthResponse,
  sendVerificationFailedResponse,
} from './mcp-auth-responses.js';

/** The two self-URLs an authenticated request needs, derived together. */
interface AuthUrls {
  readonly prmUrl: string;
  readonly expectedResource: string;
}

/**
 * Derives the PRM URL and the RFC 8707 expected resource for the request.
 * Both come from the same validated origin, so they fail together — one
 * `Err` maps to one 403.
 */
function deriveAuthUrls(
  req: Request,
  allowedHosts: readonly string[],
  canonicalOrigin?: string,
): Result<AuthUrls, HostValidationError> {
  const prmUrlResult = getPRMUrl(req, allowedHosts, canonicalOrigin);
  if (!prmUrlResult.ok) {
    return prmUrlResult;
  }
  const resourceResult = getMcpResourceUrl(req, allowedHosts, canonicalOrigin);
  if (!resourceResult.ok) {
    return resourceResult;
  }
  return ok({ prmUrl: prmUrlResult.value, expectedResource: resourceResult.value });
}

/** The Authorization header parsed once into a closed set of outcomes. */
type AuthorizationHeader =
  | { readonly type: 'missing' }
  | { readonly type: 'malformed' }
  | { readonly type: 'bearer'; readonly token: string };

/**
 * Parses the Authorization header into a closed result: absent (or empty)
 * credentials, a malformed value, or a Bearer token. One parse at the
 * boundary; every later decision switches on the result, never on the raw
 * header. The `missing`/`malformed` split preserves RFC 6750's distinction
 * between absent credentials (bare `WWW-Authenticate: Bearer` challenge)
 * and malformed ones (`error="invalid_request"`). Scheme matching is
 * deliberately exact ("Bearer", single space) — the pinned integration
 * states keep lowercase `bearer`, multi-space, and comma-joined forms in
 * the malformed arm.
 */
function parseAuthorizationHeader(header: string | undefined): AuthorizationHeader {
  if (header === undefined || header === '') {
    return { type: 'missing' };
  }
  const parts = header.split(' ');
  const token = parts[1];
  if (parts.length === 2 && parts[0] === 'Bearer' && token) {
    return { type: 'bearer', token };
  }
  return { type: 'malformed' };
}

/**
 * Runs the three token steps — presence, format, verification — responding
 * 401 (with the PRM pointer) at the first failure. Returns the token and
 * its verified `AuthInfo` on success; `undefined` means a response has
 * already been sent.
 *
 * The invariant this middleware holds: **no request leaves `mcpAuth` via
 * `next()` unless `verifyToken` returned a truthy `AuthInfo`**. It is
 * asserted over the states a client controls in
 * `mcp-auth.integration.test.ts` ("no unverified request reaches next()").
 *
 * Scope that sentence to THIS middleware, deliberately. It is NOT a claim
 * about the `/mcp` route: `createMcpRouter` (`mcp-router.ts`) calls `next()`
 * directly for a `resources/read` of a public resource URI, so such a
 * request never enters `mcpAuth` at all. That exception is designed
 * (ADR-057 / ADR-113 / ADR-205) and fail-closed — membership is exact-string
 * against a frozen `Set` in `auth/public-resources.ts`, with no prefix or
 * normalisation slack — but it is a route-level bypass of this file, and an
 * attestation that claimed otherwise would be overclaiming.
 *
 * Note also that this file's `catch` calls `next(error)`, which enters
 * Express's error pipeline and skips the remaining route handlers rather
 * than reaching the MCP handler — an Express guarantee, verified against
 * this app's own express version.
 */
async function verifyRequestToken(
  req: Request,
  res: Response,
  prmUrl: string,
  verifyToken: TokenVerifier,
): Promise<{ token: string; authData: AuthInfo } | undefined> {
  const authorization = parseAuthorizationHeader(req.headers.authorization);
  if (authorization.type === 'missing') {
    sendMissingAuthResponse(res, prmUrl);
    return undefined;
  }
  if (authorization.type === 'malformed') {
    sendInvalidFormatResponse(res, prmUrl);
    return undefined;
  }
  const authData = await verifyToken(authorization.token, req);
  if (!authData) {
    sendVerificationFailedResponse(res, prmUrl);
    return undefined;
  }
  return { token: authorization.token, authData };
}

/**
 * Creates MCP authentication middleware with custom token verification.
 *
 * Returns middleware that:
 * 1. Derives the PRM URL; a failed Host validation is an explicit 403
 * 2. Returns 401 with WWW-Authenticate header if no authorization header
 * 3. Extracts and validates Bearer token format
 * 4. Calls custom verifyToken function for actual verification
 * 5. Returns 401 if token verification fails
 * 6. Validates JWT audience claim matches the resource URL (RFC 8707)
 * 7. Returns 401 if audience validation fails
 * 8. Sets verified `AuthInfo` on `req.auth` for the MCP SDK transport
 * 9. Calls next() if all checks pass
 *
 * **RFC 8707 Compliance**: This middleware validates that the JWT's `aud`
 * (audience) claim matches the expected resource URL to prevent token misuse
 * across different services. The expected resource is the fixed `/mcp`
 * path on the derived self-origin — exactly what the PRM document
 * advertises.
 *
 * @param verifyToken - Custom function to verify the OAuth token
 * @param logger - Logger for authentication events
 * @returns Express middleware that enforces authentication
 *
 * @see https://www.rfc-editor.org/rfc/rfc8707.html
 *
 * @example
 * ```typescript
 * const auth = mcpAuth(async (token, req) => {
 *   // Custom token verification logic
 *   return verifyMyToken(token);
 * }, logger, allowedHosts);
 * app.post('/mcp', auth, mcpHandler);
 * ```
 */
export function mcpAuth(
  verifyToken: TokenVerifier,
  logger: Logger,
  allowedHosts: readonly string[],
  canonicalOrigin?: string,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const urlsResult = deriveAuthUrls(req, allowedHosts, canonicalOrigin);
      if (!urlsResult.ok) {
        sendHostValidationForbidden(urlsResult.error, req, res, logger);
        return;
      }
      const { prmUrl, expectedResource } = urlsResult.value;

      // Presence, format, verification — 401s are sent inside the helper
      const verified = await verifyRequestToken(req, res, prmUrl, verifyToken);
      if (!verified) {
        return;
      }

      // RFC 8707: Validate resource parameter (JWT audience claim)
      const validation = validateResourceParameter(verified.token, expectedResource, logger);
      if (!validation.valid) {
        sendInvalidResourceResponse(res, prmUrl, validation.reason ?? 'Unknown validation error');
        return;
      }

      // Set verified AuthInfo on req.auth for the MCP SDK transport.
      // Direct assignment matches the SDK's own requireBearerAuth pattern.
      // The MCP SDK augments IncomingMessage with `auth?: AuthInfo`.
      req.auth = verified.authData;

      next();
    } catch (error) {
      logger.error('MCP auth middleware error', {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
        method: req.method,
      });
      next(error);
    }
  };
}

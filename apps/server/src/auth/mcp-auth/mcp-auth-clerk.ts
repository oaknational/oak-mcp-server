/**
 * Clerk-specific MCP OAuth authentication middleware.
 *
 * This module provides Clerk-integrated authentication middleware for MCP,
 * returning HTTP 401 + WWW-Authenticate for auth failures per MCP spec.
 *
 */

import type { RequestHandler, Request } from 'express';
import type { Logger } from '@oaknational/logger';
import type { AuthObject, MachineAuthObject } from '@clerk/backend';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { getAuth as defaultGetAuth } from '@clerk/express';
import { verifyClerkToken as defaultVerifyClerkToken } from '@clerk/mcp-tools/server';
import { mcpAuth } from './mcp-auth.js';
import { authInfoSchema } from './auth-info-schema.js';

/**
 * Dependencies for `createMcpAuthClerk`, injectable for testability (ADR-078).
 *
 * Production callers omit the `deps` parameter — defaults bind to the real
 * Clerk SDK functions. Tests inject fakes as plain objects.
 */
export interface CreateMcpAuthClerkDeps {
  readonly getAuth: (
    req: Request,
    opts: { acceptsToken: ('oauth_token' | 'm2m_token')[] },
  ) => AuthObject;
  readonly verifyClerkToken: (
    auth: MachineAuthObject<'oauth_token'>,
    token: string,
  ) => AuthInfo | undefined;
}

/**
 * Creates Express middleware that enforces Clerk OAuth authentication for MCP requests.
 *
 * This middleware:
 * 1. Uses `@clerk/express` to get authentication context
 * 2. Verifies the OAuth token using Clerk
 * 3. Validates AuthInfo with Zod `.strict()` schema (rejects unknown fields)
 * 4. Returns validated AuthInfo for `mcpAuth` to set on `req.auth`
 * 5. Returns 401 with proper WWW-Authenticate header if invalid
 *
 * **Key Behaviour**: Runs BEFORE the MCP SDK, enabling HTTP 401 responses
 * per MCP spec. The SDK always returns HTTP 200, so auth must be checked first.
 *
 * `clerkMiddleware()` must be registered upstream in the Express middleware
 * chain. `getAuth(req)` reads auth state set by Clerk's middleware, so
 * calling it without `clerkMiddleware()` upstream will throw.
 *
 * @param logger - Logger for authentication events
 * @param allowedHosts - Allowed hostnames for RFC 8707 resource validation
 * @param deps - Injectable dependencies (defaults to real Clerk SDK functions)
 * @returns Express middleware that enforces Clerk OAuth authentication
 *
 * @example
 * ```typescript
 * app.post('/mcp', createMcpAuthClerk(logger, allowedHosts), mcpHandler);
 * ```
 */
export function createMcpAuthClerk(
  logger: Logger,
  allowedHosts: readonly string[],
  deps: CreateMcpAuthClerkDeps = {
    getAuth: defaultGetAuth,
    verifyClerkToken: defaultVerifyClerkToken,
  },
  canonicalOrigin?: string,
  evalMachineIds: ReadonlySet<string> = new Set(),
): RequestHandler {
  return mcpAuth(
    (token, request: Request) => {
      const authData = deps.getAuth(request, { acceptsToken: ['oauth_token', 'm2m_token'] });
      if (!authData.isAuthenticated) {
        return Promise.resolve(undefined);
      }
      switch (authData.tokenType) {
        case 'oauth_token':
          return Promise.resolve(teacherAuthInfo(authData, token, deps, logger));
        case 'm2m_token':
          return Promise.resolve(
            evalMachineAuthInfo(authData.machineId, token, evalMachineIds, logger),
          );
        default:
          return Promise.resolve(undefined);
      }
    },
    logger,
    allowedHosts,
    canonicalOrigin,
  );
}

function teacherAuthInfo(
  authData: MachineAuthObject<'oauth_token'>,
  token: string,
  deps: CreateMcpAuthClerkDeps,
  logger: Logger,
): AuthInfo | undefined {
  const rawAuthInfo = deps.verifyClerkToken(authData, token);
  if (!rawAuthInfo) {
    return undefined;
  }
  const parsed = authInfoSchema.safeParse(rawAuthInfo);
  if (!parsed.success) {
    logger.error('Malformed authInfo from verifyClerkToken', {
      issues: parsed.error.issues.map((issue) => issue.message),
    });
    return undefined;
  }
  return parsed.data;
}

/**
 * Only opaque `mt_` tokens pass: Clerk can revoke those, and it also verifies
 * JWT-format M2M tokens as `m2m_token`, so the prefix check is what refuses
 * them. Clerk's M2M `scopes` name machines, not OAuth scopes, so the machine
 * carries none.
 */
function evalMachineAuthInfo(
  machineId: string,
  token: string,
  evalMachineIds: ReadonlySet<string>,
  logger: Logger,
): AuthInfo | undefined {
  if (!token.startsWith('mt_') || !evalMachineIds.has(machineId)) {
    return undefined;
  }
  logger.info('Eval machine authenticated', { principalType: 'machine', machineId });
  return {
    token,
    clientId: machineId,
    scopes: [],
    extra: { principalType: 'machine', machineId },
  };
}

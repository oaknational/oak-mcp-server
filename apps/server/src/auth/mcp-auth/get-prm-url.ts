import { ok, type Result } from '@oaknational/result';
import { deriveSelfOrigin, type HostValidationError } from '../../host-validation-error.js';
import { MCP_RESOURCE_PATH } from '../../served-origin.js';

/**
 * Generate path-qualified OAuth Protected Resource Metadata URL per RFC 9728.
 *
 * RFC 9728 Section 3.1 specifies that for a resource at `http://host/mcp`,
 * the PRM URL is `http://host/.well-known/oauth-protected-resource/mcp`.
 * The resource path (`/mcp`) is appended to the well-known prefix.
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc9728#section-3.1 | RFC 9728 Section 3.1}
 */

/**
 * Generates the path-qualified PRM URL for the current request.
 *
 * The origin comes from {@link deriveSelfOrigin}: a configured canonical
 * origin supersedes the request entirely; otherwise the arriving Host is
 * validated against the allowlist and the scheme follows the loopback rule
 * (`http` for loopback, `https` otherwise). The request's protocol is never
 * consulted — `req.protocol` reads the first `X-Forwarded-Proto` value
 * under `trust proxy`, which a client can prepend to.
 *
 * @param req - Minimal request object exposing header access
 * @param allowedHosts - Hostnames this server may call itself
 * @param canonicalOrigin - Configured origin that supersedes per-request
 *   derivation, or `undefined` to derive from the request
 * @returns `Ok` with the path-qualified PRM URL, or `Err` with the host
 *   validation failure (callers map it to an HTTP 403)
 */
export function getPRMUrl(
  req: { get(name: string): string | undefined },
  allowedHosts: readonly string[],
  canonicalOrigin?: string,
): Result<string, HostValidationError> {
  const originResult = deriveSelfOrigin(req, allowedHosts, canonicalOrigin);
  if (!originResult.ok) {
    return originResult;
  }
  return ok(`${originResult.value}/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`);
}

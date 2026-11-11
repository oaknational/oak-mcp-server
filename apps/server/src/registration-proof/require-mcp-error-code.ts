import { type ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

/** Requires one exact MCP protocol failure, rejecting generic or wrong-code errors. */
export function requireMcpErrorCode(
  error: unknown,
  expectedCode: ErrorCode,
  operation: string,
): void {
  if (error instanceof McpError && error.code === expectedCode) {
    return;
  }
  throw new Error(`${operation} returned an unexpected error`, { cause: error });
}

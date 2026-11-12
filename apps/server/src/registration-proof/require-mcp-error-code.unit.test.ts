import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import { requireMcpErrorCode } from './require-mcp-error-code.js';

describe('requireMcpErrorCode', () => {
  it('accepts only the expected typed MCP error', () => {
    expect(() =>
      requireMcpErrorCode(
        new McpError(ErrorCode.InvalidParams, 'Unknown resource'),
        ErrorCode.InvalidParams,
        'resources/read',
      ),
    ).not.toThrow();
  });

  it.each([new McpError(ErrorCode.InternalError, 'Handler failed'), new Error('Unknown resource')])(
    'rejects any other failure outcome',
    (error) => {
      expect(() => requireMcpErrorCode(error, ErrorCode.InvalidParams, 'resources/read')).toThrow(
        'resources/read returned an unexpected error',
      );
    },
  );
});

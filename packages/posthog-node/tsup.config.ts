import { createLibConfig } from '../tsup.preset';

export default createLibConfig({
  external: ['@modelcontextprotocol/sdk', '@posthog/mcp', 'posthog-node'],
});

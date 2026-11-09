'use client';

import { OakFlex, OakHeading, OakP } from '@oaknational/oak-components';

import { CodeBlock } from './code-block.tsx';

const EXAMPLE_CONFIG = `{
  "mcpServers": {
    "oak": { "url": "https://mcp.thenational.academy/mcp" }
  }
}`;

export function HomeContent() {
  return (
    <OakFlex $flexDirection="column" $gap="spacing-16">
      <OakHeading tag="h1" $font={['heading-5', 'heading-4']}>
        Oak MCP server documentation
      </OakHeading>
      <OakP $font="body-1">
        Developer documentation for the Model Context Protocol server that gives AI tools access to
        Oak National Academy&apos;s curriculum. These pages are a placeholder while the content is
        written.
      </OakP>
      <OakHeading tag="h2" $font="heading-5">
        Connect a client
      </OakHeading>
      <OakP $font="body-1">
        Point an MCP client at the server with a configuration like this one.
      </OakP>
      <CodeBlock code={EXAMPLE_CONFIG} label="Example MCP client configuration" />
    </OakFlex>
  );
}

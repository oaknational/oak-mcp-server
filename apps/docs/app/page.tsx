'use client';

import { OakFlex, OakHeading, OakLink, OakP } from '@oaknational/oak-components';

import { CodeBlock } from '../components/code-block.tsx';

const EXAMPLE_CONFIG = `{
  "mcpServers": {
    "oak-curriculum": { "url": "https://mcp.thenational.academy/mcp" }
  }
}`;

export default function HomePage() {
  return (
    <OakFlex $flexDirection="column" $gap="spacing-24">
      <OakFlex $flexDirection="column" $gap="spacing-16">
        <OakHeading tag="h1" $font={['heading-5', 'heading-4']}>
          Oak MCP server
        </OakHeading>
        <OakP $font="body-1">
          The Oak MCP server gives AI tools access to Oak National Academy&apos;s curriculum through
          the Model Context Protocol. This site is a placeholder while the documentation is written.
        </OakP>
      </OakFlex>
      <OakFlex as="section" aria-labelledby="quick-start" $flexDirection="column" $gap="spacing-16">
        <OakHeading tag="h2" id="quick-start" $font="heading-5">
          Quick start
        </OakHeading>
        <OakP $font="body-1">
          Add the server to your MCP client&apos;s configuration. The exact file depends on the
          client.
        </OakP>
        <CodeBlock code={EXAMPLE_CONFIG} label="Example MCP client configuration" />
      </OakFlex>
      <OakFlex as="section" aria-labelledby="clients" $flexDirection="column" $gap="spacing-16">
        <OakHeading tag="h2" id="clients" $font="heading-5">
          Set up your AI client
        </OakHeading>
        <OakP $font="body-1">Step-by-step setup for each supported client is coming soon.</OakP>
      </OakFlex>
      <OakFlex as="section" aria-labelledby="data" $flexDirection="column" $gap="spacing-16">
        <OakHeading tag="h2" id="data" $font="heading-5">
          Data and licence
        </OakHeading>
        <OakP $font="body-1">The server is open source under the MIT licence.</OakP>
        <OakP $font="body-1">
          <OakLink href="https://github.com/oaknational/oak-mcp-server">
            Read the source on GitHub
          </OakLink>
        </OakP>
      </OakFlex>
    </OakFlex>
  );
}

import type { Metadata } from 'next';

import { CodeBlock } from '../../components/code-block.tsx';
import { Bullets, Code, Link, P, Page, Section } from '../../components/page.tsx';
import { ServerStatus } from '../../components/server-status.tsx';
import { HEALTH_URL, MCP_URL } from '../../components/site.ts';

export const metadata: Metadata = { title: 'Status and limits' };

const HEALTH_EXAMPLE = `curl ${HEALTH_URL}`;

export default function StatusAndLimitsPage() {
  return (
    <Page title="Status and limits">
      <Section id="status" title="Server status">
        <ServerStatus />
        <P>
          The health check is public and needs no sign-in. It answers <Code>200</Code> with JSON
          whose <Code>status</Code> is <Code>ok</Code> while the server is running. It doesn&apos;t
          check the services behind the server, so a tool can still fail while the health check is
          green.
        </P>
        <CodeBlock code={HEALTH_EXAMPLE} label="Health check request" />
      </Section>
      <Section id="address" title="A stable address">
        <P>
          The server URL, <Code>{MCP_URL}</Code>, stays the same. This documentation sits at the
          root of the same host, and the server keeps these paths:
        </P>
        <Bullets>
          <li>
            <Code>/mcp</Code> and everything under it
          </li>
          <li>
            <Code>/oauth/</Code> paths
          </li>
          <li>
            <Code>/.well-known/oauth-protected-resource</Code>, its <Code>/mcp</Code> form, and{' '}
            <Code>/.well-known/oauth-authorization-server</Code>
          </li>
          <li>
            <Code>/healthz</Code>
          </li>
        </Bullets>
      </Section>
      <Section id="limits" title="Limits">
        <Bullets>
          <li>
            Rate limits apply at the network edge, in front of the server. We don&apos;t publish
            fixed numbers. If you send too many requests, slow down and try again.
          </li>
          <li>
            The <Link href="/tools/#tool-get-rate-limit">Get Rate Limit</Link> tool reports the
            current rate-limit status.
          </li>
          <li>
            Download links from the <Link href="/tools/#tool-download-asset">Download Asset</Link>{' '}
            tool work for 5 minutes.
          </li>
          <li>
            The tools follow the Oak Curriculum API. When the API changes, the tools can change too.
            The <Link href="/tools/">Tools page</Link> is built from what the server serves.
          </li>
        </Bullets>
      </Section>
      <Section id="problems" title="Seeing a problem?">
        <P>
          <Link href="/support/">Tell us what happened</Link>, with your client, the time and what
          you asked for.
        </P>
      </Section>
    </Page>
  );
}

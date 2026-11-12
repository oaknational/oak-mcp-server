import type { Metadata } from 'next';

import { CodeBlock } from '../../components/code-block.tsx';
import { Bullets, Code, Link, P, Page, Section, Steps } from '../../components/page.tsx';
import { MCP_URL } from '../../components/site.ts';

export const metadata: Metadata = { title: 'Authentication' };

const METADATA_URL = 'https://mcp.thenational.academy/.well-known/oauth-protected-resource/mcp';

const METADATA_EXAMPLE = `curl ${METADATA_URL}`;

export default function AuthenticationPage() {
  return (
    <Page title="Authentication">
      <P>
        Anyone can use the server. When your client prompts you, it opens Oak&apos;s sign-in page in
        your browser, where you sign in or create an account. Your client then gets a token through
        OAuth. It never sees your password.
      </P>
      <Section id="how-it-works" title="How sign-in works">
        <P>The server follows the MCP authorisation spec, which is built on OAuth 2.1.</P>
        <Steps>
          <li>
            Your client sends a request to <Code>{MCP_URL}</Code> with no token. The server answers{' '}
            <Code>401</Code>, and its <Code>WWW-Authenticate</Code> header points to the
            server&apos;s protected resource metadata.
          </li>
          <li>The metadata names Oak&apos;s authorisation server.</li>
          <li>
            Your client registers itself with the authorisation server and runs the authorisation
            code flow with PKCE (<Code>S256</Code>). This is the step where you sign in.
          </li>
          <li>
            Your client sends the token in an <Code>Authorization: Bearer</Code> header on every
            request to the server.
          </li>
        </Steps>
        <CodeBlock code={METADATA_EXAMPLE} label="Protected resource metadata request" />
      </Section>
      <Section id="what-needs-sign-in" title="What needs sign-in">
        <Bullets>
          <li>
            Every request to <Code>/mcp</Code> needs a token.
          </li>
          <li>
            The health check at <Code>/mcp/healthz</Code> and the OAuth metadata under{' '}
            <Code>/.well-known/</Code> are public.
          </li>
          <li>
            Download links from the <Link href="/tools/#tool-download-asset">Download Asset</Link>{' '}
            tool open in a browser with no sign-in, and stop working after 5 minutes.
          </li>
        </Bullets>
      </Section>
      <Section id="sign-out" title="Signing out">
        <P>
          Remove Oak&apos;s server from your client, or use your client&apos;s sign-out option. In
          Claude Code, run <Code>/mcp</Code> and choose <strong>Clear authentication</strong>.
        </P>
      </Section>
      <Section id="troubleshooting" title="If sign-in fails">
        <Bullets>
          <li>Check your client supports OAuth for remote MCP servers.</li>
          <li>
            Check you used the full URL, ending in <Code>/mcp</Code>.
          </li>
          <li>
            Still stuck? <Link href="/support/">Get support</Link>.
          </li>
        </Bullets>
      </Section>
    </Page>
  );
}

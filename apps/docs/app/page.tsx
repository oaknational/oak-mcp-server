import { CodeBlock } from '../components/code-block.tsx';
import { CopyButton } from '../components/copy-button.tsx';
import { Bullets, Link, P, Page, Section } from '../components/page.tsx';
import { ServerStatus } from '../components/server-status.tsx';
import { MCP_URL, TEACHER_PAGE_URL } from '../components/site.ts';

export default function HomePage() {
  return (
    <Page title="Oak MCP server">
      <P>
        Connect your AI client to Oak&apos;s curriculum. The server lets an AI assistant search and
        read our lessons, units, quizzes and curriculum plans through the Model Context Protocol
        (MCP).
      </P>
      <P>
        Teaching, not building? <Link href={TEACHER_PAGE_URL}>Add Oak to your AI assistant</Link>{' '}
        with our steps for teachers.
      </P>
      <Section id="server-url" title="Server URL">
        <P>Add this URL to any client that supports remote MCP servers.</P>
        <CodeBlock code={MCP_URL} label="MCP server URL" />
        <CopyButton text={MCP_URL} label="Copy URL" />
      </Section>
      <Section id="status" title="Server status">
        <ServerStatus />
      </Section>
      <Section id="get-started" title="Get started">
        <Bullets>
          <li>
            <Link href="/connect/">Connect your client</Link> with our steps for Claude, ChatGPT,
            Cursor, VS Code and Claude Code.
          </li>
          <li>
            <Link href="/authentication/">See how sign-in works</Link>. Your client signs you in
            with OAuth.
          </li>
          <li>
            <Link href="/examples/">Try an example</Link> once you&apos;re connected.
          </li>
          <li>
            <Link href="/tools/">Browse the tools</Link> the server offers.
          </li>
        </Bullets>
      </Section>
    </Page>
  );
}

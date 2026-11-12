import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { CodeBlock } from '../../components/code-block.tsx';
import { ConnectTabs, type ClientTab } from '../../components/connect-tabs.tsx';
import { CopyButton } from '../../components/copy-button.tsx';
import { Code, Link, P, Page, Section, Steps, SubHeading } from '../../components/page.tsx';
import { MCP_URL, TEACHER_PAGE_URL } from '../../components/site.ts';

export const metadata: Metadata = { title: 'Connect your client' };

const SERVER_NAME = 'oak-curriculum';

const CURSOR_CONFIG = JSON.stringify({ mcpServers: { [SERVER_NAME]: { url: MCP_URL } } }, null, 2);

const VS_CODE_CONFIG = JSON.stringify(
  { servers: { [SERVER_NAME]: { type: 'http', url: MCP_URL } } },
  null,
  2,
);

const CLAUDE_CODE_COMMAND = `claude mcp add --transport http ${SERVER_NAME} ${MCP_URL}`;

function Copyable({ code, label, button }: { code: string; label: string; button: string }) {
  return (
    <>
      <CodeBlock code={code} label={label} />
      <CopyButton text={code} label={button} />
    </>
  );
}

function SignIn({ client }: { client: string }) {
  return (
    <li>
      When {client} prompts you, it opens Oak&apos;s sign-in page. Sign in, or create an account,
      then approve the access {client} asks for.
    </li>
  );
}

function Source({ href, children }: { href: string; children: ReactNode }) {
  return (
    <P>
      These steps follow <Link href={href}>{children}</Link>. If your screen looks different, check
      there first.
    </P>
  );
}

const TABS: readonly ClientTab[] = [
  {
    id: 'claude',
    label: 'Claude',
    content: (
      <>
        <P>
          Claude calls these custom connectors. They work on every Claude plan, but a Free plan
          allows one. On Team and Enterprise plans, an Owner adds the connector for everyone.
        </P>
        <Steps>
          <li>
            Go to <strong>Customize</strong>, then <strong>Connectors</strong>.
          </li>
          <li>
            Select <strong>+ Add</strong>, then <strong>Add custom connector</strong>.
          </li>
          <li>
            Enter a name, such as Oak National Academy, and this URL, then select{' '}
            <strong>Continue</strong>.
            <Copyable code={MCP_URL} label="Server URL for Claude" button="Copy URL" />
          </li>
          <li>
            Check the authentication settings Claude found and select <strong>Continue</strong>.
          </li>
          <li>
            Under <strong>Authentication</strong>, choose <strong>Sign in now</strong>, then select{' '}
            <strong>Add</strong>.
          </li>
          <SignIn client="Claude" />
          <li>
            In a chat, select <strong>+</strong>, then <strong>Connectors</strong>, and turn on the
            connector you added.
          </li>
          <li>
            Open the <strong>Search and tools</strong> menu. Claude lists Oak&apos;s tools under the
            connector.
          </li>
        </Steps>
        <P>
          On a Team or Enterprise plan, the Owner goes to <strong>Organization settings</strong>,
          then <strong>Connectors</strong>, selects <strong>Add</strong>, then{' '}
          <strong>Custom</strong>, then <strong>Web</strong>. Members then find the connector under{' '}
          <strong>Customize</strong>, <strong>Connectors</strong> and select{' '}
          <strong>Connect</strong>.
        </P>
        <Source href="https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp">
          Claude&apos;s guide to custom connectors
        </Source>
      </>
    ),
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    content: (
      <>
        <P>
          ChatGPT adds the server as a plugin. Your account or workspace settings may stop you
          adding custom MCP servers. If so, ask your workspace admin.
        </P>
        <Steps>
          <li>
            Go to <Link href="https://chatgpt.com/plugins">ChatGPT Plugins</Link>.
          </li>
          <li>
            Select the plus button, then <strong>Add custom MCP server</strong>.
          </li>
          <li>Enter a name, such as Oak National Academy, and a short description.</li>
          <li>
            Under <strong>Connection</strong>, choose the public endpoint and enter this URL.
            <Copyable code={MCP_URL} label="Server URL for ChatGPT" button="Copy URL" />
          </li>
          <li>
            Choose OAuth for authentication. Read the risk warning, select{' '}
            <strong>I understand and want to continue</strong>, then select{' '}
            <strong>Create as a plugin</strong>.
          </li>
          <SignIn client="ChatGPT" />
          <li>
            ChatGPT lists the tools it found on the server. Check that Oak&apos;s tools are there.
          </li>
        </Steps>
        <P>
          To use Oak in a chat, start a new conversation, type <Code>@</Code> and choose the plugin.
        </P>
        <Source href="https://developers.openai.com/apps-sdk/deploy/connect-chatgpt">
          OpenAI&apos;s guide to connecting from ChatGPT
        </Source>
      </>
    ),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    content: (
      <>
        <Steps>
          <li>
            Open <Code>~/.cursor/mcp.json</Code> to use Oak in every project, or{' '}
            <Code>.cursor/mcp.json</Code> in one project. Create the file if it isn&apos;t there.
          </li>
          <li>
            Add Oak&apos;s server. If the file already has an <Code>mcpServers</Code> object, add
            the <Code>{SERVER_NAME}</Code> entry to it.
            <Copyable
              code={CURSOR_CONFIG}
              label="Cursor mcp.json configuration"
              button="Copy configuration"
            />
          </li>
          <SignIn client="Cursor" />
          <li>
            Open <strong>Customize</strong> in the sidebar and check the Oak server is turned on. In
            a chat, Cursor lists Oak&apos;s tools under <strong>Available Tools</strong>.
          </li>
        </Steps>
        <P>
          If the server doesn&apos;t connect, open the Output panel, choose{' '}
          <strong>MCP Logs</strong> and look for a connection or sign-in error.
        </P>
        <Source href="https://cursor.com/docs/context/mcp">Cursor&apos;s MCP guide</Source>
      </>
    ),
  },
  {
    id: 'vs-code',
    label: 'VS Code',
    content: (
      <>
        <P>You need GitHub Copilot turned on in VS Code.</P>
        <Steps>
          <li>
            Open the Command Palette and run <strong>MCP: Add Server</strong>.
          </li>
          <li>
            Choose <strong>HTTP (HTTP or Server-Sent Events)</strong> and enter this URL.
            <Copyable code={MCP_URL} label="Server URL for VS Code" button="Copy URL" />
          </li>
          <li>
            Enter <Code>{SERVER_NAME}</Code> as the server ID.
          </li>
          <li>
            Choose <strong>Global</strong>, then <strong>Copilot Global</strong>, to use Oak in
            every workspace.
          </li>
          <li>Read any trust request for the server, and accept it if you&apos;re happy to.</li>
          <SignIn client="VS Code" />
          <li>
            Run <strong>Chat: Open Customizations</strong> and choose <strong>MCP Servers</strong>.
            Oak&apos;s server is listed there. Ask Copilot something that needs Oak, such as
            &quot;List the key stages Oak covers&quot;, then expand the tool call to see which of
            Oak&apos;s tools it used.
          </li>
        </Steps>
        <SubHeading>Prefer a file?</SubHeading>
        <P>
          Run <strong>MCP: Open User Configuration</strong> and add Oak&apos;s server.
        </P>
        <Copyable
          code={VS_CODE_CONFIG}
          label="VS Code mcp.json configuration"
          button="Copy configuration"
        />
        <Source href="https://code.visualstudio.com/docs/copilot/customization/mcp-servers">
          VS Code&apos;s guide to MCP servers
        </Source>
      </>
    ),
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    content: (
      <>
        <Steps>
          <li>
            In your terminal, add the server.
            <Copyable
              code={CLAUDE_CODE_COMMAND}
              label="Claude Code command"
              button="Copy command"
            />
          </li>
          <li>
            Start Claude Code and run <Code>/mcp</Code>. Choose the <Code>{SERVER_NAME}</Code>{' '}
            server to sign in.
          </li>
          <SignIn client="Claude Code" />
          <li>
            Run <Code>/mcp</Code> again. The server shows a tick and the number of Oak&apos;s tools
            it found. From a shell, <Code>claude mcp get {SERVER_NAME}</Code> shows the same server.
          </li>
        </Steps>
        <P>
          To sign out, run <Code>/mcp</Code> and choose <strong>Clear authentication</strong>.
        </P>
        <Source href="https://code.claude.com/docs/en/mcp">Claude Code&apos;s MCP guide</Source>
      </>
    ),
  },
];

export default function ConnectPage() {
  return (
    <Page title="Connect your client">
      <P>
        Anyone can use the server. Pick your client and follow its steps. Each one adds the server,
        signs you in, then shows you Oak&apos;s tools. Teachers using ChatGPT or Claude can{' '}
        <Link href={TEACHER_PAGE_URL}>add Oak with our steps for teachers</Link> instead.
      </P>
      <Section id="clients" title="Choose your client">
        <ConnectTabs tabs={TABS} label="AI clients" />
      </Section>
      <Section id="other-clients" title="Using another client?">
        <P>
          Any client that supports remote MCP servers over streamable HTTP and OAuth can connect.
          Give it this URL and follow its sign-in steps.
        </P>
        <Copyable code={MCP_URL} label="Server URL" button="Copy URL" />
        <P>
          <Link href="/authentication/">See how sign-in works</Link> if your client needs details.
        </P>
      </Section>
    </Page>
  );
}

import type { Metadata } from 'next';

import { CodeBlock } from '../../components/code-block.tsx';
import { Bullets, Code, Link, P, Page, Section, Steps } from '../../components/page.tsx';
import { REPO_URL } from '../../components/site.ts';

export const metadata: Metadata = { title: 'Self-hosting' };

const README_URL = `${REPO_URL}/blob/main/apps/server/README.md`;

const ENV_EXAMPLE = `export OAK_API_KEY=your_oak_api_key
export ELASTICSEARCH_URL=https://your-elasticsearch-url
export ELASTICSEARCH_API_KEY=your_elasticsearch_api_key
export CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
export CLERK_SECRET_KEY=your_clerk_secret_key`;

const RUN_COMMANDS = `git clone ${REPO_URL}.git
cd oak-mcp-server
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @oaknational/mcp-server dev`;

export default function SelfHostingPage() {
  return (
    <Page title="Self-hosting">
      <P>
        You don&apos;t need to host the server to use it. Run your own copy if you want to change
        it, test against it, or contribute. These steps come from the{' '}
        <Link href={README_URL}>server&apos;s README</Link>, which has the full detail.
      </P>
      <Section id="you-need" title="What you need">
        <Bullets>
          <li>Node.js 24 and pnpm</li>
          <li>
            an Oak Curriculum API key from the{' '}
            <Link href="https://open-api.thenational.academy/">Oak Open Curriculum API</Link>
          </li>
          <li>
            an Elasticsearch URL and API key for the search tools. The server won&apos;t start
            without them.
          </li>
          <li>Clerk keys, so people can sign in to your copy</li>
        </Bullets>
      </Section>
      <Section id="run" title="Run it locally">
        <Steps>
          <li>
            Set your keys. <Code>apps/server/.env.example</Code> lists every variable.
            <CodeBlock code={ENV_EXAMPLE} label="Environment variables" />
          </li>
          <li>
            Clone the repository, install, build the workspace, and start the server.
            <CodeBlock code={RUN_COMMANDS} label="Commands to run the server" />
          </li>
          <li>
            To check it&apos;s running, open <Code>http://localhost:3333/healthz</Code>. It answers
            with a <Code>status</Code> of <Code>ok</Code>.
          </li>
          <li>
            Point your client at <Code>http://localhost:3333/mcp</Code>.
          </li>
        </Steps>
      </Section>
      <Section id="deploy" title="Deploy it">
        <P>
          Run the server on a Node.js runtime with the same five variables set. The README lists the
          optional ones, such as <Code>LOG_LEVEL</Code> and <Code>SENTRY_MODE</Code>.
        </P>
        <P>
          The README also describes <Code>DANGEROUSLY_DISABLE_AUTH</Code>. It&apos;s a flag for
          local development only. Never set it in a deployment. On a Vercel deployment, the server
          refuses to start with it.
        </P>
      </Section>
    </Page>
  );
}

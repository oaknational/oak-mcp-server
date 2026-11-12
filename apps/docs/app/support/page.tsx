import type { Metadata } from 'next';

import { Bullets, Link, P, Page, Section } from '../../components/page.tsx';
import {
  NEW_ISSUE_URL,
  OAK_HELP_URL,
  SECURITY_REPORT_URL,
  TEACHER_PAGE_URL,
} from '../../components/site.ts';

export const metadata: Metadata = { title: 'Support' };

export default function SupportPage() {
  return (
    <Page title="Support">
      <Section id="teachers" title="Help for teachers">
        <P>
          Using Oak in ChatGPT or Claude? Start with our{' '}
          <Link href={TEACHER_PAGE_URL}>steps for teachers</Link>, then see the help centre:
        </P>
        <Bullets>
          <li>
            <Link href="https://support.thenational.academy/using-oak-mcp-claude">
              Using Oak in Claude
            </Link>
          </li>
          <li>
            <Link href="https://support.thenational.academy/using-oak-mcp-openai">
              Using Oak in ChatGPT
            </Link>
          </li>
          <li>
            <Link href={OAK_HELP_URL}>Oak&apos;s help centre</Link>
          </li>
        </Bullets>
      </Section>
      <Section id="developers" title="Help for developers">
        <P>
          Found a bug, or need a feature? <Link href={NEW_ISSUE_URL}>Open an issue on GitHub</Link>.
          Tell us:
        </P>
        <Bullets>
          <li>which client you use, and its version</li>
          <li>what you did, what you expected, and what happened</li>
          <li>the time it happened, if a request failed</li>
        </Bullets>
        <P>Don&apos;t include tokens, keys or anyone&apos;s personal data. Issues are public.</P>
      </Section>
      <Section id="security" title="Report a security issue">
        <P>
          Don&apos;t report a security issue in public.{' '}
          <Link href={SECURITY_REPORT_URL}>Report it privately on GitHub</Link>. Only the
          maintainers can see your report.
        </P>
      </Section>
      <Section id="api" title="Questions about the Oak API">
        <P>
          The server gets its content from the{' '}
          <Link href="https://open-api.thenational.academy/">Oak Open Curriculum API</Link>. Its
          documentation covers the data itself.
        </P>
      </Section>
    </Page>
  );
}

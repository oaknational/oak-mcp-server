import type { Metadata } from 'next';

import { Bullets, Link, P, Page, Section } from '../../components/page.tsx';

export const metadata: Metadata = { title: 'Responsible use' };

export default function ResponsibleUsePage() {
  return (
    <Page title="Responsible use">
      <P>
        The server gives your AI assistant Oak&apos;s curriculum. You decide what reaches your
        classroom.
      </P>
      <Section id="personal-data" title="Keep personal data out">
        <P>
          Don&apos;t enter pupil names, personal information, safeguarding details or confidential
          school data into an AI assistant. The server doesn&apos;t need any of it to find
          curriculum content.
        </P>
      </Section>
      <Section id="check-answers" title="Check what your assistant says">
        <P>
          The server returns Oak&apos;s content. Your assistant then writes its answer, and it can
          misread, shorten or change what it was given. Before you use an answer in class:
        </P>
        <Bullets>
          <li>check it against the lesson on Oak&apos;s website</li>
          <li>adapt it for your pupils, because you know them best</li>
          <li>keep links and attribution, so others can find the source</li>
        </Bullets>
      </Section>
      <Section id="your-provider" title="Your AI provider's rules apply">
        <P>
          Your AI provider&apos;s terms, plan limits and data policies apply to everything you type
          into its assistant. Check them, and your school&apos;s own AI policy, before you start.
        </P>
      </Section>
      <Section id="reuse" title="Reuse content fairly">
        <P>
          Curriculum content comes with licence terms and attribution requirements.{' '}
          <Link href="/data-and-licensing/">Read our data and licensing page</Link> before you share
          or publish anything built from it.
        </P>
      </Section>
    </Page>
  );
}

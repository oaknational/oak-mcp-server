import type { Metadata } from 'next';

import { Link, P, Page, Section } from '../../components/page.tsx';
import { loadReference } from '../../reference/load.ts';

export const metadata: Metadata = { title: 'Examples' };

interface Example {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
  readonly tools: readonly string[];
}

const EXAMPLES: readonly Example[] = [
  {
    id: 'find-lessons',
    title: 'Find lessons on a topic',
    prompt: 'Find key stage 3 science lessons on photosynthesis.',
    tools: ['search'],
  },
  {
    id: 'topic-across-years',
    title: 'See how a topic builds across years',
    prompt: 'How does Oak teach fractions from Year 1 to Year 6?',
    tools: ['explore-topic', 'get-thread-progressions'],
  },
  {
    id: 'prior-knowledge',
    title: 'Check prior knowledge',
    prompt:
      'What should pupils already know before starting the Year 9 unit on quadratic equations?',
    tools: ['get-prior-knowledge-graph'],
  },
  {
    id: 'misconceptions',
    title: 'Plan for misconceptions',
    prompt: 'What do pupils often get wrong about electric circuits, and how can I respond?',
    tools: ['get-misconception-graph'],
  },
  {
    id: 'quiz',
    title: 'Get a lesson quiz',
    prompt: 'Show me the starter and exit quizzes for that lesson.',
    tools: ['get-lessons-quiz'],
  },
  {
    id: 'download',
    title: 'Download lesson resources',
    prompt: 'Give me a download link for the slide deck.',
    tools: ['get-lessons-assets', 'download-asset'],
  },
];

function toolTitles(): ReadonlyMap<string, string> {
  return new Map(loadReference().tools.map((tool) => [tool.name, tool.title ?? tool.name]));
}

function titleOf(titles: ReadonlyMap<string, string>, name: string): string {
  const title = titles.get(name);
  if (title === undefined)
    throw new Error(`The examples name ${name}, which the server does not serve`);
  return title;
}

export default function ExamplesPage() {
  const titles = toolTitles();
  return (
    <Page title="Examples">
      <P>
        Once you&apos;re connected, ask in your own words. Your assistant picks the tools. Under
        each example are the tools it&apos;s likely to use, so you can see what each one returns.
      </P>
      <P>
        Start a session by asking your assistant to read the{' '}
        <Link href="/tools/#tool-get-curriculum-model">
          {titleOf(titles, 'get-curriculum-model')}
        </Link>
        . It explains how our curriculum fits together and helps the assistant choose the right
        tools.
      </P>
      {EXAMPLES.map((example) => (
        <Section key={example.id} id={example.id} title={example.title}>
          <P>Ask: &quot;{example.prompt}&quot;</P>
          <P>
            Likely tools:{' '}
            {example.tools.map((name, index) => (
              <span key={name}>
                {index > 0 && ', '}
                <Link href={`/tools/#tool-${name}`}>{titleOf(titles, name)}</Link>
              </span>
            ))}
          </P>
        </Section>
      ))}
      <Section id="check-answers" title="Check what you get">
        <P>
          The server returns Oak&apos;s content, but your assistant writes the answer. Check it
          against the lesson before you use it in class.{' '}
          <Link href="/responsible-use/">Read our guidance on responsible use</Link>.
        </P>
      </Section>
    </Page>
  );
}

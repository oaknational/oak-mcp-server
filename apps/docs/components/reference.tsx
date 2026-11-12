'use client';

import { OakFlex, OakHeading, OakLink, OakP, parseColor } from '@oaknational/oak-components';
import { Fragment, type ReactNode } from 'react';
import styled from 'styled-components';

import type {
  PromptEntry,
  ResourceEntry,
  ResourceTemplateEntry,
  ToolAnnotations,
  ToolEntry,
} from '../reference/types.ts';
import { CodeBlock } from './code-block.tsx';

const InlineCode = styled.code`
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.95em;
  overflow-wrap: anywhere;
`;

const List = styled.ul`
  margin: 0;
  padding-left: 24px;
  font-size: 1rem;
  line-height: 1.5;
`;

const Facts = styled.dl`
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 0;

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0;
    min-width: 0;
  }
`;

const Entry = styled.section`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 24px;
  border-top: 2px solid ${parseColor('border-neutral')};
`;

function withInlineCode(text: string): ReactNode[] {
  return text
    .split(/(`[^`]+`)/)
    .map((part, index) =>
      part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
        <InlineCode key={index}>{part.slice(1, -1)}</InlineCode>
      ) : (
        part
      ),
    );
}

interface ProseBlock {
  readonly bullets: boolean;
  readonly lines: string[];
}

function parseProseBlocks(text: string): ProseBlock[] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const groups: ProseBlock[] = [];
      for (const line of block.split('\n')) {
        const bullets = /^\s*[-*] /.test(line);
        const last = groups.at(-1);
        const content = bullets ? line.replace(/^\s*[-*] /, '') : line;
        if (last?.bullets === bullets) last.lines.push(content);
        else groups.push({ bullets, lines: [content] });
      }
      return groups;
    });
}

function Prose({ text }: { readonly text: string | undefined }) {
  if (text === undefined || text.trim() === '') return null;
  const blocks = parseProseBlocks(text);
  return (
    <>
      {blocks.map((group, index) =>
        group.bullets ? (
          <List key={index}>
            {group.lines.map((line, item) => (
              <li key={item}>{withInlineCode(line)}</li>
            ))}
          </List>
        ) : (
          <OakP key={index} $font="body-1">
            {withInlineCode(group.lines.join(' '))}
          </OakP>
        ),
      )}
    </>
  );
}

const HINTS = [
  ['readOnlyHint', 'Read only'],
  ['destructiveHint', 'Destructive'],
  ['idempotentHint', 'Idempotent'],
  ['openWorldHint', 'Open world'],
] as const satisfies readonly (readonly [keyof ToolAnnotations, string])[];

function Annotations({ annotations }: { readonly annotations: ToolAnnotations | undefined }) {
  const present = HINTS.filter(([key]) => annotations?.[key] !== undefined);
  if (present.length === 0) return <OakP $font="body-1">The server sets no annotations.</OakP>;
  return (
    <Facts>
      {present.map(([key, label]) => (
        <Fragment key={key}>
          <dt>{label}</dt>
          <dd>{annotations?.[key] === true ? 'Yes' : 'No'}</dd>
        </Fragment>
      ))}
    </Facts>
  );
}

interface Contents {
  readonly id: string;
  readonly label: string;
}

function OnThisPage({ items }: { readonly items: readonly Contents[] }) {
  return (
    <nav aria-labelledby="on-this-page">
      <OakFlex $flexDirection="column" $gap="spacing-8">
        <OakHeading tag="h2" id="on-this-page" $font="heading-6">
          On this page
        </OakHeading>
        <List>
          {items.map((item) => (
            <li key={item.id}>
              <OakLink href={`#${item.id}`}>{item.label}</OakLink>
            </li>
          ))}
        </List>
      </OakFlex>
    </nav>
  );
}

function PageIntro({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <OakFlex $flexDirection="column" $gap="spacing-16">
      <OakHeading tag="h1" $font={['heading-5', 'heading-4']}>
        {title}
      </OakHeading>
      {children}
    </OakFlex>
  );
}

const anchor = (prefix: string, name: string): string =>
  `${prefix}-${name.replace(/[^A-Za-z0-9_-]+/g, '-')}`;

export function ToolsReference({ tools }: { readonly tools: readonly ToolEntry[] }) {
  return (
    <OakFlex $flexDirection="column" $gap="spacing-32">
      <PageIntro title="Tools">
        <OakP $font="body-1">
          The server offers {tools.length} tools. This page is generated from the server&apos;s own
          tool list each time the docs are built.
        </OakP>
      </PageIntro>
      <OnThisPage
        items={tools.map((tool) => ({
          id: anchor('tool', tool.name),
          label: tool.title ?? tool.name,
        }))}
      />
      {tools.map((tool) => {
        const id = anchor('tool', tool.name);
        return (
          <Entry key={tool.name} aria-labelledby={id}>
            <OakHeading tag="h2" id={id} $font="heading-5">
              {tool.title ?? tool.name}
            </OakHeading>
            <Facts>
              <dt>Tool name</dt>
              <dd>
                <InlineCode>{tool.name}</InlineCode>
              </dd>
            </Facts>
            <Prose text={tool.description} />
            <OakHeading tag="h3" $font="heading-6">
              Annotations
            </OakHeading>
            <Annotations annotations={tool.annotations} />
            <OakHeading tag="h3" $font="heading-6">
              Input schema
            </OakHeading>
            <CodeBlock
              code={JSON.stringify(tool.inputSchema, null, 2)}
              label={`Input schema for ${tool.name}`}
            />
          </Entry>
        );
      })}
    </OakFlex>
  );
}

type AnyResource = ResourceEntry | ResourceTemplateEntry;

const resourceAddress = (resource: AnyResource): string =>
  'uri' in resource ? resource.uri : resource.uriTemplate;

function ResourceSection({ resource }: { readonly resource: AnyResource }) {
  const address = resourceAddress(resource);
  const id = anchor('resource', resource.name);
  return (
    <Entry aria-labelledby={id}>
      <OakHeading tag="h2" id={id} $font="heading-5">
        {resource.title ?? resource.name}
      </OakHeading>
      <Facts>
        <dt>{'uri' in resource ? 'URI' : 'URI template'}</dt>
        <dd>
          <InlineCode>{address}</InlineCode>
        </dd>
        <dt>Name</dt>
        <dd>
          <InlineCode>{resource.name}</InlineCode>
        </dd>
        {resource.mimeType === undefined ? null : (
          <>
            <dt>Media type</dt>
            <dd>
              <InlineCode>{resource.mimeType}</InlineCode>
            </dd>
          </>
        )}
      </Facts>
      <Prose text={resource.description} />
    </Entry>
  );
}

export function ResourcesReference({
  resources,
  resourceTemplates,
}: {
  readonly resources: readonly ResourceEntry[];
  readonly resourceTemplates: readonly ResourceTemplateEntry[];
}) {
  const all: readonly AnyResource[] = [...resources, ...resourceTemplates];
  return (
    <OakFlex $flexDirection="column" $gap="spacing-32">
      <PageIntro title="Resources">
        <OakP $font="body-1">
          The server offers {all.length} resources. This page is generated from the server&apos;s
          own resource list each time the docs are built.
        </OakP>
      </PageIntro>
      <OnThisPage
        items={all.map((resource) => ({
          id: anchor('resource', resource.name),
          label: resource.title ?? resource.name,
        }))}
      />
      {all.map((resource) => (
        <ResourceSection key={resourceAddress(resource)} resource={resource} />
      ))}
    </OakFlex>
  );
}

export function PromptsReference({ prompts }: { readonly prompts: readonly PromptEntry[] }) {
  return (
    <OakFlex $flexDirection="column" $gap="spacing-32">
      <PageIntro title="Prompts">
        <OakP $font="body-1">
          {prompts.length === 0
            ? 'The server offers no prompts. Its workflow guidance is served as resources instead.'
            : `The server offers ${String(prompts.length)} prompts.`}{' '}
          This page is generated from the server&apos;s own prompt list each time the docs are
          built.
        </OakP>
      </PageIntro>
      {prompts.map((prompt) => {
        const id = anchor('prompt', prompt.name);
        return (
          <Entry key={prompt.name} aria-labelledby={id}>
            <OakHeading tag="h2" id={id} $font="heading-5">
              {prompt.title ?? prompt.name}
            </OakHeading>
            <Facts>
              <dt>Prompt name</dt>
              <dd>
                <InlineCode>{prompt.name}</InlineCode>
              </dd>
            </Facts>
            <Prose text={prompt.description} />
            {prompt.arguments === undefined || prompt.arguments.length === 0 ? null : (
              <>
                <OakHeading tag="h3" $font="heading-6">
                  Arguments
                </OakHeading>
                <Facts>
                  {prompt.arguments.map((argument) => (
                    <Fragment key={argument.name}>
                      <dt>
                        <InlineCode>{argument.name}</InlineCode>
                        {argument.required === true ? ' (required)' : ''}
                      </dt>
                      <dd>{argument.description ?? ''}</dd>
                    </Fragment>
                  ))}
                </Facts>
              </>
            )}
          </Entry>
        );
      })}
    </OakFlex>
  );
}

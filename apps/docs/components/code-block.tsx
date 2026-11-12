'use client';

import { parseColor } from '@oaknational/oak-components';
import styled from 'styled-components';

const Pre = styled.pre`
  margin: 0;
  padding: 16px;
  overflow-x: auto;
  max-width: 100%;
  box-sizing: border-box;
  background: ${parseColor('bg-neutral')};
  color: ${parseColor('text-primary')};
  border: 2px solid ${parseColor('border-neutral-stronger')};
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 1rem;
  line-height: 1.5;
  overflow-wrap: normal;
  white-space: pre;
`;

interface CodeBlockProps {
  readonly code: string;
  readonly label: string;
}

export function CodeBlock({ code, label }: CodeBlockProps) {
  return (
    <Pre tabIndex={0} role="region" aria-label={label}>
      <code>{code}</code>
    </Pre>
  );
}

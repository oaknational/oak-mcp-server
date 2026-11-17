'use client';

import { OakFlex, OakHeading, OakLink, OakP } from '@oaknational/oak-components';
import type { ReactNode } from 'react';
import styled from 'styled-components';

export function Page({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <OakFlex $flexDirection="column" $gap="spacing-32">
      <OakHeading tag="h1" $font={['heading-5', 'heading-4']}>
        {title}
      </OakHeading>
      {children}
    </OakFlex>
  );
}

interface SectionProps {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}

export function Section({ id, title, children }: SectionProps) {
  return (
    <OakFlex as="section" aria-labelledby={id} $flexDirection="column" $gap="spacing-16">
      <OakHeading tag="h2" id={id} $font="heading-5">
        {title}
      </OakHeading>
      {children}
    </OakFlex>
  );
}

export function SubHeading({ children }: { readonly children: ReactNode }) {
  return (
    <OakHeading tag="h3" $font="heading-6">
      {children}
    </OakHeading>
  );
}

export function P({ children }: { readonly children: ReactNode }) {
  return <OakP $font="body-1">{children}</OakP>;
}

// OakLink pads itself by 4px inside a -4px margin, so its box covers punctuation that follows it
// and axe cannot resolve that text's background.
const LinkWrap = styled.span`
  & > a {
    padding: 0 !important;
    margin: 0 !important;
  }
`;

export function Link({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <LinkWrap>
      <OakLink href={href}>{children}</OakLink>
    </LinkWrap>
  );
}

export const Code = styled.code`
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.95em;
  overflow-wrap: anywhere;
`;

const listStyle = `
  margin: 0;
  padding-left: 24px;
  font-size: 1rem;
  line-height: 1.5;

  li + li {
    margin-top: 8px;
  }
`;

export const Bullets = styled.ul`
  ${listStyle}
`;

export const Steps = styled.ol`
  ${listStyle}
`;

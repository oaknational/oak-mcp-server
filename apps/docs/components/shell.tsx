'use client';

import { OakBox, OakFlex, OakLink, OakMaxWidth, OakP } from '@oaknational/oak-components';
import type { ReactNode } from 'react';
import styled from 'styled-components';

import { GlobalStyle } from './global-style.tsx';
import { ThemeController } from './theme.tsx';
import { ThemeToggle } from './theme-toggle.tsx';

const SkipLink = styled.a`
  position: absolute;
  left: 8px;
  top: -100px;
  padding: 12px 16px;
  background: #222;
  color: #fff;
  border-radius: 4px;
  z-index: 100;

  &:focus {
    top: 8px;
  }
`;

const NavList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const NavLink = styled.a`
  display: inline-block;
  padding: 8px 0;
  min-height: 24px;
  color: inherit;
  font-weight: 600;
`;

const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: 'https://github.com/oaknational/oak-mcp-server', label: 'Source on GitHub' },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  return (
    <ThemeController>
      <GlobalStyle />
      <SkipLink href="#main">Skip to main content</SkipLink>
      <OakBox
        as="header"
        $pv="spacing-16"
        $ph="spacing-16"
        $bb="border-solid-m"
        $borderColor="border-neutral"
      >
        <OakMaxWidth $maxWidth="spacing-960">
          <OakFlex
            $flexWrap="wrap"
            $justifyContent="space-between"
            $alignItems="center"
            $gap="spacing-16"
          >
            <OakBox $font="heading-7">
              <NavLink href="/">Oak MCP server docs</NavLink>
            </OakBox>
            <OakFlex
              as="nav"
              aria-label="Main"
              $flexWrap="wrap"
              $alignItems="center"
              $gap="spacing-24"
            >
              <NavList>
                {NAV_ITEMS.map((item) => (
                  <li key={item.href}>
                    <NavLink href={item.href}>{item.label}</NavLink>
                  </li>
                ))}
              </NavList>
              <ThemeToggle />
            </OakFlex>
          </OakFlex>
        </OakMaxWidth>
      </OakBox>
      <OakBox as="main" id="main" tabIndex={-1} $pv="spacing-32" $ph="spacing-16">
        <OakMaxWidth $maxWidth="spacing-960">{children}</OakMaxWidth>
      </OakBox>
      <OakBox
        as="footer"
        $pv="spacing-32"
        $ph="spacing-16"
        $bt="border-solid-m"
        $borderColor="border-neutral"
      >
        <OakMaxWidth $maxWidth="spacing-960">
          <OakP $font="body-2">
            Built by Oak National Academy.{' '}
            <OakLink href="https://www.thenational.academy/">Visit Oak National Academy</OakLink>
          </OakP>
        </OakMaxWidth>
      </OakBox>
    </ThemeController>
  );
}

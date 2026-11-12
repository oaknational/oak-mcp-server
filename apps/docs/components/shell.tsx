'use client';

import {
  OakBox,
  OakFlex,
  OakLink,
  OakMaxWidth,
  OakP,
  OakSmallSecondaryToggleButton,
  parseColor,
} from '@oaknational/oak-components';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import styled, { createGlobalStyle } from 'styled-components';

import { ThemeController, useThemeControls } from './theme.tsx';

const background = parseColor('bg-primary');
const text = parseColor('text-primary');
const ring = parseColor('border-primary');

const GlobalStyle = createGlobalStyle`
  html {
    -webkit-text-size-adjust: 100%;
  }

  body {
    margin: 0;
    background: ${(props) => background(props)};
    color: ${(props) => text(props)};
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  :focus-visible {
    outline: 3px solid ${(props) => ring(props)} !important;
    outline-offset: 3px !important;
    box-shadow: 0 0 0 6px ${(props) => background(props)};
  }
`;

function ThemeToggle() {
  const { theme, toggle } = useThemeControls();
  return (
    <OakSmallSecondaryToggleButton
      type="button"
      toggleOn={theme === 'dark'}
      aria-pressed={theme === 'dark'}
      onClick={toggle}
    >
      Dark theme
    </OakSmallSecondaryToggleButton>
  );
}

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
  { href: '/connect/', label: 'Connect' },
  { href: '/authentication/', label: 'Authentication' },
  { href: '/examples/', label: 'Examples' },
  { href: '/tools/', label: 'Tools' },
  { href: '/resources/', label: 'Resources' },
  { href: '/prompts/', label: 'Prompts' },
] as const;

const GUIDE_LINKS = [
  { href: '/data-and-licensing/', label: 'Data and licensing' },
  { href: '/responsible-use/', label: 'Responsible use' },
  { href: '/status-and-limits/', label: 'Status and limits' },
  { href: '/self-hosting/', label: 'Self-hosting' },
  { href: '/accessibility/', label: 'Accessibility statement' },
  { href: '/support/', label: 'Support' },
] as const;

const withSlash = (path: string): string => (path.endsWith('/') ? path : `${path}/`);

const FOOTER_LINKS = [
  { href: 'https://github.com/oaknational/oak-mcp-server', label: 'Source on GitHub' },
  { href: 'https://github.com/oaknational/oak-mcp-server/issues', label: 'Report a bug' },
  { href: 'https://www.thenational.academy/', label: 'About Oak National Academy' },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const current = withSlash(usePathname());
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
                    <NavLink
                      href={item.href}
                      aria-current={item.href === current ? 'page' : undefined}
                    >
                      {item.label}
                    </NavLink>
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
          <OakFlex $flexDirection="column" $gap="spacing-16">
            <OakFlex as="nav" aria-label="Guides">
              <NavList>
                {GUIDE_LINKS.map((item) => (
                  <li key={item.href}>
                    <OakLink
                      href={item.href}
                      aria-current={item.href === current ? 'page' : undefined}
                    >
                      {item.label}
                    </OakLink>
                  </li>
                ))}
              </NavList>
            </OakFlex>
            <NavList>
              {FOOTER_LINKS.map((item) => (
                <li key={item.href}>
                  <OakLink href={item.href}>{item.label}</OakLink>
                </li>
              ))}
            </NavList>
            <OakP $font="body-2">Built by Oak National Academy.</OakP>
          </OakFlex>
        </OakMaxWidth>
      </OakBox>
    </ThemeController>
  );
}

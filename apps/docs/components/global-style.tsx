'use client';

import { parseColor } from '@oaknational/oak-components';
import { createGlobalStyle } from 'styled-components';

const background = parseColor('bg-primary');
const text = parseColor('text-primary');
const ring = parseColor('border-primary');

export const GlobalStyle = createGlobalStyle`
  html {
    -webkit-text-size-adjust: 100%;
  }

  body {
    margin: 0;
    background: ${(props) => background(props)};
    color: ${(props) => text(props)};
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  :focus-visible {
    outline: 3px solid ${(props) => ring(props)} !important;
    outline-offset: 3px !important;
    box-shadow: 0 0 0 6px ${(props) => background(props)};
  }
`;

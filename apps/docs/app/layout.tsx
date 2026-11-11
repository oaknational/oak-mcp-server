import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Shell } from '../components/shell.tsx';
import { StyleRegistry } from '../components/style-registry.tsx';

export const metadata: Metadata = {
  title: { default: 'Oak MCP server docs', template: '%s | Oak MCP server docs' },
  description: "Developer documentation for Oak National Academy's MCP server.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body>
        <StyleRegistry>
          <Shell>{children}</Shell>
        </StyleRegistry>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';

import { ToolsReference } from '../../components/reference.tsx';
import { loadReference } from '../../reference/load.ts';

export const metadata: Metadata = { title: 'Tools' };

export default function ToolsPage() {
  return <ToolsReference tools={loadReference().tools} />;
}

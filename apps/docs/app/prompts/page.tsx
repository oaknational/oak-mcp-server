import type { Metadata } from 'next';

import { PromptsReference } from '../../components/reference.tsx';
import { loadReference } from '../../reference/load.ts';

export const metadata: Metadata = { title: 'Prompts' };

export default function PromptsPage() {
  return <PromptsReference prompts={loadReference().prompts} />;
}

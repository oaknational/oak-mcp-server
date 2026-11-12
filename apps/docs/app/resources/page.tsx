import type { Metadata } from 'next';

import { ResourcesReference } from '../../components/reference.tsx';
import { loadReference } from '../../reference/load.ts';

export const metadata: Metadata = { title: 'Resources' };

export default function ResourcesPage() {
  const { resources, resourceTemplates } = loadReference();
  return <ResourcesReference resources={resources} resourceTemplates={resourceTemplates} />;
}

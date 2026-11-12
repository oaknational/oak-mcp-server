import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { REFERENCE_PATH } from '../reference/load.ts';
import { SERVED_SURFACE_PATH, toReference } from '../reference/surface.ts';

try {
  const reference = toReference(JSON.parse(await readFile(SERVED_SURFACE_PATH, 'utf8')));
  await mkdir(dirname(REFERENCE_PATH), { recursive: true });
  await writeFile(REFERENCE_PATH, `${JSON.stringify(reference, null, 2)}\n`);
  console.log(
    `Wrote the docs reference: ${String(reference.tools.length)} tools, ${String(
      reference.resources.length + reference.resourceTemplates.length,
    )} resources, ${String(reference.prompts.length)} prompts`,
  );
} catch (error) {
  console.error(
    'The docs build needs a valid apps/server/served-surface.json. Run pnpm surface:snapshot.',
    error,
  );
  process.exitCode = 1;
}

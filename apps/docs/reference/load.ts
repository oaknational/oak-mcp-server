import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Reference } from './types.ts';

export const REFERENCE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'generated',
  'reference.json',
);

export function loadReference(): Reference {
  try {
    return JSON.parse(readFileSync(REFERENCE_PATH, 'utf8')) as Reference;
  } catch (error) {
    throw new Error(
      'The docs reference is missing. Build the docs with: pnpm --filter @oaknational/mcp-docs build',
      { cause: error },
    );
  }
}

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { route, type VercelConfig } from '../edge-probes/vercel-routing.ts';

const repoRoot = join(import.meta.dirname, '../..');
const outDir = process.argv[2] ?? join(repoRoot, 'apps/docs/out');
const config = JSON.parse(
  readFileSync(join(repoRoot, 'apps/docs/vercel.json'), 'utf8'),
) as VercelConfig;

function entries(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? [path, ...entries(path)] : [path];
  });
}

if (!existsSync(outDir)) {
  console.error(
    `No docs export at ${outDir}. Build the docs first: pnpm --filter @oaknational/mcp-docs build`,
  );
  process.exit(1);
}

// Vercel serves a deployment's files before it applies rewrites, so an exported file at a
// rewritten path would answer instead of the server. Directories count too, because the docs
// export serves each page as an index.html at its directory's path.
const shadowed = entries(outDir)
  .map((path) => `/${relative(outDir, path).split(sep).join('/')}`)
  .filter((path) =>
    [path, `${path}/`].some((served) => route(config, served, () => false).kind === 'rewrite'),
  );

if (shadowed.length > 0) {
  console.error(
    `The docs export writes these paths, which apps/docs/vercel.json rewrites to the server:\n${shadowed.join('\n')}`,
  );
  process.exit(1);
}

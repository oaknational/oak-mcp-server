/**
 * Build-time copy of the Oak Open Curriculum Design System's runtime files
 * into `public/`.
 *
 * @remarks
 * The app serves the design system as ordinary static assets under
 * `/oak-ds/`. The package is a devDependency consumed at build/dev/test
 * time only (precedent: `@oaknational/oak-design-tokens`), so nothing
 * design-system-shaped enters the deployed dependency graph — only the
 * copied files do.
 *
 * Two constraints shape the copy:
 *
 * - **Package-relative layout is mirrored.** `url()` resolution in CSS is
 *   relative to the stylesheet, so `fonts/` and `assets/icons/` must sit
 *   where `colors_and_type.css` and `oak-icons.css` expect them.
 * - **The set is declared, not globbed.** {@link OAK_DS_MANIFEST} is the
 *   contract; the integration suite recomputes the stylesheet's real
 *   `@import` + `url()` closure against it, so a design-system change that
 *   widens the closure fails the build rather than shipping a page with a
 *   missing font or icon.
 *
 * Deliberately excluded: `brand.css` (outside the `styles.css` closure —
 * it is the white-label override contract, not the Oak identity) and
 * `oak-flat.generated.css` (design-sync's derived artefact).
 *
 * @packageDocumentation
 */

import { createRequire } from 'node:module';
import { cp, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { OAK_ASSETS_PUBLIC_DIRNAME, OAK_DS_PUBLIC_DIRNAME } from '../src/app/static-asset-paths.js';

/**
 * Atomically publish a staged directory onto its served destination.
 *
 * @remarks
 * A bare `rm` + multi-file copy leaves the destination absent or partial
 * for the whole copy window; a concurrently booting server (the boot
 * marker check) or a browser fetch landing in that window sees a broken
 * tree. Staging beside the destination and swapping via two `rename`
 * syscalls shrinks the absent window to the gap between them — POSIX
 * offers no true directory exchange, so this is the smallest window
 * available without a lock, small but NOT zero. Test suites never depend
 * on it: they read their own scratch roots via the `staticRoot` seam; the
 * residual window matters only to a hand-run server racing a hand-run
 * build.
 */
async function publishAtomically(staged: string, destination: string): Promise<void> {
  // Dot-prefixed like the staging dirs: express.static ignores dotfiles, so
  // a crash can strand transient dirs without ever serving them.
  const retired = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}-retired-${path.basename(staged)}`,
  );
  await rm(retired, { recursive: true, force: true });
  try {
    await rename(destination, retired);
  } catch (error) {
    // First publish: no destination to retire. Anything else (EBUSY,
    // EACCES, ENOTEMPTY from a concurrent publisher) must surface here,
    // not as an unrelated failure two steps later.
    const code =
      error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined;
    if (code !== 'ENOENT') {
      throw error;
    }
  }
  await rename(staged, destination);
  await rm(retired, { recursive: true, force: true });
}

/**
 * The declared runtime file set, package-relative.
 *
 * @remarks
 * `files` is exact-pinned: the integration suite asserts every file in the
 * copied `oak-ds/` tree is covered by an entry here, so an unnoticed
 * addition to the package cannot silently ride along. `directories` is
 * checked at directory granularity — icon sets grow benignly and pinning
 * 128 file names would break on every legitimate addition.
 */
export const OAK_DS_MANIFEST = {
  files: [
    'styles.css',
    'colors_and_type.css',
    'oak-icons.css',
    'components.css',
    'print.css',
    // The system's own theme switcher. Published now, referenced by NOTHING
    // yet: this page ships no theme control or script (machinery and
    // affordance travel together, ADR-217 §5) — the entry rides here so the
    // stack's theme-control landing adds only the reference, and it sits
    // outside the CSS closure the integration suite recomputes.
    'oak-theme.js',
    'fonts/Lexend-VariableFont_wght.ttf',
    'fonts/Lexend-OFL.txt',
    'fonts/RobotoMono-VariableFont_wght.ttf',
    'fonts/RobotoMono-OFL.txt',
    // Markup-referenced, so no CSS closure reaches either of these. Declared
    // individually even though `assets/icons` is copied wholesale: the footer
    // rule is not an icon, it merely lives in that directory today, and a
    // design-system commit that reorganised it would 404 the footer with the
    // whole suite green.
    'assets/logo-full-black.svg',
    'assets/icons/header-underline.svg',
    // The wide wordmark lockup. Published ahead of its first in-app
    // reference (the oak-theme.js precedent above): the brand-widget
    // wordmark swap then adds only the reference.
    'assets/logo-wide-black.svg',
  ],
  directories: ['assets/icons'],
} as const;

/**
 * Brand artwork the page needs as a file rather than through CSS.
 *
 * @remarks
 * Just the masthead/share logo today. It lives in
 * `@oaknational/oak-design-assets` rather than the design system because a
 * crawler-fetched raster at an absolute URL is a different kind of thing
 * from the vector the stylesheets reach. Copied rather than vendored, for
 * the reason the whole manifest exists: this file previously sat
 * unreferenced in `public/`, while the app's own source claimed it
 * vendored no logo artwork. Keep the boot marker in
 * `src/app/static-asset-paths.ts` in step with this list.
 */
export const OAK_ASSETS_MANIFEST = {
  files: ['assets/oak-national-academy-logo-512.png'],
} as const;

/**
 * Absolute path to the installed `@oaknational/oak-design-system` root.
 *
 * @remarks
 * Resolved through the package's `exports` map via its root entry
 * (`styles.css`), then walked up one level. `./package.json` is NOT an
 * exported subpath and resolving it would throw; a relative monorepo path
 * would break the moment the app is built anywhere but in place.
 */
export function resolveOakDsPackageRoot(): string {
  const require = createRequire(import.meta.url);
  return path.dirname(require.resolve('@oaknational/widget-tokens/design-system/styles.css'));
}

/** Absolute path to the installed `@oaknational/oak-design-assets` root. */
export function resolveOakAssetsPackageRoot(): string {
  const require = createRequire(import.meta.url);
  return path.dirname(
    path.dirname(
      require.resolve('@oaknational/widget-tokens/assets/oak-national-academy-logo-512.png'),
    ),
  );
}

async function stageOakDs(destRoot: string): Promise<string> {
  const packageRoot = resolveOakDsPackageRoot();
  const staged = await mkdtemp(path.join(destRoot, `.${OAK_DS_PUBLIC_DIRNAME}-staging-`));

  for (const relativePath of OAK_DS_MANIFEST.files) {
    const target = path.join(staged, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(packageRoot, relativePath), target);
  }

  for (const relativeDir of OAK_DS_MANIFEST.directories) {
    await cp(path.join(packageRoot, relativeDir), path.join(staged, relativeDir), {
      recursive: true,
    });
  }

  return staged;
}

async function stageOakAssets(destRoot: string): Promise<string> {
  const packageRoot = resolveOakAssetsPackageRoot();
  const staged = await mkdtemp(path.join(destRoot, `.${OAK_ASSETS_PUBLIC_DIRNAME}-staging-`));

  for (const relativePath of OAK_ASSETS_MANIFEST.files) {
    const target = path.join(staged, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(packageRoot, relativePath), target);
  }

  return staged;
}

/**
 * Copy the declared design-system files and brand artwork into
 * `<destRoot>/oak-ds/` and `<destRoot>/oak-assets/`.
 *
 * @param destRoot - The served static root (the app's `public/` directory).
 *
 * @remarks
 * ALL staging IO happens before the first swap, so the two published trees
 * are unavailable only across four adjacent `rename` syscalls — the boot
 * check reads a marker from each tree, and the trees cannot be swapped in
 * one syscall (see {@link publishAtomically} for the residual-window
 * honesty). A fresh publish also means a file dropped from a manifest
 * cannot linger from an earlier build.
 */
export async function copyOakDs(destRoot: string): Promise<void> {
  await mkdir(destRoot, { recursive: true });
  const dsStaged = await stageOakDs(destRoot);
  const assetsStaged = await stageOakAssets(destRoot);

  await publishAtomically(dsStaged, path.join(destRoot, OAK_DS_PUBLIC_DIRNAME));
  await publishAtomically(assetsStaged, path.join(destRoot, OAK_ASSETS_PUBLIC_DIRNAME));
}

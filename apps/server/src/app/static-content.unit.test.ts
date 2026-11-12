import { describe, expect, it } from 'vitest';

import { resolveStaticRoot } from './static-content.js';
import { OAK_ASSETS_MARKER, OAK_DS_MARKER } from './static-asset-paths.js';

/**
 * The static root resolves, or boot refuses — described with literals.
 *
 * The resolver is pure (filesystem access injected), so the three states a
 * deployment can be in are each one predicate away: no candidate directory
 * at all, a directory without the copied assets, and a servable root.
 */
describe('resolveStaticRoot', () => {
  const root = '/srv/app/public';

  it('refuses when no candidate directory exists', () => {
    const result = resolveStaticRoot(['/a/public', '/b/public'], () => false);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe('no-root');
      expect(result.error.detail).toContain('/a/public');
    }
  });

  it('refuses a root that exists without the copied assets', () => {
    const result = resolveStaticRoot([root], (p) => p === root);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe('missing-asset');
      expect(result.error.detail).toContain(OAK_DS_MARKER);
    }
  });

  it('refuses a root carrying the design system but not the brand assets', () => {
    const present = new Set([root, `${root}/${OAK_DS_MARKER}`]);
    const result = resolveStaticRoot([root], (p) => present.has(p));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe('missing-asset');
      expect(result.error.detail).toContain(OAK_ASSETS_MARKER);
    }
  });

  it('resolves the first candidate that carries both copied trees', () => {
    const present = new Set([root, `${root}/${OAK_DS_MARKER}`, `${root}/${OAK_ASSETS_MARKER}`]);
    const result = resolveStaticRoot(['/absent/public', root], (p) => present.has(p));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(root);
    }
  });
});

import { describe, expect, it } from 'vitest';

import { findMajorReleases, RELEASE_RULES, releaseFor } from './release.ts';
import { RELEASE_BY_TYPE } from './version-rules.ts';

describe('release rules', () => {
  it('let no commit type or footer produce a major release', () => {
    expect(findMajorReleases(RELEASE_RULES)).toEqual([]);
  });

  it.each(Object.entries(RELEASE_BY_TYPE))('release %s as version-rules says', (type, release) => {
    expect(releaseFor(RELEASE_RULES, { type, breaking: false, revert: false })).toBe(release);
  });

  it('keep a breaking feat at a minor release', () => {
    expect(releaseFor(RELEASE_RULES, { type: 'feat', breaking: true, revert: false })).toBe(
      'minor',
    );
  });

  it('fail a config that maps breaking commits to major', () => {
    expect(findMajorReleases([...RELEASE_RULES, { breaking: true, release: 'major' }])).toContain(
      'feat!',
    );
  });

  it('fail a config that leaves a breaking commit to the default rules', () => {
    const majors = findMajorReleases([
      { type: 'feat', release: 'minor' },
      { type: 'fix', release: 'patch' },
    ]);
    expect(majors).toContain('refactor!');
    expect(majors).toContain('(no type)!');
    expect(majors).not.toContain('feat!');
  });

  it('fail a config where a later rule overrides the breaking guard', () => {
    expect(
      findMajorReleases([
        { breaking: true, release: false },
        { type: 'perf', breaking: true, release: 'premajor' },
      ]),
    ).toEqual(['perf!', '(revert) perf!']);
  });

  it('fail a major rule that a later no-release rule follows, since major ends the analysis', () => {
    expect(
      findMajorReleases([
        { type: 'docs', breaking: true, release: 'major' },
        { breaking: true, release: false },
      ]),
    ).toEqual(['docs!', '(revert) docs!']);
  });

  it('fail a config that maps a typed revert to major', () => {
    expect(
      findMajorReleases([...RELEASE_RULES, { type: 'revert', revert: true, release: 'major' }]),
    ).toEqual(['(revert) revert', '(revert) revert!']);
  });

  it('refuse a rule it cannot model', () => {
    expect(() => findMajorReleases([{ type: 'fe*', release: 'minor' }])).toThrow('glob');
    expect(() => findMajorReleases([{ scope: 'server', release: 'minor' }])).toThrow('scope');
    expect(() => findMajorReleases([{ type: 'feat', release: 'huge' }])).toThrow('huge');
  });
});

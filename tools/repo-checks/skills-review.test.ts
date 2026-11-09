import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { checkSkillsReview } from './skills-review.ts';

const OLD = 'a'.repeat(40);
const NEW = 'b'.repeat(40);

function lock(ref: string): string {
  return JSON.stringify({
    version: 1,
    skills: { 'example-skill': { source: 'example/skills', ref, skillPath: 'SKILL.md' } },
  });
}

function review(...shas: string[]): string {
  return [
    '# Third-party skills',
    ...shas.flatMap((sha) => ['', '### example-skill', '', `- SHA: \`${sha}\``]),
    '',
  ].join('\n');
}

describe('skills-review', () => {
  it('passes a pin with a review at its SHA', () => {
    expect(checkSkillsReview(lock(OLD), review(OLD))).toEqual([]);
  });

  it('refuses a pin whose review is at an older SHA and names both', () => {
    const [error] = checkSkillsReview(lock(NEW), review(OLD));
    expect(error).toContain('example-skill');
    expect(error).toContain(NEW);
    expect(error).toContain(`reviewed only at ${OLD}`);
  });

  it('refuses a pin with no review', () => {
    const [error] = checkSkillsReview(lock(OLD), '# Third-party skills\n');
    expect(error).toContain('example-skill');
    expect(error).toContain('has no review');
  });

  it('passes a bumped pin once a review at the new SHA is added', () => {
    expect(checkSkillsReview(lock(NEW), review(OLD, NEW))).toEqual([]);
  });

  it('refuses a SHA that sits under another skill name', () => {
    const text = review(OLD).replace('### example-skill', '### other-skill');
    expect(checkSkillsReview(lock(OLD), text)).toHaveLength(1);
  });

  it('refuses a pin whose ref is not a full SHA', () => {
    expect(checkSkillsReview(lock('main'), review(OLD))[0]).toContain('40-character');
  });

  it('holds for the committed lock and security note', () => {
    expect(
      checkSkillsReview(
        readFileSync('skills-lock.json', 'utf8'),
        readFileSync('docs/security/third-party-skills.md', 'utf8'),
      ),
    ).toEqual([]);
  });
});

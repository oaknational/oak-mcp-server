import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { checkSkillsReview } from './skills-review.ts';

const OLD = 'a'.repeat(40);
const NEW = 'b'.repeat(40);
const SKILL_PATH = 'skills/example/SKILL.md';
const SOURCE_LINE = `- Source: \`example/skills\`, path \`${SKILL_PATH}\``;

function lock(ref: string): string {
  return JSON.stringify({
    version: 1,
    skills: { 'example-skill': { source: 'example/skills', ref, skillPath: SKILL_PATH } },
  });
}

function section(sha: string, name = 'example-skill', source = SOURCE_LINE): string[] {
  return ['', `### ${name}`, '', source, `- SHA: \`${sha}\``];
}

function review(...shas: string[]): string {
  return ['# Third-party skills', ...shas.flatMap((sha) => section(sha)), ''].join('\n');
}

function reviewWith(body: string[]): string {
  return ['# Third-party skills', ...body, ''].join('\n');
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

  describe('bypasses', () => {
    const refused = (text: string) => checkSkillsReview(lock(OLD), text);

    it('refuses a SHA written in prose', () => {
      const text = reviewWith(['', '### example-skill', '', SOURCE_LINE, `SHA: \`${OLD}\``]);
      expect(refused(text)).toHaveLength(1);
    });

    it('refuses a SHA line under a skill whose name only contains the pin name', () => {
      expect(refused(reviewWith(section(OLD, 'example-skill-old')))).toHaveLength(1);
      expect(refused(reviewWith(section(OLD, 'example')))).toHaveLength(1);
    });

    it('refuses a SHA line hidden in an HTML comment', () => {
      const text = reviewWith([
        '',
        '### example-skill',
        '',
        SOURCE_LINE,
        '<!--',
        `- SHA: \`${OLD}\``,
        '-->',
      ]);
      expect(refused(text)).toHaveLength(1);
    });

    it('refuses a SHA line inside a fenced code block', () => {
      const text = reviewWith([
        '',
        '### example-skill',
        '',
        SOURCE_LINE,
        '```',
        `- SHA: \`${OLD}\``,
        '```',
      ]);
      expect(refused(text)).toHaveLength(1);
    });

    it('refuses a second SHA line added to an old review section', () => {
      const text = reviewWith([
        '',
        '### example-skill',
        '',
        SOURCE_LINE,
        `- SHA: \`${OLD}\``,
        `- SHA: \`${NEW}\``,
      ]);
      const errors = checkSkillsReview(lock(NEW), text);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('more than one');
    });

    it('refuses a SHA line before any skill heading', () => {
      const text = reviewWith(['', SOURCE_LINE, `- SHA: \`${OLD}\``]);
      expect(refused(text)).toHaveLength(1);
    });

    it('refuses a SHA line under a deeper subsection', () => {
      const text = reviewWith([
        '',
        '### example-skill',
        '',
        '#### notes',
        SOURCE_LINE,
        `- SHA: \`${OLD}\``,
      ]);
      expect(refused(text)).toHaveLength(1);
    });

    it('refuses a skill heading at the wrong level', () => {
      const text = reviewWith(['', '## example-skill', '', SOURCE_LINE, `- SHA: \`${OLD}\``]);
      expect(refused(text)).toHaveLength(1);
    });

    it('refuses a SHA line with trailing prose', () => {
      const text = reviewWith([
        '',
        '### example-skill',
        '',
        SOURCE_LINE,
        `- SHA: \`${OLD}\` reviewed later`,
      ]);
      expect(refused(text)).toHaveLength(1);
    });

    it('refuses a review whose source differs from the pin', () => {
      const text = reviewWith(
        section(OLD, 'example-skill', `- Source: \`other/skills\`, path \`${SKILL_PATH}\``),
      );
      const [error] = refused(text);
      expect(error).toContain('example/skills');
    });

    it('refuses a review whose skill path differs from the pin', () => {
      const text = reviewWith(
        section(OLD, 'example-skill', '- Source: `example/skills`, path `skills/other/SKILL.md`'),
      );
      const [error] = refused(text);
      expect(error).toContain(SKILL_PATH);
    });

    it('refuses a review with no source line', () => {
      const text = reviewWith(['', '### example-skill', '', `- SHA: \`${OLD}\``]);
      expect(refused(text)).toHaveLength(1);
    });
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

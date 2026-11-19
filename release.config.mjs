import commitlint from './commitlint.config.mjs';
import { RELEASE_RULES } from './tools/repo-checks/release.ts';

// releaseRules and parserOpts sit at the top level because semantic-release
// passes top-level options to every plugin. The dry run in release.yml names
// its plugins on the command line, and it still gets these options that way.
export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  releaseRules: RELEASE_RULES,
  parserOpts: commitlint.parserPreset.parserOpts,
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/npm', { npmPublish: false }],
    [
      '@semantic-release/git',
      { assets: ['package.json'], message: 'chore(release): ${nextRelease.version} [skip ci]' },
    ],
    [
      '@semantic-release/github',
      { successComment: false, failComment: false, releasedLabels: false },
    ],
  ],
};

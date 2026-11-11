import eslint from '@eslint/js';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const importedRuleGaps: Record<string, string[]> = {
  codegen: [
    'no-base-to-string',
    'no-confusing-void-expression',
    'no-redundant-type-constituents',
    'no-unnecessary-condition',
    'no-unnecessary-type-conversion',
    'no-unsafe-assignment',
    'require-await',
    'restrict-template-expressions',
    'return-await',
  ],
  'curriculum-sdk': [
    'no-unnecessary-condition',
    'no-unnecessary-type-conversion',
    'restrict-template-expressions',
    'unbound-method',
    'use-unknown-in-catch-callback-variable',
  ],
  env: ['no-confusing-void-expression', 'no-unnecessary-condition'],
  logger: ['no-confusing-void-expression', 'no-unnecessary-condition'],
  observability: ['no-confusing-void-expression', 'no-unnecessary-type-arguments', 'require-await'],
  'graph-core': ['no-unnecessary-condition', 'require-await', 'restrict-template-expressions'],
  'graph-corpus-sdk': ['no-unnecessary-condition'],
  'posthog-node': [
    'no-confusing-void-expression',
    'no-unnecessary-condition',
    'no-unnecessary-type-parameters',
    'prefer-promise-reject-errors',
    'require-await',
    'unbound-method',
  ],
  'sentry-node': ['require-await', 'restrict-template-expressions', 'unbound-method'],
};

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '.cache/**',
      'tools/import-from-ooce/supplied/**',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  eslintComments.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.base.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@eslint-community/eslint-comments/require-description': 'error',
      'no-warning-comments': 'warn',
    },
  },
  {
    files: ['packages/**/*.ts'],
    languageOptions: {
      parserOptions: { project: ['./packages/*/tsconfig.json', './tsconfig.base.json'] },
    },
  },
  ...Object.entries(importedRuleGaps).map(([name, rules]) => ({
    files: [`packages/${name}/**/*.ts`],
    rules: Object.fromEntries(rules.map((rule) => [`@typescript-eslint/${rule}`, 'off' as const])),
  })),
  { files: ['**/*.mjs'], extends: [tseslint.configs.disableTypeChecked] },
  prettier,
);

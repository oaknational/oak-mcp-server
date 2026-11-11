import base from '../../.prettierrc.json' with { type: 'json' };

export default {
  ...base,
  overrides: [
    {
      files: ['src/types/generated/**', 'src/generated/**', 'src/api-schema.ts'],
      options: { requirePragma: true },
    },
    {
      files: ['src/types/generated/**/*.json', 'src/generated/**/*.json'],
      options: { parser: 'json-stringify' },
    },
  ],
};

// OOCE's root .prettierignore skips generated code. This config accepts the
// generated trees as codegen writes them: TypeScript is skipped, and JSON is
// checked in JSON.stringify layout, which codegen emits.
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

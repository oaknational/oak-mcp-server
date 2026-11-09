const linearId = '(?:[A-Z][A-Z0-9]*-\\d+: )?';

export default {
  extends: ['@commitlint/config-conventional'],
  parserPreset: {
    parserOpts: {
      headerPattern: new RegExp(`^${linearId}(\\w*)(?:\\(([^)]*)\\))?!?: (.*)$`),
      headerCorrespondence: ['type', 'scope', 'subject'],
    },
  },
};

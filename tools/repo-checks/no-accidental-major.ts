import { readFileSync } from 'node:fs';

const BANG_HEADER = /^(?:[A-Z][A-Z0-9]*-\d+: )?\w+(?:\([^)]*\))?!: /;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGES?\b/m;

function findMajorBump(message: string): string | undefined {
  const lines = message.split('\n').filter((line) => !line.startsWith('#'));
  const [header = ''] = lines;
  if (BANG_HEADER.test(header)) {
    return "the header uses '!' after the type";
  }
  if (BREAKING_FOOTER.test(lines.join('\n'))) {
    return 'the message carries a BREAKING CHANGE footer';
  }
  return undefined;
}

const messageFile = process.argv[2];
if (messageFile === undefined) {
  process.stderr.write(
    'no-accidental-major: pass the commit message file as the first argument.\n',
  );
  process.exit(1);
}

const reason = findMajorBump(readFileSync(messageFile, 'utf8'));
if (reason !== undefined) {
  process.stderr.write(
    [
      `no-accidental-major: refused, ${reason}.`,
      'Only a person bumps the major version, by editing package.json in its own PR.',
      "Remove the '!' and the BREAKING CHANGE footer. Describe the break in the body instead.",
      '',
    ].join('\n'),
  );
  process.exit(1);
}

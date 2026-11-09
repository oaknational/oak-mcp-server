import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import process from 'node:process';

class Refusal extends Error {}

const refuse = (reason) => {
  throw new Refusal(reason);
};

const refuseSkip = (reason) =>
  refuse(
    `${reason}. A refused hook skip means stop and ask the operator. Never try another form of the same skip.`,
  );

const SEPARATORS = new Set([';', '\n', '&', '|', '(', ')', '`']);
const PACKAGE_RUNNERS = new Set(['pnpm', 'npm', 'yarn', 'npx', 'bunx']);
const PREFIXES = new Set([
  'export',
  'env',
  'sudo',
  'command',
  'exec',
  'time',
  'nohup',
  'nice',
  'xargs',
  'then',
  'do',
  'else',
  'if',
  'elif',
  'while',
  'until',
  '{',
  '!',
]);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);
const HOOK_SKIP_ENV = new Set(['HUSKY=0', 'SKIP_HOOKS=1', 'LEFTHOOK=0']);
const SCRATCH =
  /^(?:\.\/)?(?:[^/]+\/)*(?:\.cache|node_modules|dist|coverage)(?:\/|$)|^\/(?:tmp|private\/tmp|var\/folders)\/|^\$\{?TMPDIR(?::-[^}]*)?\}?\/[^/]/;
const BROAD_PATHSPEC = /^(?:\.\.?\/?|\.\/\*|:\/|:\(top\)\/?|\*+)$/;
const HOOKS_PATH = /core\.hookspath/i;
const CONFIG_READS = new Set(['--get', '--get-all', '--get-regexp', '--list', '-l']);
const COMMIT_VALUE_OPTIONS = new Set([
  '-m',
  '-F',
  '-C',
  '-c',
  '-t',
  '--message',
  '--file',
  '--author',
  '--date',
  '--template',
  '--reuse-message',
  '--reedit-message',
  '--cleanup',
  '--fixup',
  '--squash',
]);
const shellQuote = (word) => `'${word.replaceAll("'", "'\\''")}'`;
const SHORT_FLAGS = (letter) => new RegExp(`^-[a-zA-Z]*${letter}[a-zA-Z]*$`);

function tokenize(text) {
  const segments = [];
  let segment = [];
  let token = '';
  let hasToken = false;
  let quote = '';
  const endToken = () => {
    if (hasToken) {
      segment.push(token);
    }
    token = '';
    hasToken = false;
  };
  const endSegment = () => {
    endToken();
    if (segment.length > 0) {
      segments.push(segment);
    }
    segment = [];
  };
  for (const char of text) {
    if (quote) {
      if (char === quote) {
        quote = '';
      } else {
        token += char;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
      hasToken = true;
    } else if (char === ' ' || char === '\t') {
      endToken();
    } else if (SEPARATORS.has(char)) {
      endSegment();
    } else {
      token += char;
      hasToken = true;
    }
  }
  endSegment();
  return segments;
}

const ENV_TEMPLATE = /^\.env\.(?:example|sample|template)$/;
const isEnvPath = (path) => {
  const name = path.split('/').pop() ?? '';
  return (/^\.env(?:\.|$)/.test(name) && !ENV_TEMPLATE.test(name)) || /^\.env[*?[]/.test(name);
};
const globNamesEnv = (glob) =>
  glob.split(/[\s,/{}]+/).some((piece) => !piece.startsWith('!') && isEnvPath(piece));
const HUSKY_PATH = /(?:^|\/)\.husky(?:\/|$)/;

function worktree(dir) {
  const status = spawnSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' });
  if (status.status !== 0) {
    return { tracked: 1, untracked: 1 };
  }
  const lines = status.stdout.split('\n').filter((line) => line !== '');
  const untracked = lines.filter((line) => line.startsWith('??')).length;
  return { tracked: lines.length - untracked, untracked };
}

const hasTrackedEdits = (dir) => worktree(dir).tracked > 0;

function isBranchName(dir, name) {
  if (name === '-') {
    return true;
  }
  const probe = (args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  return (
    probe(['rev-parse', '--verify', '--quiet', `${name}^{commit}`]).status === 0 ||
    probe([
      'for-each-ref',
      '--count=1',
      '--format=%(refname)',
      `refs/remotes/*/${name}`,
    ]).stdout.trim() !== ''
  );
}

const CHECKOUT_FLAGS = new Set([
  '-q',
  '--quiet',
  '--detach',
  '-d',
  '--track',
  '-t',
  '--no-track',
  '--guess',
  '--no-guess',
  '--progress',
  '--no-progress',
]);

function checkCheckout(rest, dir) {
  if (!hasTrackedEdits(dir)) {
    return;
  }
  const positionals = [];
  let creates = false;
  const why = (word) =>
    refuse(
      `git checkout ${word} can overwrite uncommitted edits. With edits in the tree only a plain branch switch is allowed. Commit them first.`,
    );
  for (let index = 0; index < rest.length; index += 1) {
    const word = rest[index];
    if (word === '--') {
      why('over paths');
    } else if (word === '-b' || word === '-B') {
      creates = true;
      index += 1;
    } else if (word.startsWith('-') && word !== '-') {
      if (!CHECKOUT_FLAGS.has(word)) {
        why(word);
      }
    } else {
      positionals.push(word);
    }
  }
  if (
    positionals.length > 1 ||
    (positionals.length === 1 && !creates && !isBranchName(dir, positionals[0]))
  ) {
    why(positionals.join(' '));
  }
}

const FORCES = (word) =>
  word === '--force' || word === '--discard-changes' || SHORT_FLAGS('f').test(word);

function checkGit(args, callDir) {
  let dir = callDir;
  let index = 0;
  for (; index < args.length; index += 1) {
    const word = args[index];
    if (word === '-C') {
      index += 1;
      dir = isAbsolute(args[index] ?? '') ? args[index] : join(dir, args[index] ?? '');
    } else if (['-c', '--git-dir', '--work-tree', '--namespace', '--exec-path'].includes(word)) {
      index += 1;
    } else if (!word.startsWith('-')) {
      break;
    }
  }
  if (args.slice(0, index).some((word) => /^alias\./i.test(word))) {
    refuse('git aliases can hide a refused command. Do not define one.');
  }
  const sub = args[index];
  const rest = args.slice(index + 1);
  const readsConfig = sub === 'config' && rest.some((word) => CONFIG_READS.has(word));
  if (
    args.slice(0, index).some((word) => HOOKS_PATH.test(word)) ||
    (!readsConfig && rest.some((word) => HOOKS_PATH.test(word)))
  ) {
    refuseSkip("overriding core.hooksPath skips the repository's hooks");
  }
  if (sub === undefined) {
    return;
  }
  const options = rest.slice(0, rest.indexOf('--') === -1 ? undefined : rest.indexOf('--'));

  if (['commit', 'push', 'merge', 'rebase', 'cherry-pick', 'am', 'revert', 'pull'].includes(sub)) {
    for (const word of options) {
      if (['--no-verify', '--no-pre-commit', '--no-commit-msg'].includes(word)) {
        refuseSkip(`${word} skips the repository's hooks`);
      }
      if ((sub === 'commit' || sub === 'push') && SHORT_FLAGS('n').test(word)) {
        refuseSkip(`-n on git ${sub} skips the repository's hooks`);
      }
    }
  }

  switch (sub) {
    case 'add':
      for (const word of rest) {
        if (
          ['--all', '--update'].includes(word) ||
          (options.includes(word) &&
            (SHORT_FLAGS('A').test(word) || SHORT_FLAGS('u').test(word))) ||
          BROAD_PATHSPEC.test(word)
        ) {
          refuse(
            `git add ${word} stages more than the named files. Stage by explicit pathspec so a commit never bundles unrelated work.`,
          );
        }
      }
      break;
    case 'commit':
      for (const word of options) {
        if (word === '--all' || SHORT_FLAGS('a').test(word)) {
          refuse(
            `git commit ${word} stages every tracked edit. Stage by explicit pathspec, then commit.`,
          );
        }
      }
      if (hasTrackedEdits(dir) && commitPathspecs(rest).some((word) => BROAD_PATHSPEC.test(word))) {
        refuse(
          'git commit with a broad pathspec commits every tracked edit. Name the files to commit.',
        );
      }
      break;
    case 'push':
      if (rest.includes('--mirror')) {
        refuse('git push --mirror overwrites every remote ref. Push your own branch by name.');
      }
      for (const word of rest) {
        if (
          word === '--force' ||
          word.startsWith('--force=') ||
          SHORT_FLAGS('f').test(word) ||
          word.startsWith('+')
        ) {
          refuse(
            `git push ${word} rewrites remote history without a lease. Use --force-with-lease=refs/heads/<branch>:<last pushed sha> on your own branch.`,
          );
        }
      }
      break;
    case 'clean': {
      const deletes = rest.some(
        (word) => FORCES(word) || SHORT_FLAGS('i').test(word) || word === '--interactive',
      );
      const dryRun = rest.some((word) => word === '--dry-run' || SHORT_FLAGS('n').test(word));
      if (
        rest.some((word) => SHORT_FLAGS('f').test(word) || word === '--force') &&
        rest.some((word) => SHORT_FLAGS('x').test(word))
      ) {
        refuse('git clean -fx deletes ignored and untracked files beyond recovery.');
      }
      if (deletes && !dryRun && worktree(dir).untracked > 0) {
        refuse(
          'git clean deletes untracked files. Commit or move them first, or run git clean -n.',
        );
      }
      break;
    }
    case 'stash': {
      if (['pop', 'apply', 'list', 'show', 'branch'].includes(rest[0])) {
        break;
      }
      const state = worktree(dir);
      const sweepsUntracked = options.some(
        (word) =>
          word === '--include-untracked' ||
          word === '--all' ||
          SHORT_FLAGS('u').test(word) ||
          SHORT_FLAGS('a').test(word),
      );
      if (state.tracked > 0 || (sweepsUntracked && state.untracked > 0)) {
        refuse('git stash hides uncommitted edits. Commit them or keep them in the tree.');
      }
      break;
    }
    case 'restore': {
      const staged = options.some((word) => word === '--staged' || SHORT_FLAGS('S').test(word));
      const toWorktree = options.some(
        (word) => word === '--worktree' || SHORT_FLAGS('W').test(word),
      );
      if (hasTrackedEdits(dir) && !(staged && !toWorktree)) {
        refuse(
          'git restore overwrites working-tree edits. To unstage a file use git restore --staged <file>. To discard an edit, ask the operator.',
        );
      }
      break;
    }
    case 'reset': {
      const discards = ['--hard', '--merge'].find((flag) => rest.includes(flag));
      if (discards !== undefined && hasTrackedEdits(dir)) {
        refuse(`git reset ${discards} discards uncommitted edits. Commit them first.`);
      }
      break;
    }
    case 'checkout':
      checkCheckout(rest, dir);
      break;
    case 'switch':
      if (
        options.some((word) => FORCES(word) || word === '-C' || word === '--force-create') &&
        hasTrackedEdits(dir)
      ) {
        refuse('git switch -f discards uncommitted edits. Commit them first.');
      }
      break;
    case 'rm':
      if (options.some(FORCES) && hasTrackedEdits(dir)) {
        refuse('git rm -f discards uncommitted edits. Commit them first.');
      }
      break;
    case 'config':
      if (
        rest.some((word) => /^alias\./i.test(word)) &&
        !rest.some((word) => ['--get', '--get-all', '--list', '-l'].includes(word))
      ) {
        refuse('git aliases can hide a refused command. Do not define one.');
      }
      break;
    default:
      checkAlias(sub, rest, dir);
  }
}

function commitPathspecs(rest) {
  const dashes = rest.indexOf('--');
  const specs = dashes === -1 ? [] : rest.slice(dashes + 1);
  const before = dashes === -1 ? rest : rest.slice(0, dashes);
  for (let index = 0; index < before.length; index += 1) {
    if (COMMIT_VALUE_OPTIONS.has(before[index])) {
      index += 1;
    } else if (!before[index].startsWith('-')) {
      specs.push(before[index]);
    }
  }
  return specs;
}

function checkAlias(sub, rest, dir) {
  const alias = spawnSync('git', ['-C', dir, 'config', '--get', `alias.${sub}`], {
    encoding: 'utf8',
  });
  const expansion = alias.status === 0 ? alias.stdout.trim() : '';
  if (expansion === '') {
    return;
  }
  if (expansion.startsWith('!')) {
    checkCommand([expansion.slice(1), ...rest.map(shellQuote)].join(' '), dir, 1);
  } else {
    checkGit([...tokenize(expansion).flat(), ...rest], dir);
  }
}

function checkRm(args) {
  const flags = args.filter((word) => /^-[^-]/.test(word)).join('');
  const recursive = args.includes('--recursive') || /[rR]/.test(flags);
  const force = args.includes('--force') || /f/.test(flags);
  if (!recursive || !force) {
    return;
  }
  for (const path of args.filter((word) => !word.startsWith('-'))) {
    if (path.includes('..') || !SCRATCH.test(path)) {
      refuse(
        `rm -rf is allowed only inside the scratch area (.cache, node_modules, dist, coverage, a temp directory), not on ${path}.`,
      );
    }
  }
}

function unwrap(command, args) {
  if (command === 'timeout') {
    let index = 0;
    while (index < args.length && args[index].startsWith('-')) {
      index += ['-s', '-k', '--signal', '--kill-after'].includes(args[index]) ? 2 : 1;
    }
    return args.slice(index + 1);
  }
  if (PACKAGE_RUNNERS.has(command)) {
    const runner = args.findIndex((word) => word === 'exec' || word === 'dlx');
    if (runner !== -1) {
      return args.slice(runner + 1);
    }
    return command === 'npx' || command === 'bunx' ? args : undefined;
  }
  return undefined;
}

function checkSegment(words, callDir, depth) {
  if (depth > 4) {
    return;
  }
  let start = 0;
  for (; start < words.length; start += 1) {
    const word = words[start];
    if (HOOK_SKIP_ENV.has(word)) {
      refuseSkip(`${word} skips the repository's hooks`);
    }
    if (/^GIT_CONFIG\w*=.*core\.hookspath/i.test(word)) {
      refuseSkip("overriding core.hooksPath skips the repository's hooks");
    }
    if (!word.includes('=') && !PREFIXES.has(word) && !word.startsWith('-')) {
      break;
    }
  }
  if (start >= words.length) {
    return;
  }
  const command = words[start].replace(/^\\/, '').split('/').pop();
  const args = words.slice(start + 1);
  const inner = unwrap(command, args);
  if (inner !== undefined) {
    checkSegment(inner, callDir, depth + 1);
  }
  if (command === 'git') {
    checkGit(args, callDir);
  } else if (command === 'rm') {
    checkRm(args);
  } else if (SHELLS.has(command)) {
    const flag = args.findIndex((word) => /^-[a-z]*c$/.test(word));
    if (flag !== -1) {
      checkCommand(args[flag + 1] ?? '', callDir, depth + 1);
    }
  } else if (command === 'eval') {
    checkCommand(args.join(' '), callDir, depth + 1);
  }
  if (!['git', 'echo', 'printf'].includes(command)) {
    const secret = args.find((word) => isEnvPath(word.replace(/^[<>]+/, '')));
    if (secret !== undefined) {
      refuse(`reading ${secret} is refused. Environment files hold secrets.`);
    }
  }
  if (
    (args.some((word) => HUSKY_PATH.test(word)) && touchesHooks(command, args)) ||
    redirectsInto(words, HUSKY_PATH)
  ) {
    refuseSkip("editing .husky/ changes the repository's hooks");
  }
}

function redirectsInto(words, pattern) {
  return words.some((word, index) => {
    const target = /^\d*>>?\|?(.*)$/.exec(word);
    return target !== null && pattern.test(target[1] === '' ? (words[index + 1] ?? '') : target[1]);
  });
}

const HOOK_EDITORS = new Set([
  'rm',
  'mv',
  'cp',
  'sed',
  'tee',
  'chmod',
  'ln',
  'truncate',
  'dd',
  'perl',
]);
const COPIERS = new Set(['cp', 'install', 'rsync']);
const GIT_HOOK_EDITS = new Set(['rm', 'mv', 'checkout', 'restore', 'apply', 'clean']);

function touchesHooks(command, args) {
  if (command === 'sed') {
    return args.some((word) => word === '--in-place' || /^-[a-zA-Z]*i/.test(word));
  }
  if (command === 'awk') {
    return args.includes('inplace');
  }
  if (COPIERS.has(command)) {
    const operands = args.filter((word) => !word.startsWith('-'));
    return (
      HUSKY_PATH.test(operands.at(-1) ?? '') ||
      args.some(
        (word, index) =>
          /^(?:-t|--target-directory)/.test(word) && HUSKY_PATH.test(args[index + 1] ?? word),
      )
    );
  }
  if (command !== 'git') {
    return HOOK_EDITORS.has(command);
  }
  const sub = args.find(
    (word, index) => !word.startsWith('-') && !['-C', '-c'].includes(args[index - 1]),
  );
  return GIT_HOOK_EDITS.has(sub);
}

function checkCommand(text, callDir, depth = 0) {
  if (depth > 4) {
    return;
  }
  for (const segment of tokenize(text.replace(/\\\r?\n/g, ''))) {
    checkSegment(segment, callDir, depth);
  }
}

function decide(call) {
  if (
    typeof call !== 'object' ||
    call === null ||
    Array.isArray(call) ||
    typeof call.tool_name !== 'string' ||
    (call.tool_input != null &&
      (typeof call.tool_input !== 'object' || Array.isArray(call.tool_input)))
  ) {
    refuse('the hook input was not a tool call, so no call is allowed');
  }
  const input = call.tool_input ?? {};
  const callDir = call.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const filePath = String(input.file_path ?? '');
  switch (call.tool_name) {
    case 'Bash':
      checkCommand(String(input.command ?? ''), callDir);
      break;
    case 'Grep':
      for (const [name, bad] of [
        ['path', isEnvPath(String(input.path ?? ''))],
        ['glob', globNamesEnv(String(input.glob ?? ''))],
      ]) {
        if (bad) {
          refuse(`Grep with ${name} ${input[name]} is refused. Environment files hold secrets.`);
        }
      }
      break;
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
      if (isEnvPath(filePath)) {
        refuse(`${call.tool_name} on ${filePath} is refused. Environment files hold secrets.`);
      }
      if (call.tool_name !== 'Read' && HUSKY_PATH.test(filePath)) {
        refuseSkip("editing .husky/ changes the repository's hooks");
      }
      break;
    default:
  }
}

try {
  let call;
  try {
    call = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    refuse('the hook input was not valid JSON, so no call is allowed');
  }
  decide(call);
} catch (error) {
  const reason = error instanceof Refusal ? error.message : `the guard failed (${String(error)})`;
  process.stderr.write(`git-guard refused this call: ${reason}\n`);
  process.exitCode = 2;
}

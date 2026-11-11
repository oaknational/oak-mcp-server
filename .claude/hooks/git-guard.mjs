import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
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
const COMMIT_VALUE_LETTERS = 'mFCct';
const SHORT_FLAGS = (letter, valueLetters = '') => ({
  test(word) {
    if (!/^-[a-zA-Z]/.test(word)) {
      return false;
    }
    for (const char of word.slice(1)) {
      if (char === letter) {
        return true;
      }
      if (valueLetters.includes(char) || !/[a-zA-Z]/.test(char)) {
        return false;
      }
    }
    return false;
  },
});

function withoutValues(words) {
  const kept = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const cluster = /^-[a-zA-Z]/.test(word) ? word.slice(1) : '';
    const valueAt = [...cluster].findIndex((char) => COMMIT_VALUE_LETTERS.includes(char));
    const longName = word.startsWith('--') ? word.split('=')[0] : '';
    if (valueAt !== -1) {
      kept.push(`-${cluster.slice(0, valueAt + 1)}`);
    } else if (COMMIT_VALUE_OPTIONS.has(longName)) {
      kept.push(longName);
    } else {
      kept.push(word);
    }
    const separated = valueAt === cluster.length - 1 || word === longName;
    if (COMMIT_VALUE_OPTIONS.has(word) || (valueAt !== -1 && separated && !word.includes('='))) {
      index += 1;
    }
  }
  return kept;
}

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
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
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
    } else if (char === '>' || char === '<') {
      if (!/^\d*$/.test(token)) {
        endToken();
      }
      token += char;
      while (text[at + 1] === char) {
        token += char;
        at += 1;
      }
      if (text[at + 1] === '|' || text[at + 1] === '&') {
        token += text[at + 1];
        at += 1;
      }
      hasToken = true;
      endToken();
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
  return name.startsWith('.env') && !ENV_TEMPLATE.test(name);
};
const globNamesEnv = (glob) =>
  glob.split(/[\s,/{}]+/).some((piece) => !piece.startsWith('!') && isEnvPath(piece));
const HOOK_FILES = /(?:^|\/)(?:\.husky(?:\/|$)|\.git\/config(?:\.worktree)?$)/;
const OUTPUT_REDIRECT = /^\d*>>?[|&]?$/;
const INCLUDE_PATH = /^include(?:if\..+)?\.path$/i;
const TEMP_DIR = /^\/(?:tmp|private\/tmp|var\/folders)\//;
const SKIP_MESSAGE = "editing .husky/ or .git/config changes the repository's hooks";
const isAbbreviation = (word, full, shortest) => word.length >= shortest && full.startsWith(word);
const isHookSkipSwitch = (word) =>
  ['--no-verify', '--no-pre-commit', '--no-commit-msg'].includes(word) ||
  isAbbreviation(word, '--no-verify', '--no-v'.length);
let rootDir = process.cwd();

function worktree(dir) {
  const status = spawnSync('git', ['-C', dir, 'status', '--porcelain', '--untracked-files=all'], {
    encoding: 'utf8',
  });
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
    if (word === '-C' || (word.startsWith('-C') && word.length > 2)) {
      const target = word === '-C' ? (args[index + 1] ?? '') : word.slice(2);
      index += word === '-C' ? 1 : 0;
      dir = isAbsolute(target) ? target : join(dir, target);
    } else if (/^--(?:git-dir|work-tree)(?:=|$)/.test(word)) {
      dir = UNKNOWN_DIR;
      index += word.includes('=') ? 0 : 1;
    } else if (['-c', '--namespace', '--exec-path'].includes(word)) {
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
    (!readsConfig &&
      (sub === 'commit' ? withoutValues(rest) : rest).some((word) => HOOKS_PATH.test(word)))
  ) {
    refuseSkip("overriding core.hooksPath skips the repository's hooks");
  }
  if (sub === undefined) {
    return;
  }
  const options = rest.slice(0, rest.indexOf('--') === -1 ? undefined : rest.indexOf('--'));

  if (['commit', 'push', 'merge', 'rebase', 'cherry-pick', 'am', 'revert', 'pull'].includes(sub)) {
    for (const word of sub === 'commit' ? withoutValues(options) : options) {
      if (isHookSkipSwitch(word)) {
        refuseSkip(`${word} is a hook-skip switch`);
      }
      if (
        (sub === 'commit' || sub === 'push') &&
        SHORT_FLAGS('n', COMMIT_VALUE_LETTERS).test(word)
      ) {
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
      for (const word of withoutValues(options)) {
        if (word === '--all' || SHORT_FLAGS('a', COMMIT_VALUE_LETTERS).test(word)) {
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
      if (!readsConfig && rest.some((word) => INCLUDE_PATH.test(word))) {
        refuseSkip('a config include can set core.hooksPath');
      }
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

function checkRm(args, dir) {
  const flags = args.filter((word) => /^-[^-]/.test(word)).join('');
  const recursive = args.includes('--recursive') || /[rR]/.test(flags);
  const force = args.includes('--force') || /f/.test(flags);
  if (!recursive || !force) {
    return;
  }
  for (const path of args.filter((word) => !word.startsWith('-'))) {
    const resolved = resolve(dir, path);
    const inside =
      isAbsolute(path) ||
      path.startsWith('$') ||
      (dir !== UNKNOWN_DIR && !relative(rootDir, resolved).startsWith('..')) ||
      TEMP_DIR.test(`${resolved}/`);
    if (path.includes('..') || !SCRATCH.test(path) || !inside) {
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

const WRAPPER_VALUE_LETTERS = 'uCngUS';
const WRAPPER_LONG_OPTIONS = new Set(['--unset', '--chdir']);

function wrapperOption(word, next) {
  const [name, attached] = word.split(/=(.*)/s);
  if (WRAPPER_LONG_OPTIONS.has(name)) {
    return {
      value: attached ?? next,
      consumesNext: attached === undefined,
      chdir: name === '--chdir',
    };
  }
  if (!/^-[a-zA-Z]/.test(word)) {
    return undefined;
  }
  for (let at = 1; at < word.length && /[a-zA-Z]/.test(word[at]); at += 1) {
    if (WRAPPER_VALUE_LETTERS.includes(word[at])) {
      const rest = word.slice(at + 1);
      return {
        value: rest === '' ? next : rest,
        consumesNext: rest === '',
        chdir: word[at] === 'C',
      };
    }
  }
  return undefined;
}

function checkSegment(words, startDir, depth) {
  if (depth > 4) {
    return;
  }
  let callDir = startDir;
  let wrapped = false;
  let start = 0;
  for (; start < words.length; start += 1) {
    const word = words[start];
    if (/^GIT_(?:DIR|WORK_TREE)=/.test(word)) {
      callDir = UNKNOWN_DIR;
    }
    wrapped ||= PREFIXES.has(word);
    const option = wrapped ? wrapperOption(word, words[start + 1]) : undefined;
    if (option !== undefined) {
      if (option.chdir) {
        callDir = cdTarget(callDir, option.value);
      }
      start += option.consumesNext ? 1 : 0;
      continue;
    }
    if (HOOK_SKIP_ENV.has(word)) {
      refuseSkip(`${word} is a hook-skip switch`);
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
    checkRm(args, callDir);
  } else if (SHELLS.has(command)) {
    const flag = args.findIndex((word) => /^-[a-z]*c$/.test(word));
    if (flag !== -1) {
      checkCommand(args[flag + 1] ?? '', callDir, depth + 1);
    }
  } else if (command === 'eval') {
    checkCommand(args.join(' '), callDir, depth + 1);
  }
  if (!['git', 'echo', 'printf'].includes(command)) {
    const secret = args.find((word) => isEnvPath(word.replace(/^\d*[<>]+/, '')));
    if (secret !== undefined) {
      refuse(`reading ${secret} is refused. Environment files hold secrets.`);
    }
  }
  const hookFile = (word) => HOOK_FILES.test(resolve(callDir, word));
  if (
    (args.some(hookFile) && touchesHooks(command, args, hookFile)) ||
    words.some((word, index) => OUTPUT_REDIRECT.test(word) && hookFile(words[index + 1] ?? ''))
  ) {
    refuseSkip(SKIP_MESSAGE);
  }
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

function touchesHooks(command, args, hookFile) {
  if (command === 'sed') {
    return args.some((word) => word === '--in-place' || /^-[a-zA-Z]*i/.test(word));
  }
  if (command === 'awk') {
    return args.includes('inplace');
  }
  if (COPIERS.has(command)) {
    const operands = args.filter((word) => !word.startsWith('-'));
    return (
      hookFile(operands.at(-1) ?? '') ||
      args.some((word, index) => {
        const flag = /^(?:-t|--target-directory=?)/.exec(word)?.[0];
        return (
          flag !== undefined &&
          hookFile(word.length > flag.length ? word.slice(flag.length) : (args[index + 1] ?? ''))
        );
      })
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
  const dirs = [callDir];
  for (const [, inner] of text.matchAll(/\$\(([^()]*)\)/g)) {
    checkCommand(inner ?? '', callDir, depth + 1);
  }
  for (const segment of tokenize(text.replace(/\\\r?\n/g, ''))) {
    const words = segment.filter((word, at) => at > 0 || !['builtin', 'command'].includes(word));
    if (words[0] === 'cd' || words[0] === 'pushd') {
      const target = words.slice(1).find((word) => !CD_FLAGS.has(word));
      dirs.push(cdTarget(dirs.at(-1), target));
    }
    for (const dir of dirs) {
      checkSegment(segment, dir, depth);
    }
  }
}

const CD_FLAGS = new Set(['-L', '-P', '-e', '-@', '--']);
const UNKNOWN_DIR = join(process.cwd(), '.git-guard-unknown-directory', 'x');
function cdTarget(dir, target) {
  if (target === undefined || target === '-' || /[$~`*?[]/.test(target)) {
    return UNKNOWN_DIR;
  }
  return resolve(dir, target);
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
  rootDir = callDir;
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
      if (call.tool_name !== 'Read' && HOOK_FILES.test(resolve(callDir, filePath))) {
        refuseSkip(SKIP_MESSAGE);
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

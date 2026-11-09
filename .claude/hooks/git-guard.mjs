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
  '{',
  '!',
]);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);
const HOOK_SKIP_ENV = new Set(['HUSKY=0', 'SKIP_HOOKS=1', 'LEFTHOOK=0']);
const SCRATCH =
  /^(?:\.\/)?(?:\.cache|node_modules|dist|coverage)(?:\/|$)|^\/(?:tmp|private\/tmp|var\/folders)\//;
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

const isEnvPath = (path) => /^\.env(?:\.|$)/.test(path.split('/').pop() ?? '');

function isDirty(dir) {
  const status = spawnSync('git', ['-C', dir, 'status', '--porcelain', '--untracked-files=no'], {
    encoding: 'utf8',
  });
  return status.status === 0 && status.stdout.trim() !== '';
}

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
  if (args.some((word) => /core\.hookspath/i.test(word))) {
    refuseSkip("overriding core.hooksPath skips the repository's hooks");
  }
  const sub = args[index];
  if (sub === undefined) {
    return;
  }
  const rest = args.slice(index + 1);
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
        if (['-A', '--all', '.'].includes(word)) {
          refuse(
            `git add ${word} stages everything. Stage by explicit pathspec so a commit never bundles unrelated work.`,
          );
        }
      }
      break;
    case 'push':
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
    case 'clean':
      if (
        rest.some((word) => word === '--force' || SHORT_FLAGS('f').test(word)) &&
        rest.some((word) => SHORT_FLAGS('x').test(word))
      ) {
        refuse('git clean -fx deletes ignored and untracked files beyond recovery.');
      }
      break;
    case 'stash':
      if (!['pop', 'apply', 'list', 'show', 'branch'].includes(rest[0]) && isDirty(dir)) {
        refuse('git stash hides uncommitted edits. Commit them or keep them in the tree.');
      }
      break;
    case 'restore':
      if (isDirty(dir)) {
        refuse('git restore overwrites uncommitted edits. Commit them first.');
      }
      break;
    case 'reset':
      if (rest.includes('--hard') && isDirty(dir)) {
        refuse('git reset --hard discards uncommitted edits. Commit them first.');
      }
      break;
    case 'checkout':
      if ((rest.includes('--') || rest[0] === '.') && isDirty(dir)) {
        refuse('git checkout over paths overwrites uncommitted edits. Commit them first.');
      }
      break;
    default:
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

function checkSegment(words, callDir, depth) {
  let start = 0;
  for (; start < words.length; start += 1) {
    const word = words[start];
    if (HOOK_SKIP_ENV.has(word)) {
      refuseSkip(`${word} skips the repository's hooks`);
    }
    if (!word.includes('=') && !PREFIXES.has(word) && !word.startsWith('-')) {
      break;
    }
  }
  if (start >= words.length) {
    return;
  }
  const command = words[start].split('/').pop();
  const args = words.slice(start + 1);
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
    words.some((word) => word.includes('.husky/')) &&
    [
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
      'awk',
      'install',
      'git',
    ].includes(command)
  ) {
    refuseSkip("editing .husky/ changes the repository's hooks");
  }
}

function checkCommand(text, callDir, depth = 0) {
  if (depth > 4) {
    return;
  }
  for (const segment of tokenize(text)) {
    checkSegment(segment, callDir, depth);
  }
  if (/>\s*\S*\.husky\//.test(text)) {
    refuseSkip("writing into .husky/ changes the repository's hooks");
  }
}

function decide(call) {
  const input = call.tool_input ?? {};
  const callDir = call.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const filePath = String(input.file_path ?? '');
  switch (call.tool_name) {
    case 'Bash':
      checkCommand(String(input.command ?? ''), callDir);
      break;
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
      if (isEnvPath(filePath)) {
        refuse(`${call.tool_name} on ${filePath} is refused. Environment files hold secrets.`);
      }
      if (call.tool_name !== 'Read' && /(?:^|\/)\.husky\//.test(filePath)) {
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
  if (!(error instanceof Refusal)) {
    throw error;
  }
  process.stderr.write(`git-guard refused this call: ${error.message}\n`);
  process.exitCode = 2;
}

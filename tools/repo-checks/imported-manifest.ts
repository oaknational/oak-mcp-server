const SHA256 = /^[0-9a-f]{64}$/;
const PATH = /^[A-Za-z0-9._/-]{1,200}$/;

export function importedManifestProblems(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return ['not valid JSON'];
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return ['must be an object'];
  }
  const problems: string[] = [];
  if (Object.keys(parsed).join() !== 'files') {
    problems.push('must hold exactly one key, "files"');
  }
  const files: unknown = (parsed as { files?: unknown }).files;
  if (typeof files !== 'object' || files === null || Array.isArray(files)) {
    return [...problems, '"files" must be an object'];
  }
  for (const [path, hash] of Object.entries(files)) {
    if (!PATH.test(path) || path.split('/').some((part) => part === '' || part === '..')) {
      problems.push('a path is not a clean relative path');
    }
    if (typeof hash !== 'string' || !SHA256.test(hash)) {
      problems.push('a hash is not 64 lowercase hex characters');
    }
  }
  return [...new Set(problems)];
}

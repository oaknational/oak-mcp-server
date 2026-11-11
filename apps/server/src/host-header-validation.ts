/** True when a character is one a wildcard may span: [a-z0-9.-]. */
function isWildcardSpanChar(character: string): boolean {
  return (
    (character >= 'a' && character <= 'z') ||
    (character >= '0' && character <= '9') ||
    character === '.' ||
    character === '-'
  );
}

/** True when every character in hostname[from, to) is wildcard-spannable. */
function isWildcardSpanValid(hostname: string, from: number, to: number): boolean {
  for (let index = from; index < to; index += 1) {
    if (!isWildcardSpanChar(hostname[index] ?? '')) {
      return false;
    }
  }
  return true;
}

/**
 * Binds the pattern's middle literal segments against the hostname,
 * leftmost-first, each landing at or before the anchored suffix with a
 * wildcard-spannable gap behind it. Returns the cursor after the last
 * bound segment, or null when they cannot bind.
 */
function bindMiddleSegments(
  hostname: string,
  segments: readonly string[],
  start: number,
  suffixStart: number,
): number | null {
  let cursor = start;
  for (const segment of segments) {
    const matchIndex = hostname.indexOf(segment, cursor);
    if (matchIndex === -1 || matchIndex + segment.length > suffixStart) {
      return null;
    }
    if (!isWildcardSpanValid(hostname, cursor, matchIndex)) {
      return null;
    }
    cursor = matchIndex + segment.length;
  }
  return cursor;
}

/**
 * Matches a hostname against a `*`-wildcard allow-list pattern without
 * constructing a regular expression from the pattern. Each `*` spans zero
 * or more characters from `[a-z0-9.-]`; literal segments must match
 * exactly; the match is anchored at both ends. Middle segments bind
 * leftmost-first and must land at or before the anchored suffix; every
 * character a `*` spans is checked against `[a-z0-9.-]`.
 */
function matchesWildcardHostPattern(hostname: string, pattern: string): boolean {
  const segments = pattern.split('*');
  // A wildcard-free pattern would alias one segment as both prefix and
  // suffix below, letting it be consumed twice; keep the no-wildcard case
  // exact-equality so the guarantee holds independently of the caller's
  // own `includes('*')` branch.
  if (segments.length < 2) {
    return hostname === pattern;
  }
  const first = segments[0] ?? '';
  const last = segments.at(-1) ?? '';
  if (!hostname.startsWith(first) || !hostname.endsWith(last)) {
    return false;
  }
  const suffixStart = hostname.length - last.length;
  const cursor = bindMiddleSegments(hostname, segments.slice(1, -1), first.length, suffixStart);
  if (cursor === null || cursor > suffixStart) {
    return false;
  }
  return isWildcardSpanValid(hostname, cursor, suffixStart);
}

/**
 * Returns true when a hostname matches one of the allow-list entries.
 * Supports exact entries and wildcard entries — multiple and interior
 * `*` included — each wildcard spanning zero or more of `[a-z0-9.-]`,
 * anchored at both ends. Allow-list entries are trimmed and lowercased
 * here; `hostname` is expected already lowercased and Host-validated
 * (both app callers apply `isValidHostHeader` + `extractHostname` first).
 */
export function isAllowedHostname(hostname: string, allowedHosts: readonly string[]): boolean {
  for (const rawAllowedHost of allowedHosts) {
    const allowedHost = rawAllowedHost.trim().toLowerCase();
    if (!allowedHost) {
      continue;
    }
    if (allowedHost.includes('*')) {
      if (matchesWildcardHostPattern(hostname, allowedHost)) {
        return true;
      }
      continue;
    }
    if (allowedHost === hostname) {
      return true;
    }
  }
  return false;
}

function hasForbiddenHostCharacters(host: string): boolean {
  return (
    host.includes('@') ||
    host.includes('/') ||
    host.includes('?') ||
    host.includes('#') ||
    host.includes(' ')
  );
}

function isValidBracketedHost(host: string): boolean {
  return /^\[[0-9a-fA-F:.]+\](?::\d+)?$/.test(host);
}

function isValidPlainHost(host: string): boolean {
  const match = /^([A-Za-z0-9.-]+)(?::\d+)?$/.exec(host);
  if (!match) {
    return false;
  }
  const hostname = match[1];
  if (hostname.startsWith('.') || hostname.endsWith('.') || hostname.includes('..')) {
    return false;
  }
  const labels = hostname.split('.');
  if (labels.some((label) => label.length === 0)) {
    return false;
  }
  return labels.every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
}

/**
 * Returns true when a Host header value is in a safe canonical format.
 */
export function isValidHostHeader(host: string): boolean {
  // Reject userinfo, path, query, fragments, and whitespace in Host header.
  if (hasForbiddenHostCharacters(host)) {
    return false;
  }
  if (host.startsWith('[')) {
    return isValidBracketedHost(host);
  }
  return isValidPlainHost(host);
}

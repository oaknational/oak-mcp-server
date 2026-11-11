/**
 * Redacts sensitive `key=value` parameters wherever they appear in a string:
 * a form body, a URL query or fragment, or a URL nested in another
 * parameter's value. One scanner treats `?`, `&` and `#` as parameter
 * boundaries, so it never has to decide whether a string is a URL or a form
 * body. Only matched values are replaced; the rest of the string is kept.
 */

interface ParamRedactionOptions {
  readonly isSensitiveKey: (key: string) => boolean;
  readonly encodedRedactedValue: string;
  readonly redactedValue: string;
}

const PARAM_PATTERN = /(^|[?&#])([^=&?#\s]+)=([^&?#\s]*)/gu;
const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+.-]*:\/\//iu;
const MAX_NESTED_DEPTH = 2;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replaceAll('+', ' '));
  } catch {
    return value;
  }
}

function redactNestedValue(value: string, options: ParamRedactionOptions, depth: number): string {
  if (depth >= MAX_NESTED_DEPTH) {
    return value;
  }

  const decoded = safeDecode(value);
  const redacted = redactWireString(decoded, options, depth + 1);
  if (redacted === decoded) {
    return value;
  }

  return decoded === value ? redacted : encodeURIComponent(redacted);
}

function redactParams(value: string, options: ParamRedactionOptions, depth: number): string {
  return value.replaceAll(PARAM_PATTERN, (_match, boundary: string, key: string, entry: string) => {
    const redactedEntry = options.isSensitiveKey(safeDecode(key))
      ? options.encodedRedactedValue
      : redactNestedValue(entry, options, depth);
    return `${boundary}${key}=${redactedEntry}`;
  });
}

function redactUrlCredentials(value: string, redactedValue: string): string {
  if (!ABSOLUTE_URL_PATTERN.test(value) || !value.includes('@')) {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.username === '' && url.password === '') {
      return value;
    }
    if (url.username !== '') {
      url.username = redactedValue;
    }
    if (url.password !== '') {
      url.password = redactedValue;
    }
    return url.toString();
  } catch {
    return value;
  }
}

function redactWireString(value: string, options: ParamRedactionOptions, depth: number): string {
  return redactUrlCredentials(redactParams(value, options, depth), options.redactedValue);
}

/**
 * Redacts sensitive parameters and URL credentials in a wire-format string.
 *
 * @returns The input unchanged when nothing sensitive was found.
 */
export function redactWireParams(value: string, options: ParamRedactionOptions): string {
  return redactWireString(value, options, 0);
}

interface FormRedactionOptions {
  readonly normaliseKey: (key: string) => string;
  readonly redactedQueryKeys: ReadonlySet<string>;
  readonly redactedValue: string;
  readonly shouldFullyRedactKey: (key: string) => boolean;
}

function shouldRedactFormKey(key: string, options: FormRedactionOptions): boolean {
  return (
    options.redactedQueryKeys.has(options.normaliseKey(key)) || options.shouldFullyRedactKey(key)
  );
}

function isLikelyFormEncodedPayload(value: string): boolean {
  if (/^[^\s=&/?#]+=/u.test(value) && (value.includes('&') || !/\s/u.test(value.trimEnd()))) {
    return true;
  }

  if (value.includes('://') || value.includes('?')) {
    return false;
  }

  return value.includes('&') || /^[^=\s]+=[^\s]*$/u.test(value);
}

function decodeFormKey(rawKey: string): string {
  return new URLSearchParams(rawKey).keys().next().value ?? '';
}

export function redactFormEncodedString(value: string, options: FormRedactionOptions): string {
  if (!isLikelyFormEncodedPayload(value)) {
    return value;
  }

  const encodedRedactedValue = encodeURIComponent(options.redactedValue);
  return value
    .split('&')
    .map((pair) => {
      const separator = pair.indexOf('=');
      if (separator === -1) {
        return pair;
      }

      const rawKey = pair.slice(0, separator);
      return shouldRedactFormKey(decodeFormKey(rawKey), options)
        ? `${rawKey}=${encodedRedactedValue}`
        : pair;
    })
    .join('&');
}

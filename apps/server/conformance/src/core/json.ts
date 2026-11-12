import { err, ok, unwrapOrThrow, type Result } from '@oaknational/result';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getJsonValue(record: JsonObject, key: string): unknown {
  return record[key];
}

/**
 * Require a non-empty string field on a JSON object, as an `Err` instead
 * of a throw (ADR-088). The single home of the error literal.
 */
export function requireString(record: JsonObject, key: string): Result<string, Error> {
  const value = getJsonValue(record, key);
  if (typeof value !== 'string' || value.length === 0) {
    return err(new Error(`missing required string field: ${key}`));
  }

  return ok(value);
}

/**
 * Require an array of strings, as an `Err` instead of a throw (ADR-088).
 * The single home of the error literal.
 */
export function parseStringArray(value: unknown, label: string): Result<readonly string[], Error> {
  // Array.from before every: every skips sparse holes, and a hole would
  // otherwise ship as undefined inside a value typed readonly string[].
  if (Array.isArray(value) && Array.from(value).every((entry) => typeof entry === 'string')) {
    return ok(value);
  }

  return err(new Error(`${label} must be an array of strings`));
}

/**
 * Parse JSON text at a trust boundary, as an `Err` instead of a throw
 * (ADR-088), converting the native `JSON.parse` `SyntaxError` into an
 * actionable error that names what the text was expected to be. A raw
 * parse failure ("No number after minus sign in JSON at position 1" when a
 * markdown file beginning with `---` is read as JSON) is position-only and
 * gives the caller no clue which surface — or which mis-passed `--active`
 * file — was malformed. The label restores that context; the original
 * error rides the `cause` chain. The single home of the message shape —
 * the throwing {@link parseJsonText} delegates here.
 */
export function parseJsonTextResult(text: string, label: string): Result<unknown, Error> {
  try {
    const value: unknown = JSON.parse(text);
    return ok(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return err(new Error(`${label} is not valid JSON: ${reason}`, { cause: error }));
  }
}

export function parseJsonText(text: string, label: string): unknown {
  return unwrapOrThrow(parseJsonTextResult(text, label));
}

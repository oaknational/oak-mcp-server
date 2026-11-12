import { err, ok, type Result } from '@oaknational/result';
import { z } from 'zod';

import { type JsonObject } from '../core/json.js';

/**
 * Example-args derivation for the reviewer-pack drive leg (MCP-303).
 *
 * The invocation for every tool comes from what the server itself
 * advertises: `tools/list` wire schemas carry per-property `examples`
 * arrays (the zod `.meta({ examples })` → `z.toJSONSchema` flow, proven
 * end-to-end in the app's e2e suite). Deriving from the wire keeps the
 * pack honest — a reviewer following it sees exactly what any connecting
 * client sees — and couples this tool to no SDK.
 *
 * The minimal honest invocation: every REQUIRED property takes its first
 * advertised example; optional properties are omitted. A required
 * property without an example is a loud failure naming the tool and every
 * missing property — the cure is to advertise examples at the schema
 * source, never to guess values here.
 */

/**
 * Example tool arguments: property name → its advertised example value.
 * The estate's `JsonObject` is the honest shape: every value came out of
 * the vendor's JSON output and is validated as a JSON value at this
 * boundary, so the type carries exactly what is known — JSON, no more.
 */
export type ExampleToolArgs = JsonObject;

const wireInputSchema = z
  .object({
    type: z.literal('object'),
    properties: z
      .record(z.string(), z.object({ examples: z.array(z.json()).optional() }).loose())
      .optional(),
    required: z.array(z.string()).optional(),
  })
  .loose();

/** Derive the minimal example invocation for one advertised tool. */
export function deriveExampleArgs(
  toolName: string,
  inputSchema: unknown,
): Result<ExampleToolArgs, string> {
  const parsed = wireInputSchema.safeParse(inputSchema);
  if (!parsed.success) {
    return err(
      `tool "${toolName}": its advertised inputSchema is not an object schema this derivation understands — ${parsed.error.message}`,
    );
  }
  const properties = parsed.data.properties ?? {};
  const required = parsed.data.required ?? [];
  const missing = required.filter((name) => properties[name]?.examples?.[0] === undefined);
  if (missing.length > 0) {
    return err(
      `tool "${toolName}": required propert${missing.length === 1 ? 'y' : 'ies'} "${missing.join('", "')}" advertise${missing.length === 1 ? 's' : ''} no example — add one at the schema source (.meta({ examples })) so the pack derives rather than guesses`,
    );
  }
  const args: ExampleToolArgs = Object.fromEntries(
    required.map((name) => [name, properties[name]?.examples?.[0]]),
  );
  return ok(args);
}

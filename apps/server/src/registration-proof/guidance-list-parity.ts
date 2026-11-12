import { z } from 'zod';

const guidanceListingSchema = z
  .object({
    name: z.string(),
    uri: z.string(),
    title: z.string(),
    description: z.string(),
    mimeType: z.string(),
    annotations: z
      .object({
        priority: z.number(),
        audience: z.array(z.enum(['user', 'assistant'])),
      })
      .strict(),
  })
  .strict();

interface GuidanceListingCandidate {
  readonly uri: string;
  readonly name?: string;
  readonly title?: string;
  readonly description?: string;
  readonly mimeType?: string;
  readonly annotations?: {
    readonly priority?: number;
    readonly audience?: readonly ('user' | 'assistant')[];
  };
}

interface ExpectedGuidanceListing extends GuidanceListingCandidate {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly mimeType: string;
  readonly annotations: {
    readonly priority: number;
    readonly audience: readonly ('user' | 'assistant')[];
  };
}

function requireExactListing(
  expected: ExpectedGuidanceListing,
  actual: GuidanceListingCandidate,
): void {
  const expectedResult = guidanceListingSchema.safeParse(expected);
  const actualResult = guidanceListingSchema.safeParse(actual);
  if (
    !expectedResult.success ||
    !actualResult.success ||
    JSON.stringify(actualResult.data) !== JSON.stringify(expectedResult.data)
  ) {
    throw new Error(
      `Guidance listing differs from canonical metadata: ${expected.uri}\n` +
        `expected: ${JSON.stringify(expected)}\n` +
        `actual: ${JSON.stringify(actual)}`,
    );
  }
}

/** Requires the full live descriptor and structural absence for dormant guidance. */
export function requireGuidanceListParity(
  expectedResources: readonly ExpectedGuidanceListing[],
  actualResources: readonly GuidanceListingCandidate[],
  liveUris: ReadonlySet<string>,
): void {
  const guidanceUris = new Set(expectedResources.map((resource) => resource.uri));
  const actualGuidance = actualResources.filter((resource) => guidanceUris.has(resource.uri));
  for (const expected of expectedResources) {
    const matches = actualGuidance.filter((resource) => resource.uri === expected.uri);
    if (!liveUris.has(expected.uri)) {
      if (matches.length !== 0) {
        throw new Error(`Dormant guidance appears in resources/list: ${expected.uri}`);
      }
      continue;
    }
    const [actual] = matches;
    if (matches.length !== 1 || actual === undefined) {
      throw new Error(
        `Live guidance has ${String(matches.length)} resources/list entries: ${expected.uri}`,
      );
    }
    requireExactListing(expected, actual);
  }
}

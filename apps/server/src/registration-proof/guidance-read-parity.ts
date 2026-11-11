import { z } from 'zod';

const guidanceReadResultSchema = z
  .object({
    contents: z.tuple([
      z
        .object({
          uri: z.string(),
          mimeType: z.string(),
          text: z.string(),
          _meta: z
            .object({
              lastModified: z.string(),
            })
            .strict(),
        })
        .strict(),
    ]),
  })
  .strict();

interface ObservedReadResult {
  readonly contents: readonly unknown[];
}

interface ExpectedGuidanceReadResult {
  readonly contents: readonly [
    {
      readonly uri: string;
      readonly mimeType: string;
      readonly text: string;
      readonly _meta: {
        readonly lastModified: string;
      };
    },
  ];
}

/** Requires the exact single content envelope served for one guidance resource. */
export function requireGuidanceReadResultParity(
  expected: ExpectedGuidanceReadResult,
  actual: ObservedReadResult,
): void {
  if (actual.contents.length !== 1) {
    throw new Error(
      `Guidance read returned ${String(actual.contents.length)} content entries: ${expected.contents[0].uri}`,
    );
  }
  const expectedResult = guidanceReadResultSchema.safeParse(expected);
  const actualResult = guidanceReadResultSchema.safeParse(actual);
  if (
    !expectedResult.success ||
    !actualResult.success ||
    JSON.stringify(actualResult.data) !== JSON.stringify(expectedResult.data)
  ) {
    throw new Error(
      `Served guidance envelope differs from canonical source: ${expected.contents[0].uri}`,
    );
  }
}

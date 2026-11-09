---
name: update-upstream-api-schema
description: >-
  Align this server to a changed upstream Oak Open Curriculum API schema
  (the OpenAPI document). Use on "upstream schema changed", "schema drift
  check failed", "refresh the API schema", "regenerate the SDK types", or a
  failing test in the override layers after an upstream deploy. Do not use
  to build new tools against an unchanged schema. It exists to stop
  hand-edited generated files, blind edits to red guard tests, validation
  loosened to pass drift, and a served surface that changes unreviewed.
---

# Update the upstream API schema

Generated types, Zod schemas and MCP tool definitions come from the committed OpenAPI snapshot. `pnpm codegen` regenerates them. Never edit generated files by hand. Change the generator or its templates instead.

Follow `docs/engineering/openapi-pipeline.md` for the pipeline and `packages/codegen` for the generator. This skill adds the order of work and the traps.

## Steps

1. **Characterise before regenerating.** Diff the live schema against the committed snapshot. Separate documentation-only changes from structural ones. Classify each structural change as additive or breaking for consumers. Do not start from the generator output.
2. **Refresh on purpose.** Run codegen in online mode, the mode the `schema-drift.yml` workflow uses. Read that workflow for the exact invocation. Cached mode (`pnpm codegen`) never fetches, so it cannot pick up a change.
3. **Expect red guard tests.** Tests over the description and parameter override layers fail when upstream rewords a claim the layer corrects. That failure is the signal to re-ground or retire the override entry. Never re-pin the expected text to turn the test green.
4. **Route upstream errors out.** Correct a wrong upstream description locally through the override layer, and report it upstream in plain words. Never loosen local validation to let drift pass.
5. **Check the served surface.** Run `pnpm surface:diff` and read at least one changed tool descriptor end to end. Confirm the generated reference under `apps/docs` reflects the change.
6. **Prove the tree is current.** Run `pnpm codegen && git diff --exit-code`, then `pnpm check` and `pnpm test`.
7. **Record breaking changes.** State each consumer-breaking change in the PR body with a one-line migration note, even when no code here is affected.

## Do not

- Edit generated output, or add a second source of truth for a tool's schema.
- Delete or skip a failing guard test to ship.
- Write to Linear from code. Report drift in a GitHub issue.

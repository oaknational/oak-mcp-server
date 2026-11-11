# Schema Cache

This folder holds the committed cache of the Oak National Academy Curriculum API OpenAPI
schema, exactly as returned by the API.

It is the default code-generation input in every environment — local, CI, and deployment
builds alike — so builds are hermetic and deterministic. Fetching from upstream is opt-in
(`pnpm sdk-codegen:refresh`, or `--online` / `SDK_CODEGEN_MODE=online`); see
`code-generation/resolve-schema-source.ts`.

On an online run the cache is rewritten whenever the fetched schema's serialised content
differs from the cached copy, since upstream can reword descriptions or add parameters
without bumping `info.version`.

This file is verbatim upstream truth: generator-side exclusions never apply here. See
`code-generation/excluded-paths.ts`.

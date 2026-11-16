# Notes on the fixtures folder

[`fixtures/`](fixtures/broken-link.md) holds markdown files with deliberately broken links and headings, each pinned by its own assertion in [`links.test.ts`](links.test.ts). The link checker excludes that folder from the sweep that requires every tracked document to have no broken link, so those fixtures can stay broken on purpose.

This file sits beside `fixtures/`, not inside it, and its name starts with the same word. [`links.test.ts`](links.test.ts) checks against the folder path plus a separator, not a bare prefix, so a file like this one stays in the sweep and a real dead link here would still fail the build. It is read by [`markdown-files.ts`](markdown-files.ts), the module the test imports.

# 0002. Own the dependencies and publish on a second consumer

- **Status:** Accepted (2026-11-09). Amends OOCE ADR-227.
- **Date:** 2026-11-09

## Context

OOCE ADR-227 planned for the Oak MCP product to be built in its own repository from packages published to the public `@oaknational` npm scope. OOCE would publish its shared toolkit first, and the new repository would depend on the published versions.

[ADR 0001](0001-repository-topology.md) changes the ground for that plan. No second consumer of those packages exists today. Oak's other web application uses vendor SDKs directly and has no Oak logger or environment wrapper to share.

## Decision

This repository owns the packages the server needs. They live in this repository and are built from source here.

A package is published to npm only when a second named consumer outside this repository commits to using it. Until then nothing is published. Day one publishes nothing.

This record amends ADR-227 on one point. ADR-227's ruling that the product builds from packages published by OOCE no longer holds. Its rulings on licences stay: code is MIT and curriculum content keeps its upstream terms.

## Consequences

- The server's dependencies change in one repository, in one pull request, with no publish and update cycle in between.
- Publishing carries an obligation to maintain a public API, so it waits until a real consumer asks for it.
- The consumer's commitment is recorded by name in the pull request that first publishes a package.
- OOCE's ADR-227 needs a note that this record amends it. That edit lands in OOCE.

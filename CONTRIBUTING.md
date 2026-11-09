# Contributing

This guide is for Oak National Academy team members who work on this repository. Anyone may read, fork and learn from the code under the MIT licence. We do not accept external pull requests or feature requests at present. This may change, so watch the repository for updates.

To report a security issue, follow the [security policy](SECURITY.md). By taking part, you agree to the [code of conduct](CODE_OF_CONDUCT.md).

## How changes land

> Design each change to land as a small PR, about 5 authored files and 10 at most. Split the work before branching, not under review. Build dependent PRs as a native GitHub stack with `gh stack`. This repository keeps at most 3 open layers in a stack. Each layer lands as soon as it is approved. A branch lives about a working day, unless a named review or infrastructure gate holds it.

## Before you open a pull request

- Run `pnpm check` and `pnpm test`. Both must pass.
- Title the pull request `MCP-nnn: type(scope): summary`, with a Linear issue id and a conventional commit type.
- Record a lasting design choice as an [architecture decision record](docs/adr/README.md).

## Licence

Your contribution is licensed under the [MIT licence](LICENCE).

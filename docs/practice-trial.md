# Practice trial

This repository is the first ADR-231 consuming-repository trial. It runs a minimal agent kernel instead of the full agent practice in `oak-open-curriculum-ecosystem` (OOCE). The kernel is `AGENTS.md`, the vendored oak-agent-skills and the git guard. The trial asks one question. Does the kernel keep change quality close to OOCE's at a fraction of the guidance an agent loads?

## When the trial runs

The trial starts on the date the PR that adds this file merges to `main`. `tools/trial-metrics/collect.ts` reads that date from git with `git log main --diff-filter=A --format=%cs -- docs/practice-trial.md`, so no commit has to record it.

The trial runs for 8 weeks or 40 merged PRs, whichever ends later.

## What the trial measures

`pnpm trial:metrics` prints one row per merged PR, with these four metrics:

- **Change failure.** A later merged PR reverts or hotfixes this PR within 7 days of its merge. A revert is a PR whose body has a GitHub `Reverts <repo>#<n>` line, or whose title starts with `Revert` and names `#<n>`. A hotfix is a PR with `hotfix` in its title or branch name that names `#<n>`. The column says `pending` until 7 days have passed, and the change-failure rate leaves pending rows out. A revert pushed straight to `main` without a PR is not counted.
- **Agent correction.** The PR carries the `agent-correction` label.
- **Open to merge.** Hours from the PR's creation to its merge.
- **Guidance tokens.** The characters of the always-on agent files at the PR's merge commit, divided by 4 and rounded down. The always-on files are `CLAUDE.md`, every file it imports with `@<path>.md`, followed recursively, and every `.claude/rules/*.md` file without `paths:` in its frontmatter. Skills load on demand, so their files do not count.

Below the table, the collector prints the change-failure rate, the agent-correction rate and the median open-to-merge time.

## Apply the agent-correction label

Apply `agent-correction` to a merged PR when a human had to correct an agent's output before the PR merged. A correction is a commit, a suggestion or a review comment that changes what the agent produced because it was wrong. Reviewer preferences, scope changes and review-bot comments are not corrections.

## What the trial compares against

The observational comparison uses OOCE's MCP-app PRs, which are the PRs that touch `apps/oak-curriculum-mcp-streamable-http/`. It reads two windows:

- the trial window itself, and
- the 90 days before the trial starts.

The three-arm task eval controls for the fact that the two repositories receive different work. Each arm gets the same 6 fixed tasks in a fresh session:

1. Add a tool.
2. Fix a tool bug.
3. Refresh the API schema.
4. Add a resource.
5. Tighten a guard.
6. Write docs for a tool.

The arms are the full OOCE practice, this kernel, and no agent practice at all. Every reported rate states its sample size, because 40 PRs or 6 tasks can show a difference that is only noise.

## How the trial decides

The kernel is adopted for `oak-engineering-skills` when both of these hold:

- its change-failure rate and its agent-correction rate are each within 20 percent of OOCE's, and
- it loads no more than a quarter of OOCE's guidance tokens.

## When to reconsider OOCE's coordination machinery

The kernel leaves out OOCE's coordination machinery: agent identity, claims, the plan corpus and the rule indexes. Reconsider that choice if concurrent agents collide twice in one month after one-worktree-per-agent is in place.

## Collect the metrics

Run the collector on this repository from the trial start:

```sh
pnpm trial:metrics
```

Before the trial starts, pass a start date:

```sh
pnpm trial:metrics --since 2026-11-01
```

To read OOCE, clone it, fetch `main`, and pass the clone so the collector can read the guidance files at each merge commit:

```sh
pnpm trial:metrics --repo oaknational/oak-open-curriculum-ecosystem --checkout ../ooce --since 2026-08-11 --until 2026-11-08 --path apps/oak-curriculum-mcp-streamable-http
```

The options are:

- `--repo <owner>/<name>` selects the repository. The default is `oaknational/oak-mcp-server`.
- `--since <YYYY-MM-DD>` and `--until <YYYY-MM-DD>` bound the merge dates, both inclusive. The collector still reads 7 days past `--until` to find reverts and hotfixes.
- `--checkout <dir>` is the clone the collector reads guidance files from. The default is the current directory.
- `--path <prefix>` keeps only PRs whose merge commit changes a file under the prefix.

The collector calls the GitHub GraphQL API through `gh`, one search per 100 PRs, and prints the call count on stderr. GitHub search returns at most 1000 results, so the collector fails on a wider window. Split the window with `--since` and `--until`.

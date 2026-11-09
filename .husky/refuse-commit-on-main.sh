#!/usr/bin/env sh

# Shared branch guard: main advances only through reviewed pull requests.
# The hooks that git routes commit-creating or ref-rewriting operations
# through source this file: pre-commit (plain and amend commits),
# pre-merge-commit (clean merges), prepare-commit-msg (cherry-pick, revert),
# applypatch-msg (git am, checked before the patch touches the tree) and
# pre-rebase (a rebase rewriting main). Each hook sets GUARD_HINT to its own
# recovery move. pre-rebase passes the branch under rebase in GUARD_BRANCH.
# Every other hook sets it empty before sourcing, so an ambient exported value
# cannot redirect the check. Detached HEAD resolves no branch name and passes.
# Fast-forward merges and fresh clones before install are covered by the
# remote branch ruleset, since no client hook can see them.
current_branch="${GUARD_BRANCH:-$(git symbolic-ref --quiet --short HEAD || true)}"
if [ "$current_branch" = "main" ]; then
  echo "❌ Refusing to commit on 'main' — main advances only via pull requests."
  echo "💡 ${GUARD_HINT:-Move the work to a branch: git switch -c <branch>}"
  exit 1
fi

#!/usr/bin/env sh

current_branch="${GUARD_BRANCH:-$(git symbolic-ref --quiet --short HEAD || true)}"
if [ "$current_branch" = "main" ]; then
  echo "❌ Refusing to commit on 'main' — main advances only via pull requests."
  echo "💡 ${GUARD_HINT:-Move the work to a branch: git switch -c <branch>}"
  exit 1
fi

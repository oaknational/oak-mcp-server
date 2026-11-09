#!/bin/sh
# PreToolUse hook for Bash, Read, Edit, Write. The decision logic is in git-guard.mjs.
# Exit 0 allows the call. Exit 2 refuses it and prints the reason to the agent.
exec node "$(dirname "$0")/git-guard.mjs"

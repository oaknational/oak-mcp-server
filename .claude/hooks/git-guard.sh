#!/bin/sh
# Exit 0 allows the call. Exit 2 refuses it and prints the reason to the agent.
exec node "$(dirname "$0")/git-guard.mjs"

#!/bin/sh
# SessionStart hook. Claude Code adds a SessionStart hook's stdout to the session's context.
cat <<'EOF'
Apply the `progress-reviews` rule in AGENTS.md. Check CronList first, and skip any review already scheduled. Otherwise use CronCreate to schedule three recurring reviews in this session, each at an off-minute (not :00 or :30):
- every 30 minutes: is the work in flight on the path to cutover? If not, start or unblock an item that is.
- every 60 minutes: name one learning from the hour (a repeated mistake, a slow loop, a wrong claim) and act on it, by encoding it as a check, skill or doc, or by raising it.
- every 4 hours: write a short progress note (what shipped, what is blocked and on whom, which learnings were acted on) and re-rank the backlog.
Each review ends with a concrete next action.
EOF

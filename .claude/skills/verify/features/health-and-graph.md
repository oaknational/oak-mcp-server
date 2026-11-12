# Health and graph

## Sub-features

- `/healthz` and `/mcp/healthz` answer liveness with a `graph` field.
- `/api/cron/refresh-graph` is the Vercel Cron target that rebuilds the graph snapshot. It is registered only when `CRON_SECRET` is set.

## How to get to it (user POV)

Pingdom polls `/healthz`. Vercel Cron calls the refresh route with `Authorization: Bearer <CRON_SECRET>`.

## Driving it with curl

`CRON_SECRET` is the value the skill's Launch section exports.

```bash
curl -si localhost:3333/healthz
curl -si localhost:3333/mcp/healthz
curl -si localhost:3333/api/cron/refresh-graph
curl -si -H "Authorization: Bearer wrong-$CRON_SECRET" localhost:3333/api/cron/refresh-graph
curl -si -H "Authorization: Bearer $CRON_SECRET" localhost:3333/api/cron/refresh-graph
```

Pass:

- Both health paths return 200 with `graph: { generatedAt, stale }`. A stale or missing graph still returns 200.
- No bearer and a wrong bearer both return 401 `{"error":"Unauthorized"}`.
- The right bearer returns `refreshed`, `skipped`, `refused` (500), `manifest-unavailable` (502) or `not-configured` (503).

## Gotchas

- `/healthz` caches the graph reading for 5 minutes. Restart the server to see a new snapshot at once.
- `not-configured` means the server has no refresh pipeline wired yet. It still proves the bearer check.

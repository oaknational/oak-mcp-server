# Cut production over to this repository

This runbook moves `mcp.thenational.academy` from the server in the Oak Open Curriculum Ecosystem (OOCE) repository to the server and docs in this repository. It is a draft. [P20](https://linear.app/oaknational/issue/MCP-820) finishes it once the open decisions below close.

A step marked `TBD (decision: …)` waits on an open decision. Do not run a TBD step until the runbook names the decision's outcome.

## Who acts

| Role                   | Acts at                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Operator               | Gives the go, runs the routing switch, decides on rollback, and runs each surface diff against production.   |
| Org admin              | Names the infrastructure applier and confirms access to Pingdom and the MCP Registry.                        |
| Infrastructure applier | Applies the production Terraform and publishes the MCP Registry entry.                                       |
| Cutover agent          | Runs the probes, the baseline capture, conformance and the checks after the switch, and records each result. |

## Open decisions

- Production routing. [ADR 0006](adr/0006-route-each-environment-with-vercel-microfrontends.md) proposes Vercel microfrontends, with `vercel.ts` and a server domain per environment as the fallback. [P19](https://linear.app/oaknational/issue/MCP-817) proves the choice on a staging host. Steps marked `TBD (decision: production routing)` depend on it.
- Production Blob store. [MCP-876](https://linear.app/oaknational/issue/MCP-876) decides how Terraform manages the Blob stores and how the token reaches the server project. Steps marked `TBD (decision: MCP-876)` depend on it.
- Hardening pass. [MCP-861](https://linear.app/oaknational/issue/MCP-861) runs the deferred live and perf checks before cutover begins. Steps marked `TBD (decision: MCP-861)` depend on its outcome.

## Run the surface diff against production

Production `/mcp` accepts only a Clerk OAuth access token. There is no read-only scope, so the token is a full credential for the account that signs in. Get a new token just before each production run of `pnpm surface:diff`, and revoke it straight after.

1. The operator reads `registration_endpoint`, `authorization_endpoint`, `token_endpoint` and `revocation_endpoint` from `https://mcp.thenational.academy/.well-known/oauth-authorization-server`.
2. The operator registers a client at `registration_endpoint` (dynamic client registration), with `token_endpoint_auth_method` set to `none` and a loopback redirect URI, and keeps the `client_id`.
3. The operator runs the authorization code flow with PKCE (`S256`), with `scope=email` and `resource=https://mcp.thenational.academy/mcp`, and signs in with the production test account. Do not request `openid`. Sign-in refuses it.
4. The operator exchanges the code at `token_endpoint`. The `access_token` in the response is the token.
5. The operator sets the token only in the environment variable `SURFACE_DIFF_BEARER_TOKEN`. Paste it at the silent prompt of `read`, so that it never appears in a command line or in shell history. `surface:diff` has no option for the token, so never pass it as an argument.

   ```sh
   read -rs SURFACE_DIFF_BEARER_TOKEN
   export SURFACE_DIFF_BEARER_TOKEN
   ```

6. The operator runs the `pnpm surface:diff` command that the step names, in the same shell, and shares the output with the cutover agent.
   - If it fails with `HTTP 401` or `HTTP 403`, the token expired or was issued for a different resource. Revoke it and start again at step 1.
   - If it fails with `report suppressed`, the target's response contained the token. Treat the token as exposed. Revoke it at once, do not share the output, and treat the check as failed.
7. The operator revokes the token and unsets the variable, even when the run failed.

   ```sh
   curl -sS -X POST "<revocation_endpoint>" \
     --data-urlencode "token=$SURFACE_DIFF_BEARER_TOKEN" \
     --data-urlencode "client_id=<client_id>"
   unset SURFACE_DIFF_BEARER_TOKEN
   ```

`surface:diff` refuses `--write-baseline` while `SURFACE_DIFF_BEARER_TOKEN` is set, and refuses any run without `--target`. Capture a baseline without a token, from a target that is not production.

## Before the switch

Complete every item before you ask the operator for the go.

1. The cutover agent confirms that MCP-861 is Done. `TBD (decision: MCP-861)`
2. The cutover agent confirms that [P19](https://linear.app/oaknational/issue/MCP-817) has merged and that `pnpm edge:probes https://mcp-staging.thenational.academy` prints `ok` for every line in `tools/edge-probes/expected.txt`.
3. The cutover agent confirms that [P20](https://linear.app/oaknational/issue/MCP-820) has merged.
4. The infrastructure applier applies the production Terraform in `infrastructure/project/`, after the operator's go for that apply. It turns on production for the server and docs projects and sets `CRON_SECRET`.
5. The infrastructure applier gives the production server write access to the production Blob store. `TBD (decision: MCP-876)`
6. The infrastructure applier adds the production host to the routing configuration. `TBD (decision: production routing)`
7. The cutover agent confirms that the production deployments from this repository are live, and that `x-app-version` on their `/mcp/healthz` shows this repository's release version.
8. The cutover agent captures the pre-cutover snapshot in a clean checkout of `main`, without a token. The target is OOCE's server at the commit of the current production deployment, running locally with auth disabled. Keep the changed `tools/surface-diff/baseline.json` in that checkout, uncommitted, until the checks after the switch pass.

   ```sh
   pnpm surface:diff --target http://localhost:<port>/mcp --write-baseline "OOCE production at <commit>, auth disabled"
   ```

9. The operator confirms that the snapshot matches production, per [Run the surface diff against production](#run-the-surface-diff-against-production), in the checkout that holds the snapshot. It passes when the command prints `surface identical` and exits 0. If it fails, stop. The snapshot does not describe production.

   ```sh
   pnpm surface:diff --expect-identical --target https://mcp.thenational.academy/mcp
   ```

10. The cutover agent saves the output of `pnpm edge:probes https://mcp.thenational.academy` as the pre-switch record. Expect the lines that need the docs app to fail, because OOCE serves no docs.
11. The cutover agent records the pre-switch p95 latency of `tools/list` and one search tool call, from 200 production requests that alternate between the two calls.
12. The cutover agent confirms that the rollback rehearsal on staging passed. See [Rehearse the rollback on staging](#rehearse-the-rollback-on-staging).
13. The cutover agent confirms that Pingdom checks `/mcp/healthz` and is green.
14. The cutover agent confirms that failed cron runs and failed cron-triggered deployments alert the same channel as failed production deployments.
15. The cutover agent records the current OOCE production deployment, which stays deployed and serving for 14 days after the switch. `TBD (decision: production routing)`

## Switch production

1. The operator gives an explicit go for the switch. Ask immediately before step 2, not earlier.
2. The operator records the switch time in UTC.
3. The operator points `mcp.thenational.academy` at this repository's projects. `TBD (decision: production routing)`
4. The cutover agent runs `pnpm edge:probes https://mcp.thenational.academy` until every line prints `ok`. If any line still fails after 5 minutes, start [Roll back](#roll-back).

## Check production after the switch

The cutover agent runs these checks right after the switch. If a check fails, tell the operator, who decides whether to roll back.

1. The operator runs the surface diff, per [Run the surface diff against production](#run-the-surface-diff-against-production), in the checkout that holds the pre-cutover snapshot. It passes when the command exits 0. The only expected differences are the removed `oak-under-the-hood` tool and the server instructions without its paragraph.

   ```sh
   pnpm surface:diff --target https://mcp.thenational.academy/mcp
   ```

2. Request `/mcp/healthz` and confirm that `x-app-version` shows this repository's release version.
3. Request the three carousel image URLs and `/mcp/healthz`. Each returns 200 with the right content type.
4. Load `https://mcp.thenational.academy/` in a browser. The docs home page renders with the strict CSP and no console errors.
5. Run production conformance. Results match the baselines.
6. Sign in from Claude and from ChatGPT with the production test account, which holds no personal data. Tools list, and one search call returns results.
7. Use a Claude connector that was added before the switch. It keeps working without being added again.
8. Watch Sentry and PostHog production for 30 minutes. Events carry the new release, and the error rate is not above the previous 7-day median.
9. Record the p95 latency from 200 production requests in the hour after the switch, as in the pre-switch step. If it exceeds the pre-switch p95 by more than 15 percent, roll back.
10. Confirm that Pingdom stayed green across the switch.
11. The infrastructure applier publishes `apps/server/server.json` to the MCP Registry. The cutover agent then fetches the registry entry. Its repository URL names this repository, and `remotes[0].url` is unchanged.
12. Record the switch time on the Linear issue for the switch. It starts the 14-day window before the server is deleted from OOCE.

Share screenshots and sign-in captures with the operator in chat only. Do not commit them or attach them to a public PR. Crop any account identifier.

## Roll back

Roll back when the probes fail 5 minutes after the switch, when the latency rule fails, or when the operator decides to. OOCE's production project stays deployed for 14 days after the switch, so rollback needs no new deployment.

1. The operator points `mcp.thenational.academy` back at OOCE's production project. `TBD (decision: production routing)`
2. The cutover agent runs `pnpm edge:probes https://mcp.thenational.academy`. Rollback passes when every line that printed `ok` in the pre-switch record prints `ok` again within 5 minutes of step 1.
3. The operator runs the surface diff in rollback mode, per [Run the surface diff against production](#run-the-surface-diff-against-production), in the checkout that holds the pre-cutover snapshot. Rollback passes when the command prints `surface identical` and exits 0. Without `--expect-identical`, the command expects the two differences this repository makes, and fails on a correct rollback to OOCE.

   ```sh
   pnpm surface:diff --expect-identical --target https://mcp.thenational.academy/mcp
   ```

4. The cutover agent records the rollback time and the reason on the Linear issue for the switch. A rollback restarts the 14-day window at the next switch.

## Rehearse the rollback on staging

Rehearse before [P20](https://linear.app/oaknational/issue/MCP-820) merges. The rehearsal runs the [Roll back](#roll-back) steps against `mcp-staging.thenational.academy` instead of the production host.

1. The cutover agent confirms that every line of `pnpm edge:probes https://mcp-staging.thenational.academy` prints `ok`.
2. The operator switches the staging host's routing to the previous origin. `TBD (decision: production routing)`
3. The cutover agent runs the probes against the staging host until they show the previous origin, and records the time it took.
4. The operator switches the staging routing back. The cutover agent runs the probes until every line prints `ok`.
5. The cutover agent saves the probe output and both timings as `rollback-rehearsal.txt`, for the operator's review in chat. The rehearsal passes when the probes go green on the previous origin within 5 minutes.

# Cut production over to this repository

This draft moves `mcp.thenational.academy` from the server in the Oak Open Curriculum Ecosystem (OOCE) repository to the server in this repository. The docs launch follows design sign-off. [P19](https://linear.app/oaknational/issue/MCP-817) tracks routing the docs and server on one host. [P20](https://linear.app/oaknational/issue/MCP-820) finishes this runbook.

A step marked `TBD (decision: …)` waits on an open decision. Do not run a TBD step until the runbook names the decision's outcome.

## Who acts

| Role                   | Acts at                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Operator               | Gives the go, runs the routing switch, decides on rollback, and runs each surface diff against production.   |
| Org admin              | Names the infrastructure applier and confirms access to Pingdom and the MCP Registry.                        |
| Infrastructure applier | Applies the production Terraform and publishes the MCP Registry entry.                                       |
| Cutover agent          | Runs the probes, the baseline capture, conformance and the checks after the switch, and records each result. |

## Open decisions

- Production routing. Cloud-Config manages the production hostname as a proxied CNAME to OOCE's Vercel project. Confirm that both Vercel projects are in the same team, then rehearse Vercel's project-domain move in both directions on staging. Record whether the move also requires a CNAME update in Cloud-Config. Steps marked `TBD (decision: production routing)` depend on that rehearsal. [Vercel's project-domain move procedure](https://vercel.com/docs/domains/working-with-domains/transfer-your-domain#transferring-domains-between-projects)
- Production Blob store. [MCP-876](https://linear.app/oaknational/issue/MCP-876) decides how Terraform manages the Blob stores and how the token reaches the server project. Steps marked `TBD (decision: MCP-876)` depend on it.

## Run the surface diff with a production token

Use a Clerk OAuth access token from the production test account to compare OOCE, the production candidate, and the server after the switch. The token has the account's full access. Get a fresh token for each run and revoke it afterwards. Use the candidate's verified HTTPS deployment URL when testing the candidate.

1. The operator reads `registration_endpoint`, `authorization_endpoint`, `token_endpoint` and `revocation_endpoint` from `https://mcp.thenational.academy/.well-known/oauth-authorization-server`.
2. The operator registers a client at `registration_endpoint` (dynamic client registration), with `token_endpoint_auth_method` set to `none` and a loopback redirect URI, and keeps the `client_id`.
3. The operator runs the authorization code flow with PKCE (`S256`), with `scope=email` and `resource=https://mcp.thenational.academy/mcp`, and signs in with the production test account. Do not request `openid`. Sign-in refuses it.
4. The operator exchanges the code at `token_endpoint`. The `access_token` in the response is the token. Do steps 2 to 4 in a browser or an OAuth client tool, not with shell commands, so that the authorization code, the PKCE verifier and the token never go on a command line.
5. The operator sets the token only in the environment variable `SURFACE_DIFF_BEARER_TOKEN`. Paste it at the silent prompt of `read`, so that it never appears in a command line or in shell history. `surface:diff` has no option for the token, so never pass it as an argument.

   ```sh
   read -rs SURFACE_DIFF_BEARER_TOKEN
   export SURFACE_DIFF_BEARER_TOKEN
   ```

6. The operator runs the `pnpm surface:diff` command that the step names, in the same shell, and shares the output with the cutover agent. The command exits 0 when the surface matches, 1 when it differs and 2 when it cannot run. While `SURFACE_DIFF_BEARER_TOKEN` is set, the output gives only the number of differences of each kind, and ends with `details withheld while SURFACE_DIFF_BEARER_TOKEN is set`. See [Find the differences behind the counts](#find-the-differences-behind-the-counts).
   - If it fails with `HTTP 401` or `HTTP 403`, revoke the token and retry with a fresh one. If the candidate still refuses it, check the Vercel access policy, Clerk instance, and canonical host before proceeding.
   - If it fails with `report suppressed`, the target's response contained the token. Treat the token as exposed. Revoke it at once, do not share the output, and treat the check as failed.
7. The operator revokes the token and unsets the variable, even when the run failed. `printf` is a shell builtin and `token@-` makes `curl` read the token from stdin, so the token never appears in a process's arguments.

   ```sh
   printf '%s' "$SURFACE_DIFF_BEARER_TOKEN" | curl -sS -X POST "<revocation_endpoint>" \
     --data-urlencode "token@-" \
     --data-urlencode "client_id=<client_id>"
   unset SURFACE_DIFF_BEARER_TOKEN
   ```

When `SURFACE_DIFF_BEARER_TOKEN` is set, `surface:diff` requires `--target` and refuses `--write-baseline`. Capture the baseline from the local OOCE server with the token unset.

### Find the differences behind the counts

With `SURFACE_DIFF_BEARER_TOKEN` set, `surface:diff` prints counts only. To see which differences the counts refer to, rerun the command locally in the same checkout after revoking the token. Keep `--expect-identical` if the authenticated run used it.

- For a run against OOCE, use the current OOCE production commit with auth disabled, as in [Compare the candidate with live production](#compare-the-candidate-with-live-production).

  ```sh
  pnpm surface:diff --expect-identical --target "http://localhost:<port>/mcp"
  ```

- For a run against the candidate or this repository's live server, use the matching commit. Run `pnpm build` first. Leave out `--target` to capture the server in memory, or run the server locally with auth disabled and pass its `/mcp` URL as `--target`.

  ```sh
  pnpm build
  pnpm surface:diff
  ```

The rerun prints each difference. It explains the production counts only when its headline gives the same number of unexpected differences as the production run. If the numbers differ, the local target does not serve the same surface as production. Check that it runs the commit that production runs, and run it again.

## Check the server version

Send `GET /mcp` with `Accept: text/html`. The response returns 406 and carries the release in `x-app-version`. Use `/mcp/healthz` to check health.

## Before the switch

Complete every item before you ask the operator for the go.

### Prove staging and rehearse the move

1. The org admin names the infrastructure applier and confirms access to Terraform Cloud, Vercel, and Cloudflare. The operator confirms access to the staging and production test accounts. [MCP-787](https://linear.app/oaknational/issue/MCP-787), [MCP-786](https://linear.app/oaknational/issue/MCP-786), and [MCP-818](https://linear.app/oaknational/issue/MCP-818)
2. The infrastructure applier provisions the staging hostname with staging Clerk, search, and Blob credentials. The cutover agent runs `pnpm edge:probes --server-only https://mcp-staging.thenational.academy`. Every line must print `ok`. [Staging DNS](https://linear.app/oaknational/issue/MCP-812)
3. Using staging Clerk, sign in afresh from Claude and ChatGPT. List tools, run a curriculum search and a graph query, read a resource, open an MCP widget, and download a permitted asset. Exercise the streaming and performance checks in [MCP-861](https://linear.app/oaknational/issue/MCP-861). Save the results and confirm that its remaining deferred checks pass before closing it.
4. Run [MCPJam conformance](#run-mcpjam-conformance) on staging. Save the verdict and raw reports.
5. [Rehearse the rollback on staging](#rehearse-the-rollback-on-staging). Record the order of the Vercel move and any Cloud-Config change in both directions. Confirm that [P20](https://linear.app/oaknational/issue/MCP-820) has merged before applying production Terraform.

### Deploy and seed the production candidate

1. The infrastructure applier prepares Terraform Cloud plans for the function project in `infrastructure/project/` and the production Blob store. Use the Blob approach agreed in [MCP-876](https://linear.app/oaknational/issue/MCP-876). Confirm the plan connects the private production store to the function project as `BLOB_READ_WRITE_TOKEN`. Use a separate store for staging and previews. `TBD (decision: MCP-876)`
2. Wire the Oak API key, production search credentials, observability settings, and `CRON_SECRET` through the function project's production environment. Use `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` for the existing production Clerk instance. Set `CANONICAL_HOST=mcp.thenational.academy` and confirm that host is allowed. Keep production docs builds disabled. [Server environment configuration](../apps/server/docs/vercel-environment-config.md)
3. Get the operator's go for the apply. Apply the reviewed function and Blob plans. Record the current Vercel domain assignment and prepare any rehearsed Cloud-Config change for the switch.
4. Deploy a versioned release to the function project's production environment. Record the commit SHA, release version, and verified HTTPS deployment URL. Automatic `main` deployments are disabled in `apps/server/vercel.json`, so confirm that the release deployment has actually run. [Check the server version](#check-the-server-version) at the deployment URL.
5. From an approved client, send `GET /api/cron/refresh-graph` to the candidate with the production `CRON_SECRET` as the bearer. For an empty store, require `200` and `status: refreshed`. Read `/mcp/healthz` and confirm `graph.generatedAt` is populated and `graph.stale` is `false`.
6. Run a repeat refresh and confirm that unchanged source returns `status: skipped` and leaves the snapshot readable. Verify that the scheduled refresh reaches the same store and failed runs alert the deployment channel.

### Compare the candidate with live production

1. The cutover agent captures the pre-cutover snapshot in a clean checkout of `main`, without a token. The target is OOCE's server at the commit of the current production deployment, running locally with auth disabled. Keep the changed `tools/surface-diff/baseline.json` in that checkout, uncommitted, until the checks after the switch pass.

   ```sh
   pnpm surface:diff --target "http://localhost:<port>/mcp" --write-baseline "OOCE production at <commit>, auth disabled"
   ```

2. The operator confirms that the snapshot matches production, per [Run the surface diff with a production token](#run-the-surface-diff-with-a-production-token). Require `surface identical` and exit 0 before testing the candidate.

   ```sh
   pnpm surface:diff --expect-identical --target https://mcp.thenational.academy/mcp
   ```

3. At the candidate URL, confirm protected-resource metadata advertises `https://mcp.thenational.academy/mcp` and the existing production Clerk issuer `https://clerk.thenational.academy`. Compare the candidate's OAuth metadata with live. Both must advertise the same production endpoints.
4. In the checkout holding the verified snapshot, run the diff against the candidate with a fresh token issued for the public production resource. Require exit 0 with only the expected differences listed under [Check production after the switch](#check-production-after-the-switch). Use the production test account to call search and a graph tool on the candidate. Confirm results.

   ```sh
   pnpm surface:diff --target "https://<candidate-deployment-host>/mcp"
   ```

5. Run `pnpm edge:probes --server-only` against the candidate origin and live production. Save both outputs and require every line to print `ok`. Run the MCPJam protocol verdict against the candidate and save its report. [Run MCPJam conformance](#run-mcpjam-conformance)
6. Record the pre-switch p95 latency from 200 live production requests that alternate between `tools/list` and one search call. Confirm Pingdom is green on `/mcp/healthz`.
7. Record the current OOCE deployment and its [server version](#check-the-server-version). Keep that deployment available for 14 days after the switch. `TBD (decision: production routing)`

## Run MCPJam conformance

Complete [MCP-959](https://linear.app/oaknational/issue/MCP-959) before using MCPJam as a cutover gate. Use its reviewed baselines for the verdict. A `--seed` capture provides baseline evidence. The cutover gate requires a passing verdict run and saved raw reports.

Run the unattended protocol and OAuth suites on staging, then on the canonical production endpoint after the switch. Get the operator's go before running the OAuth suite against the production Clerk instance. That suite registers a client.

```sh
pnpm --filter @oaknational/mcp-server conformance --target "https://<host>/mcp" --unattended --report-dir "<report-dir>"
```

For the production candidate before the switch, add `--suite protocol`. Its OAuth metadata advertises the live endpoints, so the authenticated candidate test uses a token from the live issuer and sends the tool calls to the deployment URL.

## Switch production

1. The cutover agent confirms that the destination Vercel project still serves the tested release. Repeat the candidate checks if its deployment changed. Ask for the operator's explicit go immediately before step 2.
2. The operator records the switch time in UTC.
3. The operator moves `mcp.thenational.academy` to this repository's Vercel server project using the rehearsed procedure. Apply a Cloud-Config CNAME change during the switch if the rehearsal required one. `TBD (decision: production routing)`
4. The cutover agent runs `pnpm edge:probes --server-only https://mcp.thenational.academy` and [checks the server version](#check-the-server-version). If any probe still fails or the new release version is missing after 5 minutes, start [Roll back](#roll-back).

## Check production after the switch

The cutover agent runs these checks right after the switch. If a check fails, tell the operator, who decides whether to roll back.

1. The operator runs the surface diff, per [Run the surface diff with a production token](#run-the-surface-diff-with-a-production-token), in the checkout that holds the pre-cutover snapshot. It passes when the command exits 0. The only expected differences are the removed `oak-under-the-hood` tool and the server instructions without its paragraph.

   ```sh
   pnpm surface:diff --target https://mcp.thenational.academy/mcp
   ```

2. [Check the server version](#check-the-server-version) against this repository's release.
3. Request the three carousel image URLs and `/mcp/healthz`. Each returns 200 with the right content type. Confirm the graph snapshot still reports `graph.stale: false`.
4. Request `https://mcp.thenational.academy/` with `Accept: text/html`. The server returns a JSON 404, as it did before the switch.
5. Run [MCPJam conformance](#run-mcpjam-conformance) on the canonical production endpoint. Require a passing verdict.
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

1. The operator moves `mcp.thenational.academy` back to OOCE's Vercel project. Revert any Cloud-Config CNAME change in the order proved during the rehearsal. `TBD (decision: production routing)`
2. The cutover agent runs `pnpm edge:probes --server-only https://mcp.thenational.academy`. Within 5 minutes of step 1, every probe must pass and the [server version](#check-the-server-version) must match the OOCE release.
3. The operator runs the surface diff in rollback mode, per [Run the surface diff with a production token](#run-the-surface-diff-with-a-production-token), in the checkout that holds the pre-cutover snapshot. Rollback passes when the command prints `surface identical` and exits 0. Without `--expect-identical`, the command expects the two differences this repository makes, and fails on a correct rollback to OOCE.

   ```sh
   pnpm surface:diff --expect-identical --target https://mcp.thenational.academy/mcp
   ```

4. The cutover agent records the rollback time and the reason on the Linear issue for the switch. A rollback restarts the 14-day window at the next switch.

## Rehearse the rollback on staging

Rehearse before [P20](https://linear.app/oaknational/issue/MCP-820) merges. Use `mcp-staging.thenational.academy` and staging credentials. Confirm the two Vercel projects are in the same team before testing the project-domain move.

1. The cutover agent [records the server version](#check-the-server-version) at each staging origin. Use distinct versions so the header proves which project answered. Run `pnpm edge:probes --server-only https://mcp-staging.thenational.academy` and confirm that every probe passes through the new origin.
2. The operator moves the staging hostname to the previous project using Vercel's project-domain move. Record whether Vercel also requires a CNAME update and when to apply it.
3. The cutover agent runs the probes until every line prints `ok` and the [server version](#check-the-server-version) matches the previous release. Record the time it took.
4. The operator moves the staging hostname back to the new project. The cutover agent runs the probes until every line prints `ok` and the [server version](#check-the-server-version) matches the new release. Record the time it took.
5. The cutover agent saves the probe output and both timings as `rollback-rehearsal.txt`, for the operator's review in chat. The rehearsal passes when the probes go green on the previous origin within 5 minutes.

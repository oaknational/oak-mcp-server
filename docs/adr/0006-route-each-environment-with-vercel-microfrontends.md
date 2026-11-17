# 0006. Route each environment with Vercel microfrontends

- **Status:** Proposed (2026-11-17). Amends [0005](0005-route-the-shared-host-with-vercel-rewrites.md), once the operator approves the microfrontends group.
- **Date:** 2026-11-17

## Context

ADR 0005 routes the shared host with external rewrites in `apps/docs/vercel.json`. Review found that the decision is incomplete, because staging must reach the staging server and production the production server, and a `vercel.json` rewrite has one fixed destination.

- Rewrites in `vercel.json` take no environment variables. Vercel documents `$VAR` expansion only for the lower-level `routes` property ([vercel.json reference](https://vercel.com/docs/project-configuration/vercel-json)).
- Both projects deploy through the Git integration. The shared Terraform module `oak-terraform-modules//modules/vercel_project` at `v3.0.0`, which `infrastructure/project/main.tf` calls, sets `git_repository` on each project. Both projects get `domains = []`, so neither has a custom domain, and the server has no stable origin per environment.

## Options

1. **CLI deploys with `--local-config`.** A workflow would deploy the docs with an environment's own config file ([vercel deploy](https://vercel.com/docs/cli/deploy), [global options](https://vercel.com/docs/cli/global-options#local-config)). This needs a Vercel token in GitHub and turning off Git deployments for the docs project. It still needs a stable server origin per environment.
2. **Vercel microfrontends.** The docs project is the default application and the server is a child. Vercel routes each listed path to the child within the same request, with no second hop ([routing](https://vercel.com/docs/microfrontends/routing)). It also picks the child deployment per environment. A production domain routes to the child's production deployment. A custom environment domain routes to the child's custom environment of the same name, and a branch URL routes to the same branch's deployment, each with a configurable fallback ([managing](https://vercel.com/docs/microfrontends/managing-microfrontends#fallback-environment)). The group is a Terraform resource, `vercel_microfrontend_group` with `vercel_microfrontend_group_membership`. Pro includes 2 microfrontends projects and bills routed requests at $2 per million ([pricing](https://vercel.com/docs/microfrontends#limits-and-pricing)).
3. **A stable server domain per environment.** The module's `domains` and `custom_environments` inputs give the server a staging and a production domain, each with a proxied Cloudflare CNAME. The docs config then needs a different destination per environment, so this option needs option 1 or 5 as well, and new DNS records.
4. **A docs project per environment.** Each project's `vercel.json` would name its own server. This doubles the docs projects. Both would build from `apps/docs`, so each would need its own root directory or a generated config to hold a different `vercel.json`. It also needs option 3's domains.
5. **`vercel.ts`.** Vercel runs `vercel.ts` at build time, so it can read environment variables to choose rewrites ([vercel.ts](https://vercel.com/docs/project-configuration/vercel-ts)). It works with the Git integration, but it needs the `@vercel/config` package and option 3's domains.

## Decision

Use Vercel microfrontends (option 2). The docs project is the group's default application and the server project is the child. `microfrontends.json` in `apps/docs` lists the ADR 0004 paths for the server.

The reasons, in order of weight:

1. **Each environment reaches its own server with no configured origin.** Production, custom environments and branch previews each pick the matching server deployment. No server domain, environment variable or per-environment file is needed.
2. **Docs previews keep working.** A docs preview routes server paths to the server's deployment on the same branch, or to the fallback environment.
3. **It removes the extra hop that ADR 0005 accepted.** Child routing happens inside one request. The server project's firewall still checks child paths, as the [security page](https://vercel.com/docs/microfrontends/managing-microfrontends/security) describes.
4. **Vercel picks the application before it serves a file.** It reads `microfrontends.json` to choose the application for a path, so a docs file should not shadow a server path. The shadowing check stays until that is verified.

Option 5 with option 3 is the fallback if the operator declines the billing or the group.

## Consequences

- The operator decides the billing, and the role that MCP-787 names applies the group Terraform in `infrastructure/`.
- The `apps/docs` export and the Express server need `@vercel/microfrontends`, and any asset outside a routed path needs a prefix ([quickstart](https://vercel.com/docs/microfrontends/quickstart)). Whether a static export works as the default application is checked on the first preview.
- Until the group exists, nothing is deployed for routing. `tools/edge-probes/server-paths.json` holds the path list, and the stub test checks it.

## What is not yet verified

- That a Next.js static export works as the default application.
- That an Express project on Vercel works as a child without code changes.
- Streaming over 60 seconds, and routed p95 latency, through microfrontends routing.
- That a docs file at a server path does not shadow the child.
- Whether the team's included microfrontends projects are already in use.

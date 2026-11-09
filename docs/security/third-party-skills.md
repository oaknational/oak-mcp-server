# Third-party skills

No third-party skill enters this repository without a recorded security review of what it can run. A pin in `skills-lock.json` is the adoption moment. This file holds the review for each pin.

## Rule

- Before a skill is pinned, list everything a harness or the skill's own text can run. That covers hooks, scripts, install-time code, session-start injectors, eval runners and commands the skill tells the agent to run.
- A markdown-only skill records that it has nothing a harness runs. That record is the review.
- A skill that ships anything runnable records what runs, when, and with what reach.
- Each review names the source, the licence and the commit SHA it covered.
- A pin bump needs a new review at the new SHA. The old review stays as history.
- Prefer file-level content with no install hooks. Never install a pack as a harness plugin with auto-run hooks unless its review covers that surface and finds it safe.

## How the check works

`tools/repo-checks/skills-review.ts` reads `skills-lock.json` and this file. It fails when a pin has no section headed `### <skill name>` that carries a `- SHA:` line equal to the pin's `ref`. The `agent-skills.yml` workflow runs it.

## Reviews

Each skill below was read at the pinned SHA, from a shallow checkout of the source repository. The reviewer listed every file in the skill's directory and searched each for shell commands, network calls and install steps. Scripts were read in full. Plugin manifests beside the skill were read for hooks. The scope is what the pinned skill can run, not what the vendor's whole repository ships.

### add-app-to-server

- Source: `modelcontextprotocol/ext-apps`, path `plugins/mcp-apps/skills/add-app-to-server/SKILL.md`
- SHA: `19256f52cad5517ba8272581ed2e11d6a81273d5`
- Licence: MIT in the plugin manifest. The repository `LICENSE` says the project is moving to Apache-2.0, with contributions that lack relicensing consent staying MIT.
- Runs: nothing. The skill is one markdown file. The plugin manifest declares no hooks.
- Commands the text tells the agent to run: `npm install` for `@modelcontextprotocol/ext-apps`, the MCP client and server packages, `zod`, `vite` and `vite-plugin-singlefile`. Reach is the npm registry through the operator's package manager. Version ranges come from the skill text.
- Verdict: safe to pin as file-level content. Install commands in the text are advisory, and the repository's own dependency rules decide what lands.

### clerk

- Source: `clerk/skills`, path `skills/clerk/SKILL.md`
- SHA: `c5d2c0d6c5b63243146b4893c875f6ebef55977c`
- Licence: MIT, declared in the skill's front matter and in `plugin.json`.
- Runs: nothing. The skill is one markdown file that routes to other Clerk skills. It sets no `allowed-tools`.
- Out of scope: the repository's `.mcp.json` points a plugin install at `https://mcp.clerk.com/mcp`. That runs only when the whole repository is installed as a harness plugin, which this pin does not do.
- Verdict: safe to pin as file-level content.

### clerk-backend-api

- Source: `clerk/skills`, path `skills/clerk-backend-api/SKILL.md`
- SHA: `c5d2c0d6c5b63243146b4893c875f6ebef55977c`
- Licence: MIT, declared in the skill's front matter and in `plugin.json`.
- Runs: the skill directory holds four scripts, `scripts/api-specs-context.sh`, `scripts/extract-endpoint-detail.sh`, `scripts/extract-tag-endpoints.sh` and `scripts/extract-tags.js`. No hook runs them. They run only when the agent follows the skill text, which grants `Bash, Read, Grep, Skill, WebFetch`.
- Reach of the scripts: `api-specs-context.sh` calls `api.github.com` and `raw.githubusercontent.com` for the public `clerk/openapi-specs` repository, with no credential. The other three read a spec from standard input and write only to a `mktemp` directory they delete on exit. None reads an environment secret.
- Reach of the skill text: it tells the agent to call `https://api.clerk.com/v1` with `curl` and `Authorization: Bearer $CLERK_SECRET_KEY`, including create and delete calls. The text requires confirmation before a write and a warning before a delete. A production secret key would give those calls production reach.
- Verdict: safe to pin as file-level content for development use. Run it only against a development Clerk instance. Never expose the production secret key to a session that loads this skill.

### clerk-testing

- Source: `clerk/skills`, path `skills/clerk-testing/SKILL.md`
- SHA: `c5d2c0d6c5b63243146b4893c875f6ebef55977c`
- Licence: MIT, declared in the skill's front matter and in `plugin.json`.
- Runs: nothing. The skill is one markdown file with `allowed-tools: WebFetch`.
- Commands the text tells the agent to run: `npx clerk@latest init` to create a development Clerk application. The text limits keys to `pk_test_` and `sk_test_` development keys. Reach is the npm registry and Clerk.
- Verdict: safe to pin as file-level content. Treat `npx clerk@latest` as an unpinned download and run it only on request.

### convert-web-app

- Source: `modelcontextprotocol/ext-apps`, path `plugins/mcp-apps/skills/convert-web-app/SKILL.md`
- SHA: `19256f52cad5517ba8272581ed2e11d6a81273d5`
- Licence: MIT in the plugin manifest. The repository `LICENSE` says the project is moving to Apache-2.0, with contributions that lack relicensing consent staying MIT.
- Runs: nothing. The skill is one markdown file. The plugin manifest declares no hooks.
- Commands the text tells the agent to run: `npm install` for the MCP Apps packages, `zod`, `tsx`, `vite` and `vite-plugin-singlefile`. Reach is the npm registry through the operator's package manager.
- Verdict: safe to pin as file-level content.

### create-mcp-app

- Source: `modelcontextprotocol/ext-apps`, path `plugins/mcp-apps/skills/create-mcp-app/SKILL.md`
- SHA: `19256f52cad5517ba8272581ed2e11d6a81273d5`
- Licence: MIT in the plugin manifest. The repository `LICENSE` says the project is moving to Apache-2.0, with contributions that lack relicensing consent staying MIT.
- Runs: nothing. The skill is one markdown file. The plugin manifest declares no hooks.
- Commands the text tells the agent to run: `npm install` for the MCP Apps packages and a set of build and Express dev dependencies. Reach is the npm registry through the operator's package manager.
- Verdict: safe to pin as file-level content.

### mcp-inspector

- Source: `mcpjam/inspector`, path `skills/mcp-inspector/SKILL.md`, with four files under `skills/mcp-inspector/references/`
- SHA: `61748456c506a7021aff6f9d325e39d38af0df0d`
- Licence: Apache-2.0 for content outside `/server/services` and `/server/routes/mcp/evals.ts`, per the repository `LICENSE`. The skill directory is outside both paths. GitHub does not detect the licence automatically because the file carries extra text.
- Runs: nothing ships with the skill. It is five markdown files with no scripts and no hooks.
- Commands the text tells the agent to run: the `mcpjam` CLI, which the pack does not ship. That includes `probe`, `oauth login`, `oauth conformance`, `xaa run` and `inspector start` and `inspector open`. `oauth login` can write tokens to a file the agent names, at mode 0600. `inspector start` opens a local server. Reach is whatever MCP server URL the operator gives, plus the CLI's own network use.
- Verdict: safe to pin as file-level content. The CLI is a separate adoption. Review it before anyone installs it, and never point `oauth login` at production credentials from a shared machine.

### migrate-oai-app

- Source: `modelcontextprotocol/ext-apps`, path `plugins/mcp-apps/skills/migrate-oai-app/SKILL.md`
- SHA: `19256f52cad5517ba8272581ed2e11d6a81273d5`
- Licence: MIT in the plugin manifest. The repository `LICENSE` says the project is moving to Apache-2.0, with contributions that lack relicensing consent staying MIT.
- Runs: nothing. The skill is one markdown file. The plugin manifest declares no hooks.
- Commands the text tells the agent to run: `npm install`, `pnpm add` or `yarn add` for the MCP Apps packages. Reach is the npm registry through the operator's package manager.
- Verdict: safe to pin as file-level content.

# Third-party skills

No third-party skill enters this repository without a recorded security review of what it can run. A pin in `skills-lock.json` is the adoption moment. This file holds the review for each pin.

## Rule

- Before a skill is pinned, list everything a harness or the skill's own text can run. That covers hooks, scripts, install-time code, session-start injectors, eval runners and commands the skill tells the agent to run.
- A markdown-only skill records that it has nothing a harness runs. That record is the review.
- A skill that ships anything runnable records what runs, when, and with what reach.
- Each review names the source, the licence and the commit SHA it covered.
- A review lists every command in the skill's text that fetches or runs content no pin covers, such as a clone of a moving tag, and says whether an agent may run it.
- A pin bump needs a new review at the new SHA. The old review stays as history.
- Prefer file-level content with no install hooks. Never install a pack as a harness plugin with auto-run hooks unless its review covers that surface and finds it safe.

## How the check works

`tools/repo-checks/skills-review.ts` reads `skills-lock.json` and this file. It parses this file as Markdown, so HTML comments and code fences count for nothing. A pin passes only when a level-3 section headed exactly `### <skill name>` holds two list items. One is `- SHA:` followed by the pin's `ref` in a code span and nothing else. The other is `- Source:` followed by the pin's `source` in a code span, then `path` and the pin's `skillPath` in a code span. A section with more than one `- SHA:` line fails, so an old review cannot be reused for a new SHA. The `agent-skills.yml` workflow runs it.

## Reviews

Each skill below was read at the pinned SHA, from a shallow checkout of the source repository. The reviewer listed every file in the skill's directory and searched each for shell commands, network calls and install steps. Scripts were read in full. Plugin manifests beside the skill were read for hooks. The scope is what the pinned skill can run, not what the vendor's whole repository ships.

### add-app-to-server

- Source: `modelcontextprotocol/ext-apps`, path `plugins/mcp-apps/skills/add-app-to-server/SKILL.md`
- SHA: `19256f52cad5517ba8272581ed2e11d6a81273d5`
- Licence: MIT in the plugin manifest. The repository `LICENSE` says the project is moving to Apache-2.0, with contributions that lack relicensing consent staying MIT. Documentation in the project (excluding specifications) is licensed CC-BY-4.0, and the skill text and the cloned `docs/` fall under those terms. Keep attribution and a link to the licence on any of that text copied into this repository.
- Runs: nothing. The skill is one markdown file. The plugin manifest declares no hooks.
- Commands the text tells the agent to run: `npm install` for `@modelcontextprotocol/ext-apps`, the MCP client and server packages, `zod`, `vite` and `vite-plugin-singlefile`. Reach is the npm registry through the operator's package manager. Version ranges come from the skill text.
- Fetched without a pin: the text tells the agent to run `git clone --branch "v$(npm view @modelcontextprotocol/ext-apps version)" --depth 1 https://github.com/modelcontextprotocol/ext-apps.git /tmp/mcp-ext-apps`. That clones the latest npm-tagged release into `/tmp`. Neither this pin nor the SHA above covers it, and the clone changes on each release. The agent then reads `src/`, `docs/` and `examples/` from it as guidance.
- Started from the clone: the text tells the agent to run `npm install` and then `npm run start` in `/tmp/mcp-ext-apps/examples/basic-host`. `npm install` pulls the clone's whole dependency tree from the npm registry, and runs any lifecycle scripts it or its dependencies declare. `npm run start` runs a local host process that connects to the MCP server URL in `SERVERS`.
- Verdict: the pin is acceptable as file-level content, because the pinned text is markdown with no hook. The text is not safe to follow as written. The unpinned clone, the install and the start sit outside this review. Agents in this repository must not run them without the operator's approval, per `AGENTS.md`. Read the pinned text and the published API docs instead.

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
- Secret in the transcript: the skill's first write-safety step runs `echo $CLERK_SECRET_KEY | head -c 10`. That prints the key's `sk_` prefix and its first characters into the session output, which can reach transcripts and logs. Do not run it. Check that the variable is set without printing it.
- Eval data: `evals/evals.json` holds prompts and expected outputs for a skill eval runner. It is data, not code. No harness here runs it, and none of its text is a command.
- Reach of the skill text: it tells the agent to call `https://api.clerk.com/v1` with `curl` and `Authorization: Bearer $CLERK_SECRET_KEY`, including create and delete calls. The text requires confirmation before a write and a warning before a delete. A production secret key would give those calls production reach.
- Verdict: safe to pin as file-level content for development use. Run it only against a development Clerk instance, and skip the `head -c 10` echo. Never expose the production secret key to a session that loads this skill.

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
- Licence: MIT in the plugin manifest. The repository `LICENSE` says the project is moving to Apache-2.0, with contributions that lack relicensing consent staying MIT. Documentation in the project (excluding specifications) is licensed CC-BY-4.0, and the skill text and the cloned `docs/` fall under those terms. Keep attribution and a link to the licence on any of that text copied into this repository.
- Runs: nothing. The skill is one markdown file. The plugin manifest declares no hooks.
- Commands the text tells the agent to run: `npm install` for the MCP Apps packages, `zod`, `tsx`, `vite` and `vite-plugin-singlefile`. Reach is the npm registry through the operator's package manager.
- Fetched without a pin: the text tells the agent to run `git clone --branch "v$(npm view @modelcontextprotocol/ext-apps version)" --depth 1 https://github.com/modelcontextprotocol/ext-apps.git /tmp/mcp-ext-apps`. That clones the latest npm-tagged release into `/tmp`. Neither this pin nor the SHA above covers it, and the clone changes on each release. The agent then reads `src/`, `docs/` and `examples/` from it as guidance.
- Started from the clone: the text tells the agent to run `npm install` and then `npm run start` in `/tmp/mcp-ext-apps/examples/basic-host`. `npm install` pulls the clone's whole dependency tree from the npm registry, and runs any lifecycle scripts it or its dependencies declare. `npm run start` runs a local host process that connects to the MCP server URL in `SERVERS`.
- Verdict: the pin is acceptable as file-level content, because the pinned text is markdown with no hook. The text is not safe to follow as written. The unpinned clone, the install and the start sit outside this review. Agents in this repository must not run them without the operator's approval, per `AGENTS.md`. Read the pinned text and the published API docs instead.

### create-mcp-app

- Source: `modelcontextprotocol/ext-apps`, path `plugins/mcp-apps/skills/create-mcp-app/SKILL.md`
- SHA: `19256f52cad5517ba8272581ed2e11d6a81273d5`
- Licence: MIT in the plugin manifest. The repository `LICENSE` says the project is moving to Apache-2.0, with contributions that lack relicensing consent staying MIT. Documentation in the project (excluding specifications) is licensed CC-BY-4.0, and the skill text and the cloned `docs/` fall under those terms. Keep attribution and a link to the licence on any of that text copied into this repository.
- Runs: nothing. The skill is one markdown file. The plugin manifest declares no hooks.
- Commands the text tells the agent to run: `npm install` for the MCP Apps packages and a set of build and Express dev dependencies. Reach is the npm registry through the operator's package manager.
- Fetched without a pin: the text tells the agent to run `git clone --branch "v$(npm view @modelcontextprotocol/ext-apps version)" --depth 1 https://github.com/modelcontextprotocol/ext-apps.git /tmp/mcp-ext-apps`. That clones the latest npm-tagged release into `/tmp`. Neither this pin nor the SHA above covers it, and the clone changes on each release. The agent then reads `src/`, `docs/` and `examples/` from it as guidance.
- Started from the clone: the text tells the agent to run `npm install` and then `npm run start` in `/tmp/mcp-ext-apps/examples/basic-host`. `npm install` pulls the clone's whole dependency tree from the npm registry, and runs any lifecycle scripts it or its dependencies declare. `npm run start` runs a local host process that connects to the MCP server URL in `SERVERS`.
- Verdict: the pin is acceptable as file-level content, because the pinned text is markdown with no hook. The text is not safe to follow as written. The unpinned clone, the install and the start sit outside this review. Agents in this repository must not run them without the operator's approval, per `AGENTS.md`. Read the pinned text and the published API docs instead.

### mcp-inspector

- Source: `mcpjam/inspector`, path `skills/mcp-inspector/SKILL.md`, with four files under `skills/mcp-inspector/references/`
- SHA: `61748456c506a7021aff6f9d325e39d38af0df0d`
- Licence: Apache-2.0 for content outside `/server/services` and `/server/routes/mcp/evals.ts`, per the repository `LICENSE`. The skill directory is outside both paths. GitHub does not detect the licence automatically because the file carries extra text.
- Runs: nothing ships with the skill. It is five markdown files with no scripts and no hooks.
- Commands the text tells the agent to run: the `mcpjam` CLI, which the pack does not ship. That includes `probe`, `oauth login`, `oauth conformance`, `xaa run` and `inspector start` and `inspector open`, and `tools call`, which executes a named tool on the target server with arguments the agent supplies. `tools call --ui` also starts or attaches to the local Inspector backend. `--open` makes the CLI open a system browser, and `--no-open` and `--attach-only` stop that. `oauth login` can write tokens to a file the agent names, at mode 0600. `inspector start` opens a local server. Reach is whatever MCP server URL the operator gives, plus the CLI's own network use.
- Verdict: safe to pin as file-level content. The CLI is a separate adoption. Review it before anyone installs it, and never point `oauth login` at production credentials from a shared machine.

### migrate-oai-app

- Source: `modelcontextprotocol/ext-apps`, path `plugins/mcp-apps/skills/migrate-oai-app/SKILL.md`
- SHA: `19256f52cad5517ba8272581ed2e11d6a81273d5`
- Licence: MIT in the plugin manifest. The repository `LICENSE` says the project is moving to Apache-2.0, with contributions that lack relicensing consent staying MIT. Documentation in the project (excluding specifications) is licensed CC-BY-4.0, and the skill text and the cloned `docs/` fall under those terms. Keep attribution and a link to the licence on any of that text copied into this repository.
- Runs: nothing. The skill is one markdown file. The plugin manifest declares no hooks.
- Commands the text tells the agent to run: `npm install`, `pnpm add` or `yarn add` for the MCP Apps packages. Reach is the npm registry through the operator's package manager.
- Fetched without a pin: the text tells the agent to run `git clone --branch "v$(npm view @modelcontextprotocol/ext-apps version)" --depth 1 https://github.com/modelcontextprotocol/ext-apps.git /tmp/mcp-ext-apps`. That clones the latest npm-tagged release into `/tmp`. Neither this pin nor the SHA above covers it, and the clone changes on each release. The agent then reads `src/`, `docs/` and `examples/` from it as guidance.
- Started from the clone: the text tells the agent to run `npm install` and then `npm run start` in `/tmp/mcp-ext-apps/examples/basic-host`. `npm install` pulls the clone's whole dependency tree from the npm registry, and runs any lifecycle scripts it or its dependencies declare. `npm run start` runs a local host process that connects to the MCP server URL in `SERVERS`.
- Verdict: the pin is acceptable as file-level content, because the pinned text is markdown with no hook. The text is not safe to follow as written. The unpinned clone, the install and the start sit outside this review. Agents in this repository must not run them without the operator's approval, per `AGENTS.md`. Read the pinned text and the published API docs instead.

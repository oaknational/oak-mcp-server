import { spawnSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

import { parse } from 'smol-toml';

const CONFIG_PATH = '.gitleaks.toml';
const DEFAULT_CONFIG = '[extend]\nuseDefault = true\n';

export interface ScanConfig {
  source: string;
  toml: string;
}

export function resolveScanConfig(baseConfig: string | undefined): ScanConfig {
  if (baseConfig === undefined) {
    return {
      source: `no ${CONFIG_PATH} at the base, gitleaks default rules`,
      toml: DEFAULT_CONFIG,
    };
  }
  const config = parse(baseConfig);
  const extend = typeof config['extend'] === 'object' ? config['extend'] : {};
  if ('path' in extend) {
    throw new Error(
      `${CONFIG_PATH} at the base sets [extend] path. gitleaks reads that file from the PR's working tree, so a PR could supply its own allowlist. Inline the rules instead.`,
    );
  }
  const useDefault = 'useDefault' in extend && extend['useDefault'] === true;
  const customRules = Array.isArray(config['rules']) ? config['rules'].length : 0;
  if (!useDefault && customRules === 0) {
    throw new Error(
      `${CONFIG_PATH} at the base has zero rules: no [[rules]] and no [extend] useDefault = true. The scan would pass without checking anything.`,
    );
  }
  const rules = `${String(customRules)} custom rule${customRules === 1 ? '' : 's'}`;
  return {
    source: `${CONFIG_PATH} at the base, ${rules}, default rules ${useDefault ? 'on' : 'off'}`,
    toml: baseConfig,
  };
}

function git(args: string[]): { ok: boolean; stdout: string } {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return { ok: result.status === 0, stdout: result.stdout };
}

function main(): void {
  const base = process.env['BASE_SHA'] ?? '';
  if (!git(['cat-file', '-e', `${base}^{commit}`]).ok) {
    throw new Error(`BASE_SHA '${base}' is not a commit in this checkout`);
  }
  const file = git(['show', `${base}:${CONFIG_PATH}`]);
  const config = resolveScanConfig(file.ok ? file.stdout : undefined);
  writeFileSync(process.argv[2] ?? '', config.toml);
  const summary = `secret-scan: config from ${config.source} (base ${base.slice(0, 12)}).\n`;
  process.stdout.write(summary);
  const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryFile !== undefined && summaryFile !== '') {
    appendFileSync(summaryFile, `### secret-scan\n\n${summary}`);
  }
}

if (import.meta.main) {
  main();
}

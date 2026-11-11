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
  if (Object.keys(config).some((key) => key.toLowerCase().startsWith('extend.'))) {
    throw new Error(
      `${CONFIG_PATH} at the base has a literal dotted extend key such as "extend.path". viper expands it into [extend], past this check. Write it inside [extend] instead.`,
    );
  }
  if (fields(config, 'extend').length > 1) {
    throw new Error(
      `${CONFIG_PATH} at the base has more than one extend table differing only in case. viper keeps one of them, so the rules gitleaks loads are unknown. Keep a single [extend].`,
    );
  }
  const extendTables = fields(config, 'extend').filter(
    (value): value is Record<string, unknown> => typeof value === 'object' && !Array.isArray(value),
  );
  if (extendTables.some((table) => fields(table, 'path').length > 0)) {
    throw new Error(
      `${CONFIG_PATH} at the base sets [extend] path. gitleaks reads that file from the PR's working tree, so a PR could supply its own allowlist. Inline the rules instead.`,
    );
  }
  const defaults = extendTables.flatMap((table) => fields(table, 'usedefault'));
  const useDefault = defaults.length > 0 && defaults.every((value) => value === true);
  const ruleLists = fields(config, 'rules');
  const customRules =
    ruleLists.length === 0
      ? 0
      : Math.min(...ruleLists.map((value) => (Array.isArray(value) ? value.length : 0)));
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

// gitleaks loads its config through viper, which matches keys without regard to case.
function fields(table: Readonly<Record<string, unknown>>, lowerKey: string): unknown[] {
  return Object.entries(table)
    .filter(([key]) => key.toLowerCase() === lowerKey)
    .map(([, value]) => value);
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

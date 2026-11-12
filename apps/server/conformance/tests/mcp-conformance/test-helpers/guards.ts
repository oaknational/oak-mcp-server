/**
 * Throw-guard for test narrowing (`no-conditional-tests`): an impossible
 * fixture shape THROWS instead of conditionally returning out of the test
 * body, so every assertion after the guard runs unconditionally.
 */
export function requireDefined<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`test fixture invariant broken: ${label} is undefined`);
  }
  return value;
}

import { createSdkConfig } from '../tsup.preset';

export default createSdkConfig([
  'src/**/*.ts',
  '!src/**/*.test.ts',
  '!src/**/*.spec.ts',
  '!src/**/*.typecheck.ts',
]);

import { createLibConfig } from '../tsup.preset';

export default createLibConfig({ external: ['@sentry/node'] });

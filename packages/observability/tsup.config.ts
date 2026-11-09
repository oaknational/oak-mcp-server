import { createLibConfig } from '../tsup.preset';

export default createLibConfig({ external: ['@opentelemetry/api'] });

/**
 * Response headers that expose the current app build version.
 */
import type { ExpressWithAppId } from './bootstrap-helpers.js';

interface AppVersionHeaders {
  readonly 'x-app-version': string;
}

/**
 * Create response headers from the app build identity value.
 */
export function createAppVersionHeaders(appVersion: string): AppVersionHeaders {
  return {
    'x-app-version': appVersion,
  };
}

/**
 * Mount middleware setting the app-version header on every response.
 */
export function mountAppVersionHeader(app: ExpressWithAppId, appVersion: string): void {
  app.use((_req, res, next) => {
    res.set(createAppVersionHeaders(appVersion));
    next();
  });
}

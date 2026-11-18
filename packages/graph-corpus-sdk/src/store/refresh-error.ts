/** Why a graph refresh threw instead of writing or refusing. */
export type RefreshFailure = 'write-contention' | 'latest-read-failed' | 'missing-etag';

export class GraphRefreshError extends Error {
  override readonly name = 'GraphRefreshError';
  readonly failure: RefreshFailure;

  constructor(failure: RefreshFailure, message: string, options?: ErrorOptions) {
    super(message, options);
    this.failure = failure;
  }
}

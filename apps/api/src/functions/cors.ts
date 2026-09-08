import { app, type HttpResponseInit } from '@azure/functions';

import { preflightResponse } from '../http/responses';

/**
 * A single catch-all handler for CORS preflight.
 *
 * The Functions host treats two functions on the same route as a conflict if
 * their method sets overlap, so `GET /parking-requests` and
 * `POST /parking-requests` cannot each also declare `OPTIONS`. Registering one
 * `OPTIONS`-only function on a wildcard route sidesteps that entirely and keeps
 * every other handler single-purpose.
 *
 * Handling CORS in code rather than via `func start --cors` means the behaviour
 * is identical on every machine and is covered by tests.
 */
export async function corsPreflight(): Promise<HttpResponseInit> {
  return preflightResponse();
}

app.http('corsPreflight', {
  methods: ['OPTIONS'],
  authLevel: 'anonymous',
  route: '{*restOfPath}',
  handler: corsPreflight,
});

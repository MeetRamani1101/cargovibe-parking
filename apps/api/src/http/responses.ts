import type { HttpResponseInit, InvocationContext } from '@azure/functions';
import type { ApiErrorBody, ApiErrorCode, FieldIssue } from '@cargovibe/shared';

import { DomainError } from '../domain/errors';

/**
 * CORS is handled here rather than through `func start --cors` so that the
 * behaviour is identical on every machine and visible in the code. It is wide
 * open because this is a local prototype; in a real deployment the allowed
 * origin would come from configuration.
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function jsonResponse(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    jsonBody: body,
  };
}

/** Adds a single header to an existing response without losing the CORS ones. */
export function withHeader(
  response: HttpResponseInit,
  name: string,
  value: string,
): HttpResponseInit {
  return {
    ...response,
    headers: { ...(response.headers as Record<string, string> | undefined), [name]: value },
  };
}

export function noContentResponse(): HttpResponseInit {
  return { status: 204, headers: { ...CORS_HEADERS } };
}

export function preflightResponse(): HttpResponseInit {
  return { status: 204, headers: { ...CORS_HEADERS } };
}

export function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: FieldIssue[],
): HttpResponseInit {
  const body: ApiErrorBody = {
    error: { code, message, ...(details && details.length > 0 ? { details } : {}) },
  };
  return jsonResponse(status, body);
}

/**
 * The one place that turns a thrown error into a response.
 *
 * Domain errors carry their own status and code. Anything else is a bug, so it
 * is logged in full and reported as a generic 500 - internal messages and stack
 * traces never reach the client.
 */
export function toErrorResponse(error: unknown, context: InvocationContext): HttpResponseInit {
  if (error instanceof DomainError) {
    context.warn(`${error.code}: ${error.message}`);
    return errorResponse(error.httpStatus, error.code, error.message, error.details);
  }

  context.error('Unhandled error while processing request', error);
  return errorResponse(500, 'internal_error', 'An unexpected error occurred.');
}

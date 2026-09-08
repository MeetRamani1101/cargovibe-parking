import type { HttpRequest } from '@azure/functions';
import {
  PARKING_REQUEST_STATUSES,
  TRUCK_TYPES,
  type ParkingRequestStatus,
  type TruckType,
} from '@cargovibe/shared';

import { MalformedJsonError, ValidationError } from '../domain/errors';
import type { ParkingRequestFilter } from '../repositories/parkingRequestRepository';

/**
 * The subset of `HttpRequest` the handlers actually use. Typing against this
 * lets the handler tests pass plain objects instead of constructing a real
 * `HttpRequest`, while remaining structurally compatible with the real one.
 */
export interface ReadableHttpRequest {
  method: string;
  params: Record<string, string>;
  query: Pick<URLSearchParams, 'get' | 'getAll'>;
  json: () => Promise<unknown>;
}

// Compile-time check that the real request still satisfies the narrowed shape.
export type _AssertCompatible = HttpRequest extends ReadableHttpRequest ? true : never;

/** Reads the body as JSON, treating an empty body as `{}`. */
export async function readJsonBody(request: ReadableHttpRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new MalformedJsonError();
  }
}

export function requirePathParam(request: ReadableHttpRequest, name: string): string {
  const value = request.params[name];
  if (!value) {
    throw new ValidationError([{ field: name, message: `${name} is missing from the route.` }]);
  }
  return value;
}

/**
 * Parses `?status=` and `?truckType=`. Both accept a comma-separated list or a
 * repeated parameter. An unknown value is a 400 rather than a silently empty
 * result, so a typo in a client is noticed immediately.
 */
export function parseListFilter(request: ReadableHttpRequest): ParkingRequestFilter | undefined {
  const status = parseEnumParam<ParkingRequestStatus>(request, 'status', PARKING_REQUEST_STATUSES);
  const truckType = parseEnumParam<TruckType>(request, 'truckType', TRUCK_TYPES);

  if (!status && !truckType) return undefined;
  return { ...(status ? { status } : {}), ...(truckType ? { truckType } : {}) };
}

function parseEnumParam<T extends string>(
  request: ReadableHttpRequest,
  name: string,
  allowed: readonly T[],
): T[] | undefined {
  const raw = request.query
    .getAll(name)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (raw.length === 0) return undefined;

  const invalid = raw.filter((value) => !(allowed as readonly string[]).includes(value));
  if (invalid.length > 0) {
    throw new ValidationError([
      {
        field: name,
        message: `Unknown ${name} value(s): ${invalid.join(', ')}. Allowed: ${allowed.join(', ')}.`,
      },
    ]);
  }

  return [...new Set(raw)] as T[];
}

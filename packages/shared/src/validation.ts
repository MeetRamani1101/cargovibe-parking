import {
  PARKING_REQUEST_STATUSES,
  TRUCK_TYPES,
  type CreateParkingRequestInput,
  type FieldIssue,
  type ParkingRequestStatus,
  type TruckType,
  type UpdateParkingRequestStatusInput,
} from './types';
import { requiresParkingSpot } from './status';

/**
 * A tiny hand-rolled validation layer.
 *
 * Deliberately dependency-free: this package is consumed by the Metro bundler
 * as well as by Node, and the rule set is small enough that a schema library
 * would add more weight than it removes. The important property is that the
 * *same* functions run on both sides, so the mobile app can pre-validate a
 * form with exactly the rules the API will apply.
 */

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: FieldIssue[] };

const MAX_TEXT_LENGTH = 200;
const MAX_NOTE_LENGTH = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Trimmed, non-empty, length-bounded string. */
function readRequiredString(
  source: Record<string, unknown>,
  field: string,
  issues: FieldIssue[],
  maxLength = MAX_TEXT_LENGTH,
): string | undefined {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === '') {
    issues.push({ field, message: `${field} is required.` });
    return undefined;
  }
  if (typeof raw !== 'string') {
    issues.push({ field, message: `${field} must be a string.` });
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    issues.push({ field, message: `${field} must not be empty.` });
    return undefined;
  }
  if (trimmed.length > maxLength) {
    issues.push({ field, message: `${field} must be at most ${maxLength} characters.` });
    return undefined;
  }
  return trimmed;
}

/** Optional string: absent/null/empty all mean "not provided". */
function readOptionalString(
  source: Record<string, unknown>,
  field: string,
  issues: FieldIssue[],
  maxLength = MAX_TEXT_LENGTH,
): string | undefined {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') {
    issues.push({ field, message: `${field} must be a string.` });
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > maxLength) {
    issues.push({ field, message: `${field} must be at most ${maxLength} characters.` });
    return undefined;
  }
  return trimmed;
}

/**
 * Accepts any string `Date` can parse, but requires it to look like ISO 8601
 * so that `new Date('truck')`-style coercions cannot slip through.
 * Returns the value normalised to a UTC ISO string.
 */
const ISO_8601 = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function readIsoDate(
  source: Record<string, unknown>,
  field: string,
  issues: FieldIssue[],
): string | undefined {
  const raw = readRequiredString(source, field, issues, 64);
  if (raw === undefined) return undefined;
  if (!ISO_8601.test(raw)) {
    issues.push({ field, message: `${field} must be an ISO 8601 date-time string.` });
    return undefined;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    issues.push({ field, message: `${field} is not a valid date.` });
    return undefined;
  }
  return parsed.toISOString();
}

function readEnum<T extends string>(
  source: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
  issues: FieldIssue[],
): T | undefined {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === '') {
    issues.push({ field, message: `${field} is required.` });
    return undefined;
  }
  if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) {
    issues.push({ field, message: `${field} must be one of: ${allowed.join(', ')}.` });
    return undefined;
  }
  return raw as T;
}

export function validateCreateParkingRequest(
  input: unknown,
): ValidationResult<CreateParkingRequestInput> {
  if (!isRecord(input)) {
    return { ok: false, issues: [{ field: 'body', message: 'Request body must be a JSON object.' }] };
  }

  const issues: FieldIssue[] = [];

  const driverName = readRequiredString(input, 'driverName', issues);
  const licensePlate = readRequiredString(input, 'licensePlate', issues, 32);
  const truckType = readEnum<TruckType>(input, 'truckType', TRUCK_TYPES, issues);
  const requestedFrom = readIsoDate(input, 'requestedFrom', issues);
  const requestedUntil = readIsoDate(input, 'requestedUntil', issues);
  const parkingSpotId = readOptionalString(input, 'parkingSpotId', issues, 32);
  const note = readOptionalString(input, 'note', issues, MAX_NOTE_LENGTH);

  // A request may be created pre-approved; anything further has to be reached
  // through the state machine.
  let status: CreateParkingRequestInput['status'];
  if (input['status'] !== undefined && input['status'] !== null && input['status'] !== '') {
    const creatable = ['pending', 'approved'] as const;
    if (typeof input['status'] !== 'string' || !(creatable as readonly string[]).includes(input['status'])) {
      issues.push({
        field: 'status',
        message: `status must be one of: ${creatable.join(', ')} when creating a request.`,
      });
    } else {
      status = input['status'] as CreateParkingRequestInput['status'];
    }
  }

  // Cross-field rules only make sense once both operands parsed cleanly.
  if (requestedFrom && requestedUntil && Date.parse(requestedUntil) <= Date.parse(requestedFrom)) {
    issues.push({
      field: 'requestedUntil',
      message: 'requestedUntil must be later than requestedFrom.',
    });
  }

  if (status && requiresParkingSpot(status) && !parkingSpotId) {
    issues.push({
      field: 'parkingSpotId',
      message: 'parkingSpotId is required when a request is created as approved.',
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      driverName: driverName!,
      licensePlate: licensePlate!,
      truckType: truckType!,
      requestedFrom: requestedFrom!,
      requestedUntil: requestedUntil!,
      ...(parkingSpotId !== undefined ? { parkingSpotId } : {}),
      ...(note !== undefined ? { note } : {}),
      ...(status !== undefined ? { status } : {}),
    },
  };
}

/**
 * Validates the *shape* of a status update. Whether the transition itself is
 * legal depends on the stored request and is checked by the service layer
 * (it is a conflict, not a malformed payload, and gets its own error code).
 */
export function validateUpdateStatusInput(
  input: unknown,
): ValidationResult<UpdateParkingRequestStatusInput> {
  if (!isRecord(input)) {
    return { ok: false, issues: [{ field: 'body', message: 'Request body must be a JSON object.' }] };
  }

  const issues: FieldIssue[] = [];
  const status = readEnum<ParkingRequestStatus>(
    input,
    'status',
    PARKING_REQUEST_STATUSES,
    issues,
  );
  const parkingSpotId = readOptionalString(input, 'parkingSpotId', issues, 32);
  const note = readOptionalString(input, 'note', issues, MAX_NOTE_LENGTH);

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      status: status!,
      ...(parkingSpotId !== undefined ? { parkingSpotId } : {}),
      ...(note !== undefined ? { note } : {}),
    },
  };
}

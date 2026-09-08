import type { ApiErrorCode, FieldIssue, ParkingRequestStatus } from '@cargovibe/shared';

/**
 * Domain errors carry their own HTTP status and API error code, so the HTTP
 * layer can map any of them with a single generic handler and the service
 * layer stays free of HTTP concepts beyond these two annotations.
 */
export abstract class DomainError extends Error {
  abstract readonly code: ApiErrorCode;
  abstract readonly httpStatus: number;
  readonly details?: FieldIssue[];

  constructor(message: string, details?: FieldIssue[]) {
    super(message);
    this.name = new.target.name;
    if (details) this.details = details;
    // Required so `instanceof` works when targeting ES5-ish output.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 - the payload is structurally wrong or violates a field rule. */
export class ValidationError extends DomainError {
  readonly code = 'validation_failed' as const;
  readonly httpStatus = 400;

  constructor(issues: FieldIssue[], message = 'The request payload is invalid.') {
    super(message, issues);
  }
}

/** 400 - the body was not parseable JSON at all. */
export class MalformedJsonError extends DomainError {
  readonly code = 'malformed_json' as const;
  readonly httpStatus = 400;

  constructor(message = 'Request body could not be parsed as JSON.') {
    super(message);
  }
}

/** 404 - no parking request with that id. */
export class NotFoundError extends DomainError {
  readonly code = 'not_found' as const;
  readonly httpStatus = 404;

  constructor(id: string) {
    super(`No parking request found with id '${id}'.`);
  }
}

/**
 * 409 - the payload is well-formed but conflicts with the current state of the
 * resource. Distinguished from 400 on purpose: the client sent a legitimate
 * request that simply is not applicable to this request's current status, and
 * the fix is to re-read the resource rather than to correct the payload.
 */
export class InvalidTransitionError extends DomainError {
  readonly code = 'invalid_transition' as const;
  readonly httpStatus = 409;

  readonly from: ParkingRequestStatus;
  readonly to: ParkingRequestStatus;
  readonly allowed: readonly ParkingRequestStatus[];

  constructor(
    from: ParkingRequestStatus,
    to: ParkingRequestStatus,
    allowed: readonly ParkingRequestStatus[],
  ) {
    const suffix =
      allowed.length === 0
        ? `'${from}' is a final status and cannot be changed.`
        : `Allowed transitions from '${from}': ${allowed.join(', ')}.`;
    super(`Cannot change status from '${from}' to '${to}'. ${suffix}`);
    this.from = from;
    this.to = to;
    this.allowed = allowed;
  }
}

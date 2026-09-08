/**
 * Core domain types.
 *
 * These live in a shared package so that the API and the mobile app can never
 * drift apart on the shape of a parking request, the set of valid statuses or
 * the rules of the status state machine.
 */

export const TRUCK_TYPES = ['solo', 'semi', 'tanker'] as const;
export type TruckType = (typeof TRUCK_TYPES)[number];

export const PARKING_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'checked_in',
  'checked_out',
] as const;
export type ParkingRequestStatus = (typeof PARKING_REQUEST_STATUSES)[number];

export interface ParkingRequest {
  /** `parking_<uuid>` */
  id: string;
  driverName: string;
  licensePlate: string;
  truckType: TruckType;
  /** ISO 8601 requested check-in time */
  requestedFrom: string;
  /** ISO 8601 requested check-out time */
  requestedUntil: string;
  status: ParkingRequestStatus;
  /** Assigned spot. Required as soon as a request is approved. */
  parkingSpotId?: string;
  note?: string;
  /**
   * Not part of the specified model, but cheap to maintain and genuinely
   * useful for sorting the list and for auditing status changes.
   */
  createdAt: string;
  updatedAt: string;
}

/** Payload accepted by `POST /api/parking-requests`. */
export interface CreateParkingRequestInput {
  driverName: string;
  licensePlate: string;
  truckType: TruckType;
  requestedFrom: string;
  requestedUntil: string;
  parkingSpotId?: string;
  note?: string;
  /**
   * Optional. A request may only be created as `pending` or `approved`
   * (an operator pre-approving a known haulier). Defaults to `pending`.
   */
  status?: Extract<ParkingRequestStatus, 'pending' | 'approved'>;
}

/** Payload accepted by `PATCH /api/parking-requests/{id}/status`. */
export interface UpdateParkingRequestStatusInput {
  status: ParkingRequestStatus;
  /** Required when transitioning to `approved`, unless one is already assigned. */
  parkingSpotId?: string;
  note?: string;
}

/** Envelope for list responses, so pagination can be added without a breaking change. */
export interface ListResponse<T> {
  items: T[];
  count: number;
}

/** Every non-2xx response from the API has exactly this shape. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Present for `validation_failed`; one entry per offending field. */
    details?: FieldIssue[];
  };
}

export type ApiErrorCode =
  | 'validation_failed'
  | 'invalid_transition'
  | 'not_found'
  | 'malformed_json'
  | 'internal_error';

export interface FieldIssue {
  field: string;
  message: string;
}

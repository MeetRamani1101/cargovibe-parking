import type { ParkingRequestStatus } from './types';

/**
 * The status state machine, expressed once and consumed by both sides:
 *  - the API enforces it before mutating anything;
 *  - the mobile app renders it to decide which action buttons to show.
 *
 * The mobile app trusting this map is a UX affordance only - the API never
 * trusts the client and re-validates every transition.
 */
export const STATUS_TRANSITIONS: Readonly<
  Record<ParkingRequestStatus, readonly ParkingRequestStatus[]>
> = Object.freeze({
  pending: ['approved', 'rejected'],
  approved: ['checked_in'],
  checked_in: ['checked_out'],
  rejected: [],
  checked_out: [],
});

/** Statuses from which no further transition is possible. */
export const FINAL_STATUSES = ['rejected', 'checked_out'] as const;
export type FinalStatus = (typeof FINAL_STATUSES)[number];

/** Statuses that require a `parkingSpotId` to be assigned. */
export const STATUSES_REQUIRING_PARKING_SPOT: readonly ParkingRequestStatus[] = ['approved'];

export function isFinalStatus(status: ParkingRequestStatus): status is FinalStatus {
  return (FINAL_STATUSES as readonly ParkingRequestStatus[]).includes(status);
}

export function allowedTransitionsFrom(
  status: ParkingRequestStatus,
): readonly ParkingRequestStatus[] {
  return STATUS_TRANSITIONS[status] ?? [];
}

export function canTransition(
  from: ParkingRequestStatus,
  to: ParkingRequestStatus,
): boolean {
  return allowedTransitionsFrom(from).includes(to);
}

export function requiresParkingSpot(status: ParkingRequestStatus): boolean {
  return STATUSES_REQUIRING_PARKING_SPOT.includes(status);
}

/** Human-readable labels, shared so the API and UI phrase statuses identically. */
export const STATUS_LABELS: Readonly<Record<ParkingRequestStatus, string>> = Object.freeze({
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
});

/** Label for the button/action that performs a transition into `status`. */
export const TRANSITION_LABELS: Readonly<Record<ParkingRequestStatus, string>> = Object.freeze({
  pending: 'Reopen',
  approved: 'Approve',
  rejected: 'Reject',
  checked_in: 'Check in',
  checked_out: 'Check out',
});

import type { ParkingRequest, ParkingRequestStatus, TruckType } from './types';

/**
 * Contract for the parking assistant.
 *
 * Two properties matter more than the natural-language quality:
 *
 * 1. The response is *structured*. The engine never returns free-form data the
 *    UI has to parse; it returns ids that the client resolves against data it
 *    already holds, plus a prose `answer` used purely as display text.
 * 2. Any mutation is only ever a *suggestion*. The assistant endpoint is
 *    read-only. A `suggestedAction` is a proposal the operator must confirm,
 *    after which the client calls the ordinary status endpoint, which applies
 *    the full validation and state-machine checks again.
 */

export interface AssistantQueryInput {
  question: string;
}

export interface AssistantFilters {
  statuses?: ParkingRequestStatus[];
  truckTypes?: TruckType[];
  /** Inclusive ISO range that a request must overlap to match. */
  overlapping?: { from: string; until: string; label: string };
  /** Matches driver name or license plate, case-insensitive substring. */
  text?: string;
  /** Only requests whose duration is flagged as unusually long. */
  unusuallyLong?: boolean;
}

export interface AssistantSuggestedAction {
  type: 'status_update';
  requestId: string;
  targetStatus: ParkingRequestStatus;
  parkingSpotId?: string;
  /** Shown to the operator in the confirmation dialog. */
  reason: string;
}

export interface AssistantResponse {
  /** Prose answer for display. Never parsed by the client. */
  answer: string;
  /** The intent the engine believed it recognised. */
  intent: AssistantIntent;
  /** Filters that were applied, echoed back so the UI can explain the result. */
  filters: AssistantFilters;
  /** Ids of the matching requests, in the order they should be displayed. */
  matchedRequestIds: string[];
  /** Matched requests, embedded so the UI needs no second round-trip. */
  matches: ParkingRequest[];
  /** Never applied by the backend. Requires explicit operator confirmation. */
  suggestedAction?: AssistantSuggestedAction;
  /** 0-1. Low confidence makes the UI present the answer more tentatively. */
  confidence: number;
  /** Which engine produced this answer, for transparency in the UI. */
  engine: 'deterministic' | 'llm';
}

export type AssistantIntent =
  | 'list_requests'
  | 'count_requests'
  | 'find_unusually_long'
  | 'suggest_status_update'
  | 'help'
  | 'unknown';

/**
 * A request is "unusually long" when it runs longer than this. Kept as an
 * explicit constant rather than a purely statistical outlier test so the
 * answer is explainable to the operator.
 */
export const UNUSUALLY_LONG_HOURS = 24;

export function durationHours(request: ParkingRequest): number {
  const from = Date.parse(request.requestedFrom);
  const until = Date.parse(request.requestedUntil);
  if (Number.isNaN(from) || Number.isNaN(until)) return 0;
  return (until - from) / 3_600_000;
}

import {
  STATUS_LABELS,
  UNUSUALLY_LONG_HOURS,
  durationHours,
  type AssistantFilters,
  type AssistantResponse,
  type AssistantSuggestedAction,
  type ParkingRequest,
} from '@cargovibe/shared';

import type { AssistantEngine, AssistantEngineInput } from './assistantEngine';
import { parseQuestion } from './queryParser';

const MAX_LISTED_IN_ANSWER = 5;

/**
 * A deterministic natural-language engine.
 *
 * Chosen over calling a hosted LLM because it needs no API key to review, is
 * instant, costs nothing, and - most importantly - is fully unit-testable:
 * every answer is a pure function of (question, data, now). The parsing is
 * naive by design; the point of the exercise is the *shape* of a safe AI
 * integration, and that shape is the `AssistantEngine` interface plus the
 * read-only, suggestion-only contract, not the cleverness of the parser.
 */
export class DeterministicAssistantEngine implements AssistantEngine {
  readonly name = 'deterministic' as const;

  async answer(input: AssistantEngineInput): Promise<AssistantResponse> {
    const { question, requests, now } = input;
    const parsed = parseQuestion(question, now);

    if (parsed.intent === 'help') {
      return this.buildResponse(parsed.intent, {}, [], helpText(), 1);
    }

    if (parsed.intent === 'unknown') {
      return this.buildResponse(
        'unknown',
        {},
        [],
        `I could not work out what to look for in "${question.trim()}". ${helpText()}`,
        0,
      );
    }

    const matches = applyFilters(requests, parsed.filters, now);

    if (parsed.intent === 'suggest_status_update') {
      const suggestion = suggestNextAction(matches.length > 0 ? matches : requests, now);
      if (!suggestion) {
        return this.buildResponse(
          parsed.intent,
          parsed.filters,
          [],
          'Nothing needs a status change right now: no arrivals are due and no parking windows have expired.',
          parsed.confidence,
        );
      }
      const target = requests.find((request) => request.id === suggestion.requestId);
      return this.buildResponse(
        parsed.intent,
        parsed.filters,
        target ? [target] : [],
        `Suggestion: ${suggestion.reason} This is only a proposal - nothing has been changed.`,
        parsed.confidence,
        suggestion,
      );
    }

    const answer =
      parsed.intent === 'count_requests'
        ? countAnswer(matches, parsed.filters, parsed.recognised)
        : listAnswer(matches, parsed.filters, parsed.recognised, parsed.intent === 'find_unusually_long');

    return this.buildResponse(parsed.intent, parsed.filters, matches, answer, parsed.confidence);
  }

  private buildResponse(
    intent: AssistantResponse['intent'],
    filters: AssistantFilters,
    matches: ParkingRequest[],
    answer: string,
    confidence: number,
    suggestedAction?: AssistantSuggestedAction,
  ): AssistantResponse {
    return {
      answer,
      intent,
      filters,
      matchedRequestIds: matches.map((request) => request.id),
      matches,
      confidence,
      engine: this.name,
      ...(suggestedAction ? { suggestedAction } : {}),
    };
  }
}

/**
 * Filter execution. Separated from parsing on purpose: an LLM engine would
 * produce an `AssistantFilters` object and then reuse exactly this function, so
 * the model never gets to decide *which records* come back, only how the
 * question maps onto a validated filter.
 */
export function applyFilters(
  requests: readonly ParkingRequest[],
  filters: AssistantFilters,
  _now: Date,
): ParkingRequest[] {
  let results = [...requests];

  if (filters.statuses?.length) {
    const wanted = new Set(filters.statuses);
    results = results.filter((request) => wanted.has(request.status));
  }

  if (filters.truckTypes?.length) {
    const wanted = new Set(filters.truckTypes);
    results = results.filter((request) => wanted.has(request.truckType));
  }

  if (filters.overlapping) {
    const from = Date.parse(filters.overlapping.from);
    const until = Date.parse(filters.overlapping.until);
    // Overlap, not containment: a truck arriving at 22:00 and leaving at 07:00
    // is "here tonight" even though it is not fully inside the window.
    // The comparison is strict so that merely *touching* an endpoint does not
    // count - a truck arriving at 06:00 is not part of the night that ends at
    // 06:00. ("Right now" is modelled as a 1ms window, which still works here.)
    results = results.filter(
      (request) =>
        Date.parse(request.requestedFrom) < until && Date.parse(request.requestedUntil) > from,
    );
  }

  if (filters.text) {
    const needle = normalise(filters.text);
    results = results.filter(
      (request) =>
        normalise(request.driverName).includes(needle) ||
        normalise(request.licensePlate).includes(needle),
    );
  }

  if (filters.unusuallyLong) {
    results = results.filter((request) => durationHours(request) > UNUSUALLY_LONG_HOURS);
    results.sort((a, b) => durationHours(b) - durationHours(a));
  }

  return results;
}

/** Case- and separator-insensitive, so `hhcv1234` finds `HH-CV 1234`. */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[\s-]/g, '');
}

/**
 * Proposes the single most useful status change, in priority order:
 * an overdue departure, then an arrival that is due, then the oldest pending
 * request. Returns `undefined` when nothing is actionable.
 */
export function suggestNextAction(
  requests: readonly ParkingRequest[],
  now: Date,
): AssistantSuggestedAction | undefined {
  const nowMs = now.getTime();

  const overdue = requests
    .filter((request) => request.status === 'checked_in' && Date.parse(request.requestedUntil) < nowMs)
    .sort((a, b) => Date.parse(a.requestedUntil) - Date.parse(b.requestedUntil))[0];
  if (overdue) {
    const hoursLate = Math.round((nowMs - Date.parse(overdue.requestedUntil)) / 3_600_000);
    return {
      type: 'status_update',
      requestId: overdue.id,
      targetStatus: 'checked_out',
      reason: `${overdue.driverName} (${overdue.licensePlate}) was due to leave ${hoursLate}h ago and is still checked in, so the spot can be released by checking the truck out.`,
    };
  }

  const arriving = requests
    .filter((request) => request.status === 'approved' && Date.parse(request.requestedFrom) <= nowMs)
    .sort((a, b) => Date.parse(a.requestedFrom) - Date.parse(b.requestedFrom))[0];
  if (arriving) {
    return {
      type: 'status_update',
      requestId: arriving.id,
      targetStatus: 'checked_in',
      reason: `${arriving.driverName} (${arriving.licensePlate}) is approved for spot ${arriving.parkingSpotId ?? 'n/a'} and the arrival window has already started, so the truck can be checked in.`,
    };
  }

  const oldestPending = requests
    .filter((request) => request.status === 'pending')
    .sort((a, b) => Date.parse(a.requestedFrom) - Date.parse(b.requestedFrom))[0];
  if (oldestPending) {
    return {
      type: 'status_update',
      requestId: oldestPending.id,
      targetStatus: 'approved',
      // Deliberately no `parkingSpotId`: inventing a spot number would be a
      // fabrication. The operator supplies it in the confirmation step.
      reason: `${oldestPending.driverName} (${oldestPending.licensePlate}) has the earliest unanswered arrival (${formatDateTime(oldestPending.requestedFrom)}) and is still pending. Approving it requires you to assign a parking spot.`,
    };
  }

  return undefined;
}

function countAnswer(
  matches: ParkingRequest[],
  filters: AssistantFilters,
  recognised: string[],
): string {
  return `${matches.length} ${pluralise(matches.length)} ${describeFilters(filters, recognised)}.`;
}

function listAnswer(
  matches: ParkingRequest[],
  filters: AssistantFilters,
  recognised: string[],
  emphasiseDuration: boolean,
): string {
  const description = describeFilters(filters, recognised);

  if (matches.length === 0) {
    return `No requests match ${description}.`;
  }

  const shown = matches.slice(0, MAX_LISTED_IN_ANSWER);
  const lines = shown.map((request) => `• ${summarise(request, emphasiseDuration)}`);
  const more =
    matches.length > shown.length ? `\n… and ${matches.length - shown.length} more.` : '';

  return `${matches.length} ${pluralise(matches.length)} ${description}:\n${lines.join('\n')}${more}`;
}

/** "1 request matches" / "3 requests match". */
function pluralise(count: number): string {
  return count === 1 ? 'request matches' : 'requests match';
}

function summarise(request: ParkingRequest, emphasiseDuration: boolean): string {
  const base = `${request.driverName} — ${request.licensePlate} (${request.truckType}), ${formatDateTime(
    request.requestedFrom,
  )} → ${formatDateTime(request.requestedUntil)}, ${STATUS_LABELS[request.status]}`;
  if (!emphasiseDuration) return base;
  return `${base}, ${Math.round(durationHours(request))}h`;
}

function describeFilters(filters: AssistantFilters, recognised: string[]): string {
  if (recognised.length === 0) return 'your question (no filters applied, showing everything)';
  const parts: string[] = [];
  if (filters.statuses?.length) {
    parts.push(filters.statuses.map((status) => STATUS_LABELS[status].toLowerCase()).join(' or '));
  }
  if (filters.truckTypes?.length) parts.push(filters.truckTypes.join(' or '));
  if (filters.unusuallyLong) parts.push(`longer than ${UNUSUALLY_LONG_HOURS}h`);
  if (filters.overlapping) parts.push(filters.overlapping.label);
  if (filters.text) parts.push(`"${filters.text}"`);
  return parts.join(', ');
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // Fixed locale + UTC so the string is stable across machines and in tests.
  return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function helpText(): string {
  return [
    'Try questions like:',
    '• "Which requests are still pending?"',
    '• "Show me all approved tankers."',
    '• "Which requests are scheduled for tonight?"',
    '• "Are there any unusually long parking requests?"',
    '• "What should I do next?"',
  ].join('\n');
}

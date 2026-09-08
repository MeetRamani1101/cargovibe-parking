import type {
  AssistantFilters,
  AssistantIntent,
  ParkingRequestStatus,
  TruckType,
} from '@cargovibe/shared';

/**
 * Rule-based intent + filter extraction.
 *
 * This is the "understanding" half of the assistant, kept in its own module so
 * it can be unit-tested exhaustively without any data, and so that an LLM-based
 * engine could replace exactly this step while the execution half below stays
 * unchanged and trusted.
 */

export interface ParsedQuery {
  intent: AssistantIntent;
  filters: AssistantFilters;
  /** 0-1, derived from how many recognisable signals the question contained. */
  confidence: number;
  /** The phrases that were recognised - surfaced in the answer for transparency. */
  recognised: string[];
}

type StatusSynonyms = ReadonlyArray<readonly [RegExp, ParkingRequestStatus]>;

const STATUS_PATTERNS: StatusSynonyms = [
  [/\bpending\b|\bwaiting\b|\bopen\b|\bunanswered\b|\bnot yet (?:approved|decided)\b/, 'pending'],
  [/\bapproved\b|\baccepted\b|\bconfirmed\b|\bgranted\b/, 'approved'],
  [/\brejected\b|\bdeclined\b|\brefused\b|\bdenied\b/, 'rejected'],
  [/\bchecked[ _-]?in\b|\bon[ -]site\b|\bon the yard\b|\bcurrently parked\b|\barrived\b/, 'checked_in'],
  [/\bchecked[ _-]?out\b|\bdeparted\b|\bleft\b|\bgone\b/, 'checked_out'],
];

const TRUCK_TYPE_PATTERNS: ReadonlyArray<readonly [RegExp, TruckType]> = [
  [/\bsolos?\b|\brigids?\b/, 'solo'],
  [/\bsemis?\b|\bartics?\b|\btrailers?\b/, 'semi'],
  [/\btankers?\b|\btank trucks?\b/, 'tanker'],
];

const COUNT_PATTERN = /\bhow many\b|\bcount\b|\bnumber of\b|\bhow much\b/;
const LONG_PATTERN =
  /\bunusually long\b|\btoo long\b|\bvery long\b|\blong(?:est)?\b|\bmulti[- ]day\b|\bextended\b|\boverstay\b/;
const SUGGEST_PATTERN =
  /\bsuggest\b|\brecommend\b|\bwhat should\b|\bshould i\b|\bnext action\b|\bwhat needs\b|\bneeds? attention\b|\bwhat to do\b/;
const HELP_PATTERN = /^\s*(help|what can you do|how do (?:i|you) use|\?)\s*$|\bwhat can you do\b/;

/** Plate-shaped tokens such as `HH-CV 1234` or `PL-KR 88214`. */
const HYPHENATED_PLATE_PATTERN = /\b[a-z]{1,3}-[a-z0-9]{1,4}(?:[ -][a-z0-9]{1,6})?\b/i;
/**
 * A plate typed without separators, e.g. `hhcv1234`. Requires at least one
 * letter and one digit and a length of 6+, which no ordinary English word has,
 * so this cannot swallow normal question words.
 */
const COMPACT_PLATE_PATTERN = /\b(?=[a-z0-9]*[a-z])(?=[a-z0-9]*\d)[a-z0-9]{6,12}\b/i;
const QUOTED_PATTERN = /["'“”]([^"'“”]{2,60})["'“”]/;

export function parseQuestion(question: string, now: Date): ParsedQuery {
  const text = question.toLowerCase().trim();
  const recognised: string[] = [];
  const filters: AssistantFilters = {};

  const statuses = STATUS_PATTERNS.filter(([pattern]) => pattern.test(text)).map(([, status]) => status);
  if (statuses.length > 0) {
    filters.statuses = [...new Set(statuses)];
    recognised.push(`status: ${filters.statuses.join(', ')}`);
  }

  const truckTypes = TRUCK_TYPE_PATTERNS.filter(([pattern]) => pattern.test(text)).map(([, type]) => type);
  if (truckTypes.length > 0) {
    filters.truckTypes = [...new Set(truckTypes)];
    recognised.push(`truck type: ${filters.truckTypes.join(', ')}`);
  }

  const window = parseTimeWindow(text, now);
  if (window) {
    filters.overlapping = window;
    recognised.push(`time: ${window.label}`);
  }

  const freeText = extractFreeText(question);
  if (freeText) {
    filters.text = freeText;
    recognised.push(`search: "${freeText}"`);
  }

  // "long" is only a duration filter when it is not just part of "how long".
  if (LONG_PATTERN.test(text) && !/\bhow long\b/.test(text)) {
    filters.unusuallyLong = true;
    recognised.push('duration: unusually long');
  }

  const intent = pickIntent(text, filters);

  return {
    intent,
    filters,
    confidence: scoreConfidence(intent, recognised.length),
    recognised,
  };
}

function pickIntent(text: string, filters: AssistantFilters): AssistantIntent {
  if (HELP_PATTERN.test(text)) return 'help';
  if (SUGGEST_PATTERN.test(text)) return 'suggest_status_update';
  if (filters.unusuallyLong) return 'find_unusually_long';
  if (COUNT_PATTERN.test(text)) return 'count_requests';

  const hasAnyFilter = Object.keys(filters).length > 0;
  if (hasAnyFilter) return 'list_requests';

  // "show me everything" style questions still make sense with no filters.
  if (/\b(all|every|list|show|which|what|overview|requests?)\b/.test(text)) return 'list_requests';

  return 'unknown';
}

function scoreConfidence(intent: AssistantIntent, signalCount: number): number {
  if (intent === 'unknown') return 0;
  if (intent === 'help') return 1;
  if (signalCount === 0) return 0.4; // recognised the shape, but nothing to narrow by
  return Math.min(1, 0.6 + 0.2 * signalCount);
}

/**
 * Time windows are resolved against the caller-supplied `now`, never against
 * the wall clock inside this function, so tests can pin them.
 */
function parseTimeWindow(
  text: string,
  now: Date,
): { from: string; until: string; label: string } | undefined {
  const startOfDay = (offsetDays: number): Date => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offsetDays);
    return date;
  };
  const at = (offsetDays: number, hour: number): Date => {
    const date = startOfDay(offsetDays);
    date.setHours(hour, 0, 0, 0);
    return date;
  };
  const window = (from: Date, until: Date, label: string) => ({
    from: from.toISOString(),
    until: until.toISOString(),
    label,
  });

  if (/\btonight\b|\bthis evening\b|\bovernight\b/.test(text)) {
    return window(at(0, 18), at(1, 6), 'tonight (18:00-06:00)');
  }
  if (/\btomorrow night\b/.test(text)) {
    return window(at(1, 18), at(2, 6), 'tomorrow night (18:00-06:00)');
  }
  if (/\btomorrow\b/.test(text)) {
    return window(startOfDay(1), startOfDay(2), 'tomorrow');
  }
  if (/\byesterday\b/.test(text)) {
    return window(startOfDay(-1), startOfDay(0), 'yesterday');
  }
  if (/\bthis weekend\b|\bweekend\b/.test(text)) {
    // Day 6 = Saturday. `daysUntilSaturday` is 0 when today already is Saturday.
    const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
    return window(startOfDay(daysUntilSaturday), startOfDay(daysUntilSaturday + 2), 'this weekend');
  }
  if (/\bthis week\b|\bnext 7 days\b|\bcoming week\b/.test(text)) {
    return window(startOfDay(0), startOfDay(7), 'the next 7 days');
  }
  if (/\btoday\b/.test(text)) {
    return window(startOfDay(0), startOfDay(1), 'today');
  }
  if (/\bright now\b|\bcurrently\b|\bat the moment\b/.test(text)) {
    return window(now, new Date(now.getTime() + 1), 'right now');
  }
  return undefined;
}

function extractFreeText(question: string): string | undefined {
  const quoted = QUOTED_PATTERN.exec(question);
  if (quoted?.[1]) return quoted[1].trim();

  const forDriver = /\b(?:driver|for|by)\s+([A-ZÄÖÜÁÉÍÓÚČŠŽŇŘ][\w'’-]+(?:\s+[A-ZÄÖÜÁÉÍÓÚČŠŽŇŘ][\w'’-]+)?)/.exec(
    question,
  );
  if (forDriver?.[1]) return forDriver[1].trim();

  const hyphenated = HYPHENATED_PLATE_PATTERN.exec(question);
  // Guard against matching ordinary hyphenated words like "check-in".
  if (hyphenated?.[0] && /\d/.test(hyphenated[0])) return hyphenated[0].trim();

  const compact = COMPACT_PLATE_PATTERN.exec(question);
  if (compact?.[0]) return compact[0].trim();

  return undefined;
}

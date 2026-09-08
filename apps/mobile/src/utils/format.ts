/**
 * Date formatting helpers.
 *
 * The API speaks UTC ISO 8601; an operator thinks in local yard time, so every
 * timestamp is rendered in the device's locale and zone. Formatting lives here
 * rather than in components so the whole app phrases dates the same way.
 */

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateTimeFormat.format(date);
}

/** "06 Sep 19:30 → 05:30" when both ends fall on the same calendar day. */
export function formatRange(fromIso: string, untilIso: string): string {
  const from = new Date(fromIso);
  const until = new Date(untilIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) {
    return `${fromIso} → ${untilIso}`;
  }
  const sameDay = from.toDateString() === until.toDateString();
  return `${dateTimeFormat.format(from)} → ${sameDay ? timeFormat.format(until) : dateTimeFormat.format(until)}`;
}

export function formatDuration(fromIso: string, untilIso: string): string {
  const minutes = (Date.parse(untilIso) - Date.parse(fromIso)) / 60_000;
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';

  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h ${Math.round(minutes % 60)}m`.replace(' 0m', '');
  return `${Math.round(minutes)}m`;
}

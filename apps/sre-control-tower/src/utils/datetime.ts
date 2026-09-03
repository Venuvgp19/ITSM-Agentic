// All Control Tower timestamps render fixed to US Central Time regardless of
// the viewer's browser/OS locale, so operators in different timezones see
// consistent times for the same incident.
const CST_TIMEZONE = 'America/Chicago';

type DateInput = Date | string | number;

export function formatTime(date: DateInput): string {
  return new Date(date).toLocaleTimeString('en-US', { timeZone: CST_TIMEZONE });
}

export function formatShortTime(date: DateInput): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: CST_TIMEZONE,
  });
}

export function formatDateTime(date: DateInput): string {
  return new Date(date).toLocaleString('en-US', { timeZone: CST_TIMEZONE });
}

export function formatDate(date: DateInput, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(date).toLocaleDateString('en-US', { ...opts, timeZone: CST_TIMEZONE });
}

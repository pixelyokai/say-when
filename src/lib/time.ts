export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type Zoned = {
  /** Calendar date in that zone, YYYY-MM-DD. */
  dateKey: string;
  /** Minutes since local midnight. */
  minutes: number;
  /** 0 = Sunday. */
  weekday: number;
};

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const zonedCache = new Map<string, Zoned>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Wall-clock reading of an instant in a time zone. */
export function zoned(ms: number, timeZone: string): Zoned {
  const key = `${timeZone}|${ms}`;
  const cached = zonedCache.get(key);
  if (cached) return cached;
  const parts: Record<string, string> = {};
  for (const part of partsFormatter(timeZone).formatToParts(ms)) {
    parts[part.type] = part.value;
  }
  const hour = Number(parts.hour) % 24;
  const result: Zoned = {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
  if (zonedCache.size > 50_000) zonedCache.clear();
  zonedCache.set(key, result);
  return result;
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

/** "3:30 pm" in the given zone. */
export function formatTime(ms: number, timeZone: string): string {
  let formatter = timeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    });
    timeFormatters.set(timeZone, formatter);
  }
  return formatter.format(ms).replace(" AM", " am").replace(" PM", " pm");
}

/** "9 am", "12:30 pm" from minutes since midnight. */
export function formatMinutes(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return min === 0
    ? `${h12} ${suffix}`
    : `${h12}:${String(min).padStart(2, "0")} ${suffix}`;
}

/** Short hour label for ticks: "9a", "12p". */
export function formatHourShort(minutes: number): string {
  const h = Math.floor((((minutes % 1440) + 1440) % 1440) / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? "a" : "p"}`;
}

export function formatDay(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatWeekday(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(
    ms,
  );
}

/** Offset of a zone from UTC in minutes at an instant. */
export function offsetMinutes(ms: number, timeZone: string): number {
  const z = zoned(ms, timeZone);
  const [y, mo, d] = z.dateKey.split("-").map(Number);
  const asUtc = Date.UTC(y, mo - 1, d) + z.minutes * MINUTE;
  return Math.round((asUtc - Math.floor(ms / MINUTE) * MINUTE) / MINUTE);
}

/** The instant when the wall clock in `timeZone` reads `minutes` on `dateKey`. */
export function fromZoned(dateKey: string, minutes: number, timeZone: string): number {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const wall = Date.UTC(y, mo - 1, d) + minutes * MINUTE;
  let guess = wall - offsetMinutes(wall, timeZone) * MINUTE;
  // A second pass settles instants next to a DST change.
  guess = wall - offsetMinutes(guess, timeZone) * MINUTE;
  return guess;
}

/** "+3:30h" style difference between two zones. */
export function formatOffsetDiff(ms: number, from: string, to: string): string {
  const diff = offsetMinutes(ms, to) - offsetMinutes(ms, from);
  if (diff === 0) return "±0h";
  const sign = diff > 0 ? "+" : "−";
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}h`;
}

export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Local midnight (viewer's zone) of a date. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

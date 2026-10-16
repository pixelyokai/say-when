import data from "@/data/people.json";
import {
  addDays,
  dayKey,
  formatMinutes,
  formatTime,
  formatWeekday,
  MINUTE,
  startOfDay,
  type Zoned,
  zoned,
} from "@/lib/time";

export type Person = {
  id: string;
  name: string;
  role: string;
  city: string;
  timeZone: string;
  /** Working hours, minutes since local midnight. */
  workStart: number;
  workEnd: number;
  isViewer?: boolean;
};

export type Team = { id: string; name: string; members: string[] };

export const PEOPLE: Person[] = data.people;
export const TEAMS: Team[] = data.teams;

export function firstName(person: Person): string {
  return person.name.split(" ")[0];
}

export function initials(person: Person): string {
  return person.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Browsers only report a time zone, whose name is one city in it. Some zones
 * cover a whole country, so name them the way people do.
 */
const ZONE_CITY: Record<string, string> = {
  "Asia/Kolkata": "New Delhi",
  "Asia/Calcutta": "New Delhi",
  "Asia/Saigon": "Ho Chi Minh",
  "Europe/Kiev": "Kyiv",
};

export function makeViewer(timeZone: string, cityOverride?: string | null): Person {
  const last = timeZone.split("/").pop()?.replaceAll("_", " ") ?? timeZone;
  const city = cityOverride?.trim() || ZONE_CITY[timeZone] || last;
  return {
    id: "you",
    name: "You",
    role: "Organizer",
    city,
    timeZone,
    workStart: 540,
    workEnd: 1080,
    isViewer: true,
  };
}

/* ------------------------------------------------------------------ */
/* Fake calendars: deterministic per person and local date.           */
/* ------------------------------------------------------------------ */

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Interval = [number, number];
const busyCache = new Map<string, Interval[]>();

export function busyIntervals(person: Person, localDateKey: string): Interval[] {
  if (person.isViewer) return [];
  const key = `${person.id}|${localDateKey}`;
  const cached = busyCache.get(key);
  if (cached) return cached;
  const rand = random(hash(key));
  const count = 2 + Math.floor(rand() * 3);
  const intervals: Interval[] = [];
  for (let tries = 0; intervals.length < count && tries < 24; tries++) {
    const duration = rand() < 0.6 ? 30 : 60;
    const steps = Math.floor((person.workEnd - person.workStart - duration) / 30);
    const start = person.workStart + 30 * Math.floor(rand() * (steps + 1));
    const end = start + duration;
    if (intervals.some(([s, e]) => start < e && end > s)) continue;
    intervals.push([start, end]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  busyCache.set(key, intervals);
  return intervals;
}

export type SlotState = "busy" | "free" | "off" | "asleep";

const SLEEP_END = 6 * 60;
const SLEEP_START = 23 * 60;

function isWeekend(z: Zoned): boolean {
  return z.weekday === 0 || z.weekday === 6;
}

export function stateAt(person: Person, ms: number): SlotState {
  const z = zoned(ms, person.timeZone);
  if (z.minutes < SLEEP_END || z.minutes >= SLEEP_START) return "asleep";
  if (isWeekend(z)) return "off";
  if (busyIntervals(person, z.dateKey).some(([s, e]) => z.minutes >= s && z.minutes < e))
    return "busy";
  if (z.minutes >= person.workStart && z.minutes < person.workEnd) return "free";
  return "off";
}

/* ------------------------------------------------------------------ */
/* Asks and slots                                                      */
/* ------------------------------------------------------------------ */

export type DaysSpec =
  | "today"
  | "tomorrow"
  | "this-week"
  | "next-week"
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

export type WindowSpec = "morning" | "afternoon" | "evening";

export const WINDOWS: Record<WindowSpec, [number, number]> = {
  morning: [8 * 60, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 20 * 60],
};

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function isWeekday(date: Date): boolean {
  const d = date.getDay();
  return d !== 0 && d !== 6;
}

function weekdaysFrom(start: Date, count: number): Date[] {
  const days: Date[] = [];
  for (let d = start; days.length < count; d = addDays(d, 1)) {
    if (isWeekday(d)) days.push(d);
  }
  return days;
}

/**
 * A parsed date ("YYYY-MM-DD", "--MM-DD", or "--00-DD" for "the 24th") as a
 * viewer-local day. Without a year it's the next time that date comes round.
 */
export function resolveDate(date: string, now: Date): Date | null {
  const today = startOfDay(now);
  const [y, m, d] = date.replace(/^--/, "0000-").split("-").map(Number);
  if (y > 0) return new Date(y, m - 1, d);
  if (m === 0) {
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), d);
    return thisMonth >= today ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, d);
  }
  const thisYear = new Date(today.getFullYear(), m - 1, d);
  return thisYear >= today ? thisYear : new Date(today.getFullYear() + 1, m - 1, d);
}

/** Days in the viewer's zone that an ask covers. */
export function resolveDays(spec: DaysSpec | null, now: Date, date: string | null = null): Date[] {
  const today = startOfDay(now);
  const exact = date ? resolveDate(date, now) : null;
  if (exact) return [exact];
  switch (spec) {
    case "today":
      return [today];
    case "tomorrow":
      return [addDays(today, 1)];
    case "this-week": {
      const days: Date[] = [];
      for (let d = today; d.getDay() !== 6 && d.getDay() !== 0; d = addDays(d, 1))
        days.push(d);
      return days.length ? days : weekdaysFrom(today, 5);
    }
    case "next-week": {
      const untilMonday = ((8 - today.getDay()) % 7) || 7;
      const monday = addDays(today, untilMonday);
      return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
    }
    case null:
      return weekdaysFrom(today, 5);
    default: {
      const target = WEEKDAY_INDEX[spec];
      const ahead = (target - today.getDay() + 7) % 7;
      return [addDays(today, ahead)];
    }
  }
}

export type Ask = {
  people: Person[];
  durationMin: number;
  window: WindowSpec | null;
  timezone: "theirs" | "mine";
  /** An exact or bounding clock time, read in `timeZone`. */
  time?: { kind: "at" | "after" | "before"; minutes: number; timeZone: string } | null;
};

export type PersonComfort = {
  person: Person;
  comfort: number;
  local: Zoned;
};

export type Slot = {
  start: number;
  end: number;
  /** Viewer-local day key. */
  day: string;
  score: number;
  comforts: PersonComfort[];
};

const STEP = 15;

export function comfortFor(person: Person, start: number, durationMin: number): number {
  const z = zoned(start, person.timeZone);
  if (isWeekend(z)) return 0.15;
  const s = z.minutes;
  const e = s + durationMin;
  if (s >= person.workStart && e <= person.workEnd) return 1;
  const outside = Math.max(person.workStart - s, e - person.workEnd, 0) / 60;
  return Math.max(0.05, 1 - 0.2 * outside);
}

function withinWindow(
  person: Person,
  start: number,
  durationMin: number,
  window: [number, number],
): boolean {
  const z = zoned(start, person.timeZone);
  return z.minutes >= window[0] && z.minutes + durationMin <= window[1];
}

export function isFeasible(ask: Ask, start: number, viewer: Person): boolean {
  const { people, durationMin, window, timezone, time } = ask;
  if (time) {
    const m = zoned(start, time.timeZone).minutes;
    if (time.kind === "at" && m !== time.minutes) return false;
    if (time.kind === "after" && m < time.minutes) return false;
    if (time.kind === "before" && m + durationMin > time.minutes) return false;
  }
  for (let t = start; t < start + durationMin * MINUTE; t += STEP * MINUTE) {
    for (const person of people) {
      const state = stateAt(person, t);
      if (state === "busy" || state === "asleep") return false;
    }
  }
  if (window) {
    const range = WINDOWS[window];
    const judged = timezone === "theirs" ? people.filter((p) => !p.isViewer) : [viewer];
    if (!judged.every((p) => withinWindow(p, start, durationMin, range))) return false;
  }
  return true;
}

function scoreSlot(ask: Ask, start: number): Slot {
  const comforts = ask.people.map((person) => ({
    person,
    comfort: comfortFor(person, start, ask.durationMin),
    local: zoned(start, person.timeZone),
  }));
  const values = comforts.map((c) => c.comfort);
  const min = Math.min(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    start,
    end: start + ask.durationMin * MINUTE,
    day: dayKey(new Date(start)),
    score: 0.6 * min + 0.4 * mean,
    comforts,
  };
}

export function findSlots(
  ask: Ask,
  days: Date[],
  viewer: Person,
  now: number,
): Slot[] {
  if (ask.people.length === 0) return [];
  const slots: Slot[] = [];
  for (const day of days) {
    const from = day.getTime();
    const to = addDays(day, 1).getTime() - ask.durationMin * MINUTE;
    for (let t = from; t <= to; t += STEP * MINUTE) {
      if (t < now) continue;
      if (isFeasible(ask, t, viewer)) slots.push(scoreSlot(ask, t));
    }
  }
  return slots.sort((a, b) => b.score - a.score || a.start - b.start);
}

/** Top slots, spread out so they are real alternatives. */
export function pickDistinct(slots: Slot[], count: number, gapMin = 120): Slot[] {
  const picked: Slot[] = [];
  for (const slot of slots) {
    if (picked.length >= count) break;
    if (picked.some((p) => Math.abs(p.start - slot.start) < gapMin * MINUTE)) continue;
    picked.push(slot);
  }
  return picked;
}

export function explainSlot(slot: Slot): string {
  const uncomfortable = slot.comforts
    .filter((c) => c.comfort < 1)
    .sort((a, b) => a.comfort - b.comfort);
  if (uncomfortable.length === 0) {
    const starts = slot.comforts.map((c) => c.local.minutes);
    const duration = (slot.end - slot.start) / MINUTE;
    const lo = Math.min(...starts);
    const hi = Math.max(...starts) + duration;
    return `Everyone between ${formatMinutes(Math.floor(lo / 60) * 60)} and ${formatMinutes(Math.ceil(hi / 60) * 60)}`;
  }
  const named = uncomfortable
    .slice(0, 2)
    .map(
      (c) =>
        `${c.person.isViewer ? "you" : firstName(c.person)} at ${formatMinutes(c.local.minutes)}`,
    );
  const sentence = named.join(", ");
  const rest =
    uncomfortable.length > 2
      ? `, ${uncomfortable.length - 2} more outside hours`
      : uncomfortable.length < slot.comforts.length
        ? ", everyone else in working hours"
        : "";
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + rest;
}

export function slotLabel(slot: Slot, timeZone: string): string {
  return `${formatWeekday(slot.start, timeZone)} ${formatTime(slot.start, timeZone)}`;
}

export type Suggestion = {
  message: string;
  action: { dropWindow?: true; dropPerson?: string; widenDays?: true; dropTime?: true };
  slot: Slot;
};

function describeTime(time: NonNullable<Ask["time"]>, viewer: Person, people: Person[]): string {
  const owner = people.find((p) => p.timeZone === time.timeZone && !p.isViewer);
  const clock = time.timeZone === viewer.timeZone || !owner ? "" : ` ${firstName(owner)}'s time`;
  const word = time.kind === "at" ? "" : `${time.kind} `;
  return `${word}${formatMinutes(time.minutes)}${clock}`;
}

/** The smallest change to the ask that produces a good slot. */
export function suggestFix(
  ask: Ask,
  days: Date[],
  viewer: Person,
  now: number,
): Suggestion | null {
  const candidates: Suggestion[] = [];
  if (ask.time) {
    const time = ask.time;
    const free = findSlots({ ...ask, time: null }, days, viewer, now);
    // Closest on the clock the visitor named, not merely the best scored.
    const distance = (s: Slot) => {
      const m = zoned(s.start, time.timeZone).minutes;
      return time.kind === "at"
        ? Math.abs(m - time.minutes)
        : time.kind === "after"
          ? Math.max(0, time.minutes - m)
          : Math.max(0, m + ask.durationMin - time.minutes);
    };
    const closest = [...free].sort((a, b) => distance(a) - distance(b) || b.score - a.score)[0];
    const asked = describeTime(time, viewer, ask.people);
    if (closest && distance(closest) > 0)
      candidates.push({
        message: `${asked.charAt(0).toUpperCase()}${asked.slice(1)} doesn't work for everyone. The closest that does is ${slotLabel(closest, viewer.timeZone)}.`,
        action: { dropTime: true },
        slot: { ...closest, score: closest.score + 0.2 },
      });
  }
  const weekdays = resolveDays(null, new Date(now));
  if (weekdays.some((d) => !days.some((x) => x.getTime() === d.getTime()))) {
    const best = findSlots(ask, weekdays, viewer, now)[0];
    if (best && best.score >= 0.5)
      candidates.push({
        message: `Look at the next five weekdays instead: ${slotLabel(best, viewer.timeZone)} works.`,
        action: { widenDays: true },
        slot: best,
      });
  }
  if (ask.window) {
    const best = findSlots({ ...ask, window: null }, days, viewer, now)[0];
    if (best)
      candidates.push({
        message: `Drop the ${ask.window} rule and ${slotLabel(best, viewer.timeZone)} works.`,
        action: { dropWindow: true },
        slot: best,
      });
  }
  for (const person of ask.people) {
    if (person.isViewer) continue;
    const others = ask.people.filter((p) => p !== person);
    if (others.filter((p) => !p.isViewer).length === 0) continue;
    const best = findSlots({ ...ask, people: others }, days, viewer, now)[0];
    if (best)
      candidates.push({
        message: `Without ${firstName(person)} (${person.city}), ${slotLabel(best, viewer.timeZone)} works.`,
        action: { dropPerson: person.id },
        slot: best,
      });
  }
  candidates.sort((a, b) => {
    // Prefer relaxing a rule over dropping a person when it is nearly as good.
    const bias = (s: Suggestion) =>
      s.slot.score + (s.action.dropWindow || s.action.widenDays ? 0.1 : 0);
    return bias(b) - bias(a);
  });
  return candidates[0] ?? null;
}

export { describeTime };
export const DAY_STEP = STEP;
export { startOfDay };

import { firstName, PEOPLE, type Person, type Slot, type WindowSpec } from "@/lib/schedule";
import { formatMinutes, fromZoned, MINUTE, zoned } from "@/lib/time";

/** A meeting booked through the page. Kept in this browser only. */
export type Booking = {
  id: string;
  people: string[];
  durationMin: number;
  meetingType: string | null;
  window: WindowSpec | null;
  start: number;
  /** Seeded so the feature shows something on a first visit. */
  sample?: boolean;
};

const KEY = "book-in-one-sentence:history:v1";
const DAY = 24 * 60 * MINUTE;

function person(id: string): Person {
  return PEOPLE.find((p) => p.id === id) as Person;
}

/** Past instants for "every <weekday> at <minutes> on <person>'s clock". */
function weekly(anchor: string, weekday: number, minutes: number, weeksBack: number[], now: number) {
  const tz = person(anchor).timeZone;
  return weeksBack.map((w) => {
    let t = now - w * 7 * DAY;
    while (zoned(t, tz).weekday !== weekday) t -= DAY;
    return fromZoned(zoned(t, tz).dateKey, minutes, tz);
  });
}

function samples(now: number): Booking[] {
  const make = (
    people: string[],
    durationMin: number,
    meetingType: string | null,
    starts: number[],
  ): Booking[] =>
    starts.map((start, i) => ({
      id: `sample-${people.join("-")}-${i}`,
      people,
      durationMin,
      meetingType,
      window: null,
      start,
      sample: true,
    }));
  return [
    // Lena and Priya: Wednesdays at noon in Berlin.
    ...make(["lena", "priya"], 30, "Video call", weekly("lena", 3, 12 * 60, [1, 2, 3], now)),
    // Design crew: Tuesdays at 9 am in Berlin, which is evening in Sydney.
    ...make(["lena", "oliver"], 45, "Video call", weekly("lena", 2, 9 * 60, [1, 2], now)),
    // Eng: Thursdays at 8:30 am in San Francisco, late evening in Bengaluru.
    ...make(["marcus", "priya"], 30, "Video call", weekly("marcus", 4, 8 * 60 + 30, [1, 3], now)),
  ];
}

export function loadHistory(now: number): Booking[] {
  let saved: Booking[] = [];
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    saved = [];
  }
  return [...saved, ...samples(now)].sort((a, b) => b.start - a.start);
}

export function saveBookings(bookings: Booking[]): void {
  try {
    const saved: Booking[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    localStorage.setItem(KEY, JSON.stringify([...bookings, ...saved].slice(0, 100)));
  } catch {
    // Private mode or blocked storage: the booking still shows, it just isn't remembered.
  }
}

export function bookingFrom(
  slot: Slot,
  extra: { durationMin: number; meetingType: string | null; window: WindowSpec | null },
): Booking {
  return {
    id: `${slot.start}-${Math.random().toString(36).slice(2, 8)}`,
    people: slot.comforts.filter((c) => !c.person.isViewer).map((c) => c.person.id),
    start: slot.start,
    ...extra,
  };
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/** What this exact group usually does. */
export type Habit = {
  people: string[];
  count: number;
  durationMin: number;
  meetingType: string | null;
  /** The usual start, read on the first guest's clock. */
  minutes: number;
  weekday: number;
  timeZone: string;
  anchor: string;
};

export function habitFor(peopleIds: string[], history: Booking[]): Habit | null {
  if (peopleIds.length === 0) return null;
  const matches = history.filter((b) => sameSet(b.people, peopleIds));
  if (matches.length === 0) return null;
  const last = matches[0];
  const anchor = last.people[0];
  const tz = person(anchor).timeZone;
  const local = zoned(last.start, tz);
  return {
    people: last.people,
    count: matches.length,
    durationMin: last.durationMin,
    meetingType: last.meetingType,
    minutes: local.minutes,
    weekday: local.weekday,
    timeZone: tz,
    anchor,
  };
}

/** The most recent booking that includes everyone named (or the latest of all). */
export function lastBookingWith(peopleIds: string[], history: Booking[]): Booking | null {
  return history.find((b) => peopleIds.every((id) => b.people.includes(id))) ?? null;
}

/** Distinct groups, most recent first. */
export function recentGroups(history: Booking[], limit = 3): Habit[] {
  const out: Habit[] = [];
  for (const booking of history) {
    if (out.some((h) => sameSet(h.people, booking.people))) continue;
    const habit = habitFor(booking.people, history);
    if (habit) out.push(habit);
    if (out.length >= limit) break;
  }
  return out;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeHabit(habit: Habit): string {
  return `usually ${WEEKDAY_NAMES[habit.weekday]} ${formatMinutes(habit.minutes)} ${firstName(person(habit.anchor))}'s time`;
}

export function groupLabel(ids: string[]): string {
  const names = ids.map((id) => firstName(person(id)));
  return names.length <= 2 ? names.join(" & ") : `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
}

/** Ranking nudge for slots at this group's usual time. Comfort itself is untouched. */
export function habitBonus(slot: Slot, habit: Habit | null): number {
  if (!habit) return 0;
  const local = zoned(slot.start, habit.timeZone);
  const near = Math.abs(local.minutes - habit.minutes) <= 30;
  if (!near) return 0;
  return local.weekday === habit.weekday ? 0.12 : 0.06;
}

/** "time" when the weekday matches too, "hour" when only the clock does. */
export function usualMatch(slot: Slot, habit: Habit | null): "time" | "hour" | null {
  const bonus = habitBonus(slot, habit);
  return bonus === 0 ? null : bonus > 0.1 ? "time" : "hour";
}

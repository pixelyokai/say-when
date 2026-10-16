import {
  type Ask,
  comfortFor,
  findSlots,
  isFeasible,
  type Person,
  pickDistinct,
  type Slot,
} from "@/lib/schedule";
import { MINUTE } from "@/lib/time";

const WEEK = 7 * 24 * 60 * MINUTE;

export type PersonShare = {
  person: Person;
  /** Weeks spent outside working hours, fixed time vs the rotation. */
  fixedBad: number;
  rotatingBad: number;
  /** Average comfort, fixed time vs the rotation. */
  fixed: number;
  rotating: number;
};

export type Series = {
  /** One start per week, in order. */
  starts: number[];
  /** The distinct times the series alternates between. */
  templates: Slot[];
  shares: PersonShare[];
  weeks: number;
  /** Most weeks anyone spends outside their hours. */
  worstBad: number;
  fixedWorstBad: number;
};

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  const out: T[][] = [];
  items.forEach((item, i) => {
    for (const rest of combinations(items.slice(i + 1), k - 1)) out.push([item, ...rest]);
  });
  return out;
}

type Scored = {
  starts: number[];
  shares: PersonShare[];
  worstBad: number;
  /** Σ bad weeks²: low when the bad hours are spread, high when one person always pays. */
  burden: number;
  floor: number;
  mean: number;
};

function score(ask: Ask, starts: number[], fixedStart: number): Scored {
  const shares = ask.people.map((person) => {
    const comforts = starts.map((t) => comfortFor(person, t, ask.durationMin));
    const fixedComfort = comfortFor(person, fixedStart, ask.durationMin);
    return {
      person,
      rotating: comforts.reduce((a, b) => a + b, 0) / starts.length,
      rotatingBad: comforts.filter((c) => c < 1).length,
      fixed: fixedComfort,
      fixedBad: fixedComfort < 1 ? starts.length : 0,
    };
  });
  // Fairness is judged among the guests; the organizer chooses to absorb their own share.
  const guests = shares.filter((s) => !s.person.isViewer);
  return {
    starts,
    shares,
    worstBad: Math.max(...guests.map((s) => s.rotatingBad)),
    burden: guests.reduce((a, s) => a + s.rotatingBad ** 2, 0),
    floor: Math.min(...guests.map((s) => s.rotating)),
    mean: guests.reduce((a, s) => a + s.rotating, 0) / guests.length,
  };
}

function better(a: Scored, b: Scored | null): boolean {
  if (!b) return true;
  if (a.burden !== b.burden) return a.burden < b.burden;
  if (Math.abs(a.floor - b.floor) > 0.001) return a.floor > b.floor;
  return a.mean > b.mean;
}

/**
 * When the same people always take the early or late call, take turns:
 * alternate two or three times over `weeks` weeks. Chooses the rotation that
 * spreads the weeks spent outside working hours most evenly, then lifts the
 * worst-off person's average comfort.
 */
export function proposeRotation(
  ask: Ask,
  days: Date[],
  viewer: Person,
  now: number,
  weeks = 4,
): Series | null {
  if (ask.people.filter((p) => !p.isViewer).length < 2) return null;
  const relaxed = { ...ask, window: null, time: null };
  const all = findSlots(relaxed, days, viewer, now);
  if (all.length < 2) return null;
  const repeats = (slot: Slot) =>
    Array.from({ length: weeks }, (_, w) => slot.start + w * WEEK).every((t) =>
      isFeasible(relaxed, t, viewer),
    );

  // Candidates: the best-scored times, plus each person's best time inside their own hours,
  // so the burden can actually move between people.
  const own = ask.people
    .map((p) => all.find((s) => comfortFor(p, s.start, ask.durationMin) >= 1))
    .filter((s): s is Slot => s !== undefined);
  const candidates = pickDistinct([...own, ...all], 10, 60).filter(repeats);
  if (candidates.length < 2) return null;

  const fixed = all[0];
  const fixedPlan = score(ask, Array.from({ length: weeks }, (_, w) => fixed.start + w * WEEK), fixed.start);

  let best: (Scored & { templates: Slot[] }) | null = null;
  for (const k of [2, 3]) {
    for (const set of combinations(candidates, k)) {
      const templates = [...set].sort((a, b) => a.start - b.start);
      const starts = Array.from(
        { length: weeks },
        (_, w) => templates[w % templates.length].start + w * WEEK,
      );
      const plan = score(ask, starts, fixed.start);
      if (better(plan, best)) best = { ...plan, templates };
    }
  }
  // Offer it only when it clearly shares the bad hours, without making the worst week much worse.
  if (!best || best.burden > fixedPlan.burden * 0.85 || best.floor < fixedPlan.floor - 0.1)
    return null;
  return {
    starts: best.starts,
    templates: best.templates,
    shares: best.shares,
    weeks,
    worstBad: best.worstBad,
    fixedWorstBad: fixedPlan.worstBad,
  };
}

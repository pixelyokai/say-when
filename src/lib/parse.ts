import type { ComposerValue } from "@/components/ui/composer";
import { type Group, STARTER_GROUPS } from "@/lib/groups";
import { type DaysSpec, PEOPLE, type WindowSpec } from "@/lib/schedule";

/** Same shape the language model is asked to return. */
export type ParsedAsk = {
  people: string[];
  durationMin: number | null;
  days: DaysSpec | null;
  window: WindowSpec | null;
  timezone: "theirs" | "mine" | null;
  meetingType: string | null;
  /** A clock time: "at 3pm", "after 2", "before noon". Minutes since midnight. */
  time: { kind: "at" | "after" | "before"; minutes: number } | null;
  /** Whose clock the time is read on: a person id, or null for the organizer. */
  timeOf: string | null;
  /** "same as last time", "again", "as usual": fill gaps from history. */
  repeat: boolean;
  /** A specific calendar date: "YYYY-MM-DD", or "--MM-DD" when no year was given. Wins over `days`. */
  date: string | null;
};

export const EMPTY_ASK: ParsedAsk = {
  people: [],
  durationMin: null,
  days: null,
  window: null,
  timezone: null,
  meetingType: null,
  time: null,
  timeOf: null,
  repeat: false,
  date: null,
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
// Not followed by a duration unit, so "may 30 min" is not May 30.
const DAY = "(\\d{1,2})(?:st|nd|rd|th)?(?!\\s*(?:min|mins|minutes?|h|hrs?|hours?)\\b)";

const pad = (n: number) => String(n).padStart(2, "0");

function validDay(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** "oct 24", "24 october", "the 24th", "24/10", "2026-10-24". */
function readDate(t: string): string | null {
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso && validDay(Number(iso[2]), Number(iso[3]))) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const monthFirst = t.match(new RegExp(`\\b${MONTH}\\.?\\s+${DAY}\\b`));
  if (monthFirst) {
    const m = MONTHS.indexOf(monthFirst[1].slice(0, 3)) + 1;
    const d = Number(monthFirst[2]);
    if (validDay(m, d)) return `--${pad(m)}-${pad(d)}`;
  }
  const dayFirst = t.match(new RegExp(`\\b${DAY}\\s+(?:of\\s+)?${MONTH}\\b`));
  if (dayFirst) {
    const m = MONTHS.indexOf(dayFirst[2].slice(0, 3)) + 1;
    const d = Number(dayFirst[1]);
    if (validDay(m, d)) return `--${pad(m)}-${pad(d)}`;
  }
  // Numeric: day first unless that's impossible (24/10 and 10/24 both work; 5/6 reads as 5 June).
  const numeric = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    if (validDay(b, a)) return `--${pad(b)}-${pad(a)}`;
    if (validDay(a, b)) return `--${pad(a)}-${pad(b)}`;
  }
  // "the 24th": this month, or next month if it has passed (resolved later).
  const ordinal = t.match(/\bthe (\d{1,2})(st|nd|rd|th)\b/);
  if (ordinal && validDay(1, Number(ordinal[1]))) return `--00-${pad(Number(ordinal[1]))}`;
  return null;
}

const TIME =
  /(?:\b(at|around|after|from|before|by|until)\s+)?\b(noon|midday|(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|a|p)\b|(\d{1,2}):(\d{2})\b)/g;

function readTime(t: string): ParsedAsk["time"] {
  for (const m of t.matchAll(TIME)) {
    const [, word, , h12, min12, meridiem, h24, min24] = m;
    let minutes: number | null = null;
    if (m[2] === "noon" || m[2] === "midday") minutes = 12 * 60;
    else if (h12) {
      const h = Number(h12) % 12;
      minutes = (meridiem.startsWith("p") ? h + 12 : h) * 60 + Number(min12 ?? 0);
    } else if (h24) minutes = Number(h24) * 60 + Number(min24);
    if (minutes === null || minutes >= 1440) continue;
    const kind =
      word === "after" || word === "from"
        ? "after"
        : word === "before" || word === "by" || word === "until"
          ? "before"
          : "at";
    return { kind, minutes };
  }
  // "at 3" with no am/pm: read the way people say it during a workday.
  const bare = t.match(/\b(at|around|after|before)\s+(\d{1,2})\b(?!\s*(?:min|h|hour|:))/);
  if (bare) {
    const n = Number(bare[2]);
    if (n >= 1 && n <= 12) {
      const h = n === 12 ? 12 : n <= 7 ? n + 12 : n;
      const kind = bare[1] === "after" ? "after" : bare[1] === "before" ? "before" : "at";
      return { kind, minutes: h * 60 };
    }
  }
  return null;
}

const WEEKDAYS: [RegExp, DaysSpec][] = [
  [/\bmon(day)?\b/, "mon"],
  [/\btue(s|sday)?\b/, "tue"],
  [/\bwed(nesday)?\b/, "wed"],
  [/\bthu(rs|rsday)?\b/, "thu"],
  [/\bfri(day)?\b/, "fri"],
  [/\bsat(urday)?\b/, "sat"],
  [/\bsun(day)?\b/, "sun"],
];

function addPerson(list: string[], id: string): void {
  if (!list.includes(id)) list.push(id);
}

function addPersonIfKnown(list: string[], id: string): void {
  if (PEOPLE.some((p) => p.id === id)) addPerson(list, id);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Rule-based reading of the sentence. Runs on every keystroke, never
 * throws, and ignores words it does not understand. `groups` are the
 * visitor's saved groups, so `@launch-crew` expands to its members.
 */
export function parseAsk(value: ComposerValue, groups: Group[] = STARTER_GROUPS): ParsedAsk {
  const ask: ParsedAsk = { ...EMPTY_ASK, people: [] };
  let text = "";

  for (const part of value) {
    if (part.type === "text") {
      text += part.text;
      continue;
    }
    text += " ";
    if (part.kind === "person") addPersonIfKnown(ask.people, part.id);
    if (part.kind === "team") {
      // The live group wins; the members saved on the token cover a group deleted since.
      const group = groups.find((g) => g.id === part.id);
      const members = group?.members ?? part.data?.split(",") ?? [];
      for (const id of members) addPersonIfKnown(ask.people, id);
    }
    if (part.kind === "group") for (const id of part.id.split("+")) addPersonIfKnown(ask.people, id);
    if (part.kind === "duration" && part.data) ask.durationMin = Number(part.data);
    if (part.kind === "type") ask.meetingType = part.label;
    if (part.kind === "repeat") ask.repeat = true;
    if (part.kind === "date" && part.data) ask.date = part.data;
  }

  const t = text.toLowerCase();

  // People typed as plain names.
  for (const person of PEOPLE) {
    const first = person.name.split(" ")[0].toLowerCase();
    if (new RegExp(`\\b${first}\\b`).test(t)) addPerson(ask.people, person.id);
  }
  // Groups typed as words: "@launch-crew", "the design team", or a multi-word
  // name on its own ("launch crew"). A bare one-word name isn't enough:
  // "design review" shouldn't pull in the Design group.
  for (const group of groups) {
    const lower = group.name.trim().toLowerCase();
    const name = escapeRegExp(lower);
    const named = lower.includes(" ")
      ? new RegExp(`\\b${name}\\b`)
      : new RegExp(`\\b${name} (group|team)\\b`);
    if (new RegExp(`@${escapeRegExp(group.id)}\\b`).test(t) || named.test(t))
      for (const id of group.members) addPersonIfKnown(ask.people, id);
  }

  // Duration.
  if (ask.durationMin === null) {
    const match = t.match(/(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h)\b(?!\.)/);
    if (match) {
      const n = Number(match[1]);
      ask.durationMin = Math.round(match[2].startsWith("h") ? n * 60 : n);
    } else if (/\bhalf an? hour\b/.test(t)) ask.durationMin = 30;
    else if (/\b(an|one) hour\b/.test(t)) ask.durationMin = 60;
    else if (/\bquick\b/.test(t)) ask.durationMin = 15;
    if (ask.durationMin !== null && (ask.durationMin < 5 || ask.durationMin > 240))
      ask.durationMin = null;
  }

  // A specific date wins over relative days.
  ask.date ??= readDate(t);

  // Days.
  if (/\bnext week\b/.test(t)) ask.days = "next-week";
  else if (/\bthis week\b/.test(t)) ask.days = "this-week";
  else if (/\btomorrow\b/.test(t)) ask.days = "tomorrow";
  else if (/\btoday\b/.test(t)) ask.days = "today";
  else {
    const day = WEEKDAYS.find(([re]) => re.test(t));
    if (day) ask.days = day[1];
  }

  // Part of day.
  if (/\bmornings?\b/.test(t)) ask.window = "morning";
  else if (/\bafternoons?\b|\bafter lunch\b/.test(t)) ask.window = "afternoon";
  else if (/\bevenings?\b/.test(t)) ask.window = "evening";

  // Whose clock.
  if (/\btheir (time|local|afternoons?|mornings?|evenings?)\b|\btheirs\b|\blocal time\b/.test(t))
    ask.timezone = "theirs";
  else if (/\bmy (time|afternoons?|mornings?|evenings?)\b|\bmine\b/.test(t))
    ask.timezone = "mine";

  ask.repeat = /\b(same as (last time|before|usual)|as usual|again|the usual|usual time)\b/.test(t);

  // Clock time, and whose clock.
  ask.time = readTime(t);
  if (ask.time) {
    for (const person of PEOPLE) {
      const first = person.name.split(" ")[0].toLowerCase();
      const city = person.city.toLowerCase();
      if (new RegExp(`\\b(${first}'s|${city}) time\\b`).test(t)) ask.timeOf = person.id;
    }
    if (!ask.timeOf && ask.timezone === "theirs" && ask.people.length === 1)
      ask.timeOf = ask.people[0];
  }

  // Meeting type typed as words.
  if (!ask.meetingType) {
    if (/\b(video|zoom|meet|call)\b/.test(t)) ask.meetingType = "Video call";
    else if (/\bphone\b/.test(t)) ask.meetingType = "Phone call";
    else if (/\bin person\b|\bcoffee\b/.test(t)) ask.meetingType = "In person";
  }

  return ask;
}

"use client";

import { CommandIcon, HistoryIcon, SparklesIcon, TriangleAlertIcon, UsersRoundIcon, XIcon } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ComposerPart, ComposerValue } from "@/components/ui/composer";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { toastManager } from "@/components/ui/toast";
import { AskComposer } from "@/components/booker/ask-composer";
import { CommandPalette, type PaletteGroup } from "@/components/booker/command-palette";
import { ConfirmBooking } from "@/components/booker/confirm-booking";
import { OverlapView } from "@/components/booker/overlap-view";
import { PersonAvatar } from "@/components/booker/person-avatar";
import { type SlotFilter, SlotFilterControl, SlotList } from "@/components/booker/slot-list";
import { announceVote, AskGuestsDialog, PollStatus } from "@/components/booker/ask-guests";
import { RotationCard } from "@/components/booker/rotation-card";
import { GroupsSheet, type GroupsView } from "@/components/booker/groups-sheet";
import { type Group, loadGroups, subscribeToGroups } from "@/lib/groups";
import {
  bookingFrom,
  describeHabit,
  groupLabel,
  type Habit,
  habitBonus,
  habitFor,
  lastBookingWith,
  loadHistory,
  recentGroups,
  saveBookings,
  usualMatch,
} from "@/lib/history";
import { parseAsk } from "@/lib/parse";
import {
  closePoll,
  loadActivePoll,
  mergeReply,
  newPollId,
  type PollState,
  readReplyHash,
  startPoll,
  subscribeToVotes,
} from "@/lib/poll";
import { afterGesture } from "@/lib/after-gesture";
import { proposeRotation } from "@/lib/rotation";
import {
  type Ask,
  describeTime,
  findSlots,
  firstName,
  makeViewer,
  PEOPLE,
  pickDistinct,
  resolveDate,
  resolveDays,
  type Slot,
  slotLabel,
  suggestFix,
} from "@/lib/schedule";
import { dayKey, formatDay, formatTime, MINUTE, startOfDay, viewerTimeZone, zoned } from "@/lib/time";

const SAMPLE: ComposerValue = [
  { type: "text", text: "30 min with " },
  { type: "mention", id: "lena", label: "Lena", trigger: "@", kind: "person" },
  { type: "text", text: " and " },
  { type: "mention", id: "priya", label: "Priya", trigger: "@", kind: "person" },
  { type: "text", text: " next week, afternoons their time" },
];

function repeatValue(habit: Habit): ComposerValue {
  const parts: ComposerPart[] = [{ type: "text", text: "with " }];
  habit.people.forEach((id, i) => {
    const person = PEOPLE.find((p) => p.id === id);
    if (!person) return;
    if (i > 0) parts.push({ type: "text", text: i === habit.people.length - 1 ? " and " : ", " });
    parts.push({ type: "mention", id, label: firstName(person), trigger: "@", kind: "person" });
  });
  parts.push({ type: "text", text: " next week, same as last time" });
  return parts;
}

/** Adds (or replaces) a date token, as if picked from the `/` menu. */
function withDate(value: ComposerValue, date: Date): ComposerValue {
  const key = dayKey(date);
  const token: ComposerPart = {
    type: "mention",
    id: `date-${key}`,
    label: formatDay(date),
    trigger: "/",
    kind: "date",
    data: key,
  };
  if (value.some((p) => p.type !== "text" && p.kind === "date"))
    return value.map((p) => (p.type !== "text" && p.kind === "date" ? token : p));
  const last = value.at(-1);
  const endsWithSpace = !value.length || (last?.type === "text" && /\s$/.test(last.text));
  const lead: ComposerPart = { type: "text", text: endsWithSpace ? "on " : " on " };
  return [...value, lead, token, { type: "text", text: " " }];
}

const CITY_KEY = "book-in-one-sentence:city";

const DURATION_TEXT = /\d+(?:\.\d+)?\s*(?:minutes?|mins?|m|hours?|hrs?|h)\b/i;

function withPerson(value: ComposerValue, id: string): ComposerValue {
  const person = PEOPLE.find((p) => p.id === id);
  if (!person) return value;
  const token: ComposerPart = {
    type: "mention",
    id,
    label: firstName(person),
    trigger: "@",
    kind: "person",
  };
  const lead: ComposerPart[] = value.length ? [{ type: "text", text: " " }] : [{ type: "text", text: "with " }];
  return [...value, ...lead, token, { type: "text", text: " " }];
}

function withoutPerson(value: ComposerValue, id: string): ComposerValue {
  return value.filter((part) => !(part.type !== "text" && part.id === id));
}

function withDuration(value: ComposerValue, minutes: number): ComposerValue {
  let replaced = false;
  const next = value.map((part): ComposerPart => {
    if (part.type !== "text" && part.kind === "duration") {
      replaced = true;
      return { ...part, id: `${minutes}m`, label: `${minutes} min`, data: String(minutes) };
    }
    if (part.type === "text" && !replaced && DURATION_TEXT.test(part.text)) {
      replaced = true;
      return { type: "text", text: part.text.replace(DURATION_TEXT, `${minutes} min`) };
    }
    return part;
  });
  return replaced ? next : [{ type: "text", text: `${minutes} min ` }, ...value];
}

export function Booker() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Your city is a label only (your clock comes from the browser); it's editable and remembered here.
  const [viewerCity, setViewerCity] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CITY_KEY);
    } catch {
      return null;
    }
  });
  const viewer = useMemo(() => makeViewer(viewerTimeZone(), viewerCity), [viewerCity]);
  const changeViewerCity = useCallback((city: string) => {
    const next = city.trim() || null;
    setViewerCity(next);
    try {
      if (next) localStorage.setItem(CITY_KEY, next);
      else localStorage.removeItem(CITY_KEY);
    } catch {}
  }, []);
  const [value, setValue] = useState<ComposerValue>([]);
  // Your groups: saved in this browser, edited in the Groups sheet, mentioned with @.
  const [savedGroups, setSavedGroups] = useState<Group[]>(() => loadGroups());
  useEffect(() => subscribeToGroups(setSavedGroups), []);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupsView, setGroupsView] = useState<GroupsView>({ mode: "list" });
  const openGroups = useCallback((view: GroupsView = { mode: "list" }) => {
    setGroupsView(view);
    afterGesture(() => setGroupsOpen(true));
  }, []);

  const typed = useMemo(() => parseAsk(value, savedGroups), [value, savedGroups]);

  // Learn from the group: past bookings in this browser (plus a few samples).
  const [history, setHistory] = useState(() => loadHistory(Date.now()));
  const groups = useMemo(() => recentGroups(history), [history]);
  const scheduleGroup = useCallback((group: Group) => {
    setGroupsOpen(false);
    setValue([
      { type: "text", text: "30 min with " },
      { type: "mention", id: group.id, label: group.name, trigger: "@", kind: "team", data: group.members.join(",") },
      { type: "text", text: " next week" },
    ]);
  }, []);
  // "same as last time" fills whatever the sentence left out from the last matching meeting.
  const repeatOf = typed.repeat ? lastBookingWith(typed.people, history) : null;
  const parsed = useMemo(
    () =>
      repeatOf
        ? {
            ...typed,
            people: [...new Set([...typed.people, ...repeatOf.people])],
            durationMin: typed.durationMin ?? repeatOf.durationMin,
            meetingType: typed.meetingType ?? repeatOf.meetingType,
          }
        : typed,
    [typed, repeatOf],
  );

  // Fixes the visitor accepted from the Alert. Cleared when the ask changes.
  const [dropWindow, setDropWindow] = useState(false);
  const [dropped, setDropped] = useState<string[]>([]);
  const [widenDays, setWidenDays] = useState(false);
  const [dropTime, setDropTime] = useState(false);
  const signature = JSON.stringify(parsed);
  const [fixesFor, setFixesFor] = useState(signature);
  if (fixesFor !== signature) {
    setFixesFor(signature);
    setDropWindow(false);
    setDropped([]);
    setWidenDays(false);
    setDropTime(false);
  }

  const ask: Ask = useMemo(
    () => ({
      people: [
        viewer,
        ...parsed.people
          .filter((id) => !dropped.includes(id))
          .map((id) => PEOPLE.find((p) => p.id === id))
          .filter((p) => p !== undefined),
      ],
      durationMin: parsed.durationMin ?? 30,
      window: dropWindow ? null : parsed.window,
      timezone: parsed.timezone ?? "mine",
      time:
        parsed.time && !dropTime
          ? {
              ...parsed.time,
              timeZone:
                PEOPLE.find((p) => p.id === parsed.timeOf)?.timeZone ?? viewer.timeZone,
            }
          : null,
    }),
    [parsed, dropped, dropWindow, dropTime, viewer],
  );
  const hasGuests = ask.people.length > 1;

  // Slot search runs on a deferred copy so typing never waits for it.
  const deferredAsk = useDeferredValue(ask);
  const today = useMemo(() => startOfDay(new Date(now)), [now]);
  const days = useMemo(
    () =>
      widenDays ? resolveDays(null, today) : resolveDays(parsed.days, today, parsed.date),
    [parsed.days, parsed.date, today, widenDays],
  );
  const habit = useMemo(
    () => habitFor(deferredAsk.people.filter((p) => !p.isViewer).map((p) => p.id), history),
    [deferredAsk, history],
  );
  // Comfort decides the order; the group's usual time nudges ties and near-ties.
  const slots = useMemo(
    () =>
      findSlots(deferredAsk, days, viewer, now)
        .map((slot) => ({ slot, rank: slot.score + habitBonus(slot, habit) }))
        .sort((a, b) => b.rank - a.rank || a.slot.start - b.slot.start)
        .map(({ slot }) => slot),
    [deferredAsk, days, viewer, now, habit],
  );

  const [filter, setFilter] = useState<SlotFilter>("best");
  const shown = useMemo(() => {
    if (filter === "all") return pickDistinct(slots, 12, 60);
    if (filter === "mornings")
      return pickDistinct(
        slots.filter((s) => zoned(s.start, viewer.timeZone).minutes < 12 * 60),
        3,
      );
    return pickDistinct(slots, 3);
  }, [filter, slots, viewer.timeZone]);
  const best = slots[0] ?? null;

  const [selectedStart, setSelectedStart] = useState<number | null>(null);
  const [pinnedDay, setPinnedDay] = useState<Date | null>(null);
  const [cursor, setCursor] = useState(12 * 60);
  const selected = slots.find((s) => s.start === selectedStart) ?? best;
  const day = pinnedDay ?? (selected ? startOfDay(new Date(selected.start)) : days[0]);

  // A new best slot (the ask changed) moves the cursor to it.
  const [focusedBest, setFocusedBest] = useState<number | null>(null);
  if (focusedBest !== (best?.start ?? null)) {
    setFocusedBest(best?.start ?? null);
    setSelectedStart(null);
    setPinnedDay(null);
    if (best) setCursor((best.start - startOfDay(new Date(best.start)).getTime()) / MINUTE);
  }

  const selectSlot = useCallback((slot: Slot) => {
    const slotDay = startOfDay(new Date(slot.start));
    setSelectedStart(slot.start);
    setPinnedDay(slotDay);
    setCursor((slot.start - slotDay.getTime()) / MINUTE);
  }, []);

  const isDayAvailable = useCallback(
    (d: Date) => d >= today && findSlots(deferredAsk, [d], viewer, today.getTime()).length > 0,
    [deferredAsk, today, viewer],
  );

  const suggestion = useMemo(() => {
    if (!hasGuests) return null;
    if (best && best.score >= 0.5) return null;
    return suggestFix(deferredAsk, days, viewer, now);
  }, [best, deferredAsk, days, hasGuests, viewer, now]);

  // Negotiate: when no single time is fair, offer a rotation.
  const series = useMemo(
    () =>
      hasGuests && (!best || best.score < 0.7)
        ? proposeRotation(deferredAsk, days, viewer, now)
        : null,
    [best, deferredAsk, days, hasGuests, viewer, now],
  );

  const [booking, setBooking] = useState<Slot | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const remember = useCallback(
    (slots: Slot[], details?: { durationMin: number; meetingType: string | null }) => {
      saveBookings(
        slots.map((slot) =>
          bookingFrom(slot, {
            durationMin: details?.durationMin ?? ask.durationMin,
            meetingType: details?.meetingType ?? parsed.meetingType,
            window: parsed.window,
          }),
        ),
      );
      setHistory(loadHistory(Date.now()));
    },
    [ask.durationMin, parsed.meetingType, parsed.window],
  );

  const bookSeries = useCallback(() => {
    if (!series) return;
    const guests = ask.people.filter((p) => !p.isViewer);
    remember(series.starts.map((start) => ({ ...series.templates[0], start, end: start + ask.durationMin * MINUTE })));
    toastManager.add({
      title: `${series.starts.length}-week series sent to ${guests.length} people`,
      description: `Alternating ${series.templates.map((t) => slotLabel(t, viewer.timeZone)).join(" and ")}. Not really sent, it's a concept.`,
      type: "success",
    });
    setValue([]);
  }, [ask.durationMin, ask.people, remember, series, viewer.timeZone]);

  // Ask the guests: a live poll, restored from this browser, with any reply link merged in.
  const [initialReply] = useState(() => {
    const reply = readReplyHash(window.location.hash);
    return reply ? { reply, merged: mergeReply(reply) } : null;
  });
  const [poll, setPoll] = useState<PollState | null>(
    () => initialReply?.merged ?? loadActivePoll(),
  );
  const [linksOpen, setLinksOpen] = useState(false);
  useEffect(() => {
    if (!initialReply) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (initialReply.merged) announceVote(initialReply.reply.guest);
    else
      toastManager.add({
        title: "That reply is for a poll this browser doesn't have",
        type: "warning",
      });
  }, [initialReply]);
  const pollRef = useRef(poll);
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);
  const pollId = poll?.poll.id;
  useEffect(() => {
    if (!pollId) return;
    return subscribeToVotes(pollId, (state) => {
      const before = pollRef.current?.votes ?? {};
      const changed = Object.keys(state.votes).find(
        (id) => JSON.stringify(state.votes[id]) !== JSON.stringify(before[id]),
      );
      if (changed) announceVote(changed);
      setPoll(state);
    });
  }, [pollId]);

  const askGuests = useCallback(() => {
    const guests = ask.people.filter((p) => !p.isViewer);
    const options = pickDistinct(slots, 4);
    if (!guests.length || !options.length) return;
    setPoll(
      startPoll({
        id: newPollId(),
        title: `${ask.durationMin} min with ${groupLabel(guests.map((g) => g.id))}`,
        durationMin: ask.durationMin,
        guests: guests.map((g) => g.id),
        slots: options.map((s) => s.start),
        organizerTz: viewer.timeZone,
      }),
    );
    afterGesture(() => setLinksOpen(true));
  }, [ask.durationMin, ask.people, slots, viewer.timeZone]);

  const yesFor = useCallback(
    (slot: Slot) =>
      poll && poll.poll.slots.includes(slot.start)
        ? poll.poll.guests.filter((id) => poll.votes[id]?.includes(slot.start))
        : null,
    [poll],
  );

  const copyInvite = useCallback(() => {
    if (!selected) return;
    const lines = selected.comforts.map(
      (c) =>
        `${c.person.isViewer ? "Organizer" : c.person.name} (${c.person.city}): ${formatTime(selected.start, c.person.timeZone)}`,
    );
    const text = `${ask.durationMin} min · ${formatDay(new Date(selected.start))}\n${lines.join("\n")}`;
    navigator.clipboard?.writeText(text).then(
      () => toastManager.add({ title: "Invite copied", type: "success" }),
      () => toastManager.add({ title: "Couldn't copy the invite", type: "error" }),
    );
  }, [ask.durationMin, selected]);

  const palette: PaletteGroup[] = useMemo(
    () => [
      {
        value: "Booking",
        items: [
          ...(selected
            ? [
                {
                  value: "book",
                  label: `Book ${slotLabel(selected, viewer.timeZone)}`,
                  shortcut: "↵",
                  run: () => afterGesture(() => setBooking(selected)),
                },
                { value: "copy", label: "Copy the invite", run: copyInvite },
              ]
            : []),
          ...(value.length
            ? [{ value: "clear", label: "Start over", run: () => setValue([]) }]
            : [{ value: "sample", label: "Try the example sentence", run: () => setValue(SAMPLE) }]),
        ],
      },
      {
        value: "People",
        items: PEOPLE.map((person) =>
          parsed.people.includes(person.id)
            ? {
                value: `remove-${person.id}`,
                label: `Remove ${person.name}`,
                run: () => setValue((v) => withoutPerson(v, person.id)),
              }
            : {
                value: `add-${person.id}`,
                label: `Add ${person.name} · ${person.city}`,
                run: () => setValue((v) => withPerson(v, person.id)),
              },
        ),
      },
      {
        value: "Duration",
        items: [15, 30, 45, 60, 90].map((m) => ({
          value: `duration-${m}`,
          label: `Change duration to ${m} min`,
          run: () => setValue((v) => withDuration(v, m)),
        })),
      },
      {
        value: "Groups",
        items: [
          { value: "groups-manage", label: "Manage groups", run: () => openGroups() },
          { value: "groups-new", label: "New group", run: () => openGroups({ mode: "edit", id: null }) },
          ...savedGroups.map((g) => ({
            value: `group-${g.id}`,
            label: `Schedule with ${g.name} (${g.members.length})`,
            run: () => scheduleGroup(g),
          })),
        ],
      },
      {
        value: "Together",
        items: [
          ...(hasGuests && slots.length
            ? [{ value: "ask-guests", label: "Ask the guests to pick", run: askGuests }]
            : []),
          ...(series
            ? [{ value: "series", label: `Book a ${series.starts.length}-week rotation`, run: bookSeries }]
            : []),
          ...groups.map((g) => ({
            value: `again-${g.people.join("-")}`,
            label: `Same as last time with ${groupLabel(g.people)}`,
            run: () => setValue(repeatValue(g)),
          })),
        ],
      },
      {
        value: "View",
        items: [
          { value: "view-best", label: "Show best slots", run: () => setFilter("best") },
          { value: "view-all", label: "Show all slots", run: () => setFilter("all") },
          { value: "view-mornings", label: "Show mornings only", run: () => setFilter("mornings") },
        ],
      },
    ],
    [askGuests, bookSeries, copyInvite, groups, hasGuests, openGroups, savedGroups, scheduleGroup, parsed.people, selected, series, slots.length, value.length, viewer.timeZone],
  );

  const pollPanel = poll && (
    <PollStatus
      onClose={() => {
        closePoll();
        setPoll(null);
      }}
      onSelect={(start) => {
        const slot = slots.find((s) => s.start === start);
        if (slot) selectSlot(slot);
        else {
          const d = startOfDay(new Date(start));
          setPinnedDay(d);
          setCursor((start - d.getTime()) / MINUTE);
        }
      }}
      onShowLinks={() => afterGesture(() => setLinksOpen(true))}
      selectedStart={selected?.start ?? null}
      state={poll}
      viewer={viewer}
    />
  );

  const chips: string[] = [];
  if (parsed.durationMin) chips.push(`${parsed.durationMin} min`);
  const exactDate = parsed.date ? resolveDate(parsed.date, today) : null;
  if (exactDate) chips.push(formatDay(exactDate));
  else if (parsed.days) chips.push(parsed.days.replace("-", " "));
  if (parsed.time)
    chips.push(
      describeTime(
        { ...parsed.time, timeZone: PEOPLE.find((p) => p.id === parsed.timeOf)?.timeZone ?? viewer.timeZone },
        viewer,
        PEOPLE,
      ),
    );
  if (parsed.window) chips.push(`${parsed.window}s`);
  if (parsed.timezone) chips.push(parsed.timezone === "theirs" ? "their time" : "your time");
  if (parsed.meetingType) chips.push(parsed.meetingType.toLowerCase());

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="font-heading font-semibold text-base">Book in one sentence</h1>
          <Badge variant="outline">Concept</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => openGroups()} size="sm" variant="outline">
            <UsersRoundIcon aria-hidden="true" />
            Groups
            <Badge className="max-sm:hidden" variant="secondary">
              {savedGroups.length}
            </Badge>
          </Button>
          <Button
            aria-label="Commands"
            onClick={() => afterGesture(() => setPaletteOpen(true))}
            size="sm"
            variant="outline"
          >
            <CommandIcon aria-hidden="true" />
            <span className="max-sm:sr-only">Commands</span>
            <KbdGroup className="max-sm:hidden">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </Button>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <AskComposer
          canBook={!!selected && hasGuests}
          now={now}
          onNewGroup={() => openGroups({ mode: "edit", id: null })}
          onPickDate={(d) => setValue((v) => withDate(v, d))}
          onSubmit={() => selected && hasGuests && afterGesture(() => setBooking(selected))}
          onValueChange={setValue}
          recentGroups={groups}
          savedGroups={savedGroups}
          value={value}
        />
        <div className="flex min-h-6 flex-wrap items-center gap-1.5" aria-live="polite">
          {ask.people.slice(1).length > 0 && (
            <div className="me-1 flex -space-x-1">
              {ask.people.slice(1).map((person) => (
                <PersonAvatar className="size-6 text-[0.5625rem] tracking-tight ring-2 ring-background" key={person.id} now={now} person={person} />
              ))}
            </div>
          )}
          {chips.map((chip) => (
            <Badge key={chip} variant="secondary">
              {chip}
            </Badge>
          ))}
          {typed.repeat && (
            <Badge variant={repeatOf ? "info" : "outline"}>
              <HistoryIcon aria-hidden="true" />
              {repeatOf
                ? `like ${new Date(repeatOf.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} with ${groupLabel(repeatOf.people)}`
                : "no earlier meeting found"}
            </Badge>
          )}
          {habit && (
            <Badge variant="info">
              <HistoryIcon aria-hidden="true" />
              {habit.count} before, {describeHabit(habit)}
            </Badge>
          )}
          {dropWindow && (
            <Badge render={<button onClick={() => setDropWindow(false)} type="button" />} variant="warning">
              ignoring the {parsed.window} rule
              <XIcon aria-label="Undo" />
            </Badge>
          )}
          {dropTime && parsed.time && (
            <Badge render={<button onClick={() => setDropTime(false)} type="button" />} variant="warning">
              any time
              <XIcon aria-label="Undo" />
            </Badge>
          )}
          {widenDays && (
            <Badge render={<button onClick={() => setWidenDays(false)} type="button" />} variant="warning">
              next five weekdays
              <XIcon aria-label="Undo" />
            </Badge>
          )}
          {dropped.map((id) => (
            <Badge
              key={id}
              render={<button onClick={() => setDropped((d) => d.filter((x) => x !== id))} type="button" />}
              variant="warning"
            >
              without {firstName(PEOPLE.find((p) => p.id === id)!)}
              <XIcon aria-label="Undo" />
            </Badge>
          ))}
        </div>
      </section>

      {!hasGuests ? (
        <Empty className="rounded-2xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SparklesIcon />
            </EmptyMedia>
            <EmptyTitle>Who, how long, and when</EmptyTitle>
            <EmptyDescription>
              Type <Kbd>@</Kbd> for people, <Kbd>/</Kbd> for duration and <Kbd>#</Kbd> for a date. The page answers while
              you type, and never asks for a time zone.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setValue(SAMPLE)} variant="outline">
              Try the example
            </Button>
            {groups.length > 0 && (
              <div className="flex w-full flex-col gap-2 pt-4">
                <div className="text-muted-foreground text-xs">Or pick up where a group left off</div>
                <ul className="flex flex-col gap-1.5">
                  {groups.map((g) => (
                    <li key={g.people.join("-")}>
                      <Button
                        className="h-auto w-full justify-between py-2"
                        onClick={() => setValue(repeatValue(g))}
                        variant="outline"
                      >
                        <span className="flex items-center gap-2">
                          <UsersRoundIcon aria-hidden="true" />
                          {groupLabel(g.people)}
                        </span>
                        <span className="truncate font-normal text-muted-foreground text-xs">
                          {g.durationMin} min · {describeHabit(g)}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <>
          {suggestion && (
            <Alert className="enter-motion" variant="warning">
              <TriangleAlertIcon />
              <AlertTitle>
                {best ? "Every option is a stretch for someone" : "No time works for everyone"}
              </AlertTitle>
              <AlertDescription>{suggestion.message}</AlertDescription>
              <AlertAction>
                <Button
                  onClick={() => {
                    if (suggestion.action.dropWindow) setDropWindow(true);
                    if (suggestion.action.widenDays) setWidenDays(true);
                    if (suggestion.action.dropTime) setDropTime(true);
                    if (suggestion.action.dropPerson)
                      setDropped((d) => [...d, suggestion.action.dropPerson!]);
                  }}
                  size="sm"
                  variant="outline"
                >
                  Apply
                </Button>
              </AlertAction>
            </Alert>
          )}

          <OverlapView
            ask={ask}
            cursor={cursor}
            day={day}
            isDayAvailable={isDayAvailable}
            now={now}
            onCursorChange={setCursor}
            onViewerCityChange={changeViewerCity}
            onDayChange={(d) => setPinnedDay(startOfDay(d))}
            selectedSlot={selected}
            viewer={viewer}
          />

          {pollPanel}

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading font-semibold text-sm">
                  {filter === "all" ? "All slots" : filter === "mornings" ? "Morning slots" : "Best slots"}
                </h2>
                <p className="text-muted-foreground text-xs">
                  Ranked by how comfortable the hour is for each person
                </p>
              </div>
              <div className="flex items-center gap-2">
                {slots.length > 0 && !poll && (
                  <Button onClick={askGuests} size="sm" variant="outline">
                    <UsersRoundIcon aria-hidden="true" />
                    Ask the guests
                  </Button>
                )}
                <SlotFilterControl onValueChange={setFilter} value={filter} />
              </div>
            </div>
            {shown.length > 0 ? (
              <SlotList
                usualFor={(slot) => usualMatch(slot, habit)}
                onBook={(slot) => afterGesture(() => setBooking(slot))}
                onSelect={selectSlot}
                selectedStart={selected?.start ?? null}
                slots={shown}
                viewer={viewer}
                yesFor={yesFor}
              />
            ) : (
              <Empty className="rounded-2xl border border-dashed py-10 md:py-12">
                <EmptyHeader>
                  <EmptyTitle className="text-base">No slots here</EmptyTitle>
                  <EmptyDescription>
                    {filter === "mornings"
                      ? "Nothing in your morning works. Try the other views."
                      : "Try another day, a shorter meeting, or the fix above."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </section>

          {series && (
            <RotationCard
              durationMin={ask.durationMin}
              onBook={bookSeries}
              series={series}
              viewer={viewer}
            />
          )}
        </>
      )}

      {!hasGuests && pollPanel}
      {poll && <AskGuestsDialog onOpenChange={setLinksOpen} open={linksOpen} state={poll} />}

      <footer className="mt-auto pt-6 text-muted-foreground text-xs">
        An unofficial concept, not affiliated with Cal.com. Built with coss ui. The people and
        calendars are fictional, and nothing is sent.
      </footer>

      {booking && (
        <ConfirmBooking
          durationMin={ask.durationMin}
          key={booking.start}
          meetingType={parsed.meetingType}
          now={now}
          onBooked={(details) => {
            remember([booking], details);
            setValue([]);
          }}
          onOpenChange={(open) => !open && setBooking(null)}
          slot={booking}
          viewer={viewer}
        />
      )}
      <GroupsSheet
        groups={savedGroups}
        now={now}
        onGroupsChange={setSavedGroups}
        onOpenChange={setGroupsOpen}
        onSchedule={scheduleGroup}
        onViewChange={setGroupsView}
        open={groupsOpen}
        view={groupsView}
      />
      <CommandPalette groups={palette} onOpenChange={setPaletteOpen} open={paletteOpen} />
    </main>
  );
}

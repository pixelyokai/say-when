"use client";

import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, PencilIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Frame, FrameHeader, FramePanel, FrameTitle, FrameDescription } from "@/components/ui/frame";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import {
  PreviewCard,
  PreviewCardPopup,
  PreviewCardTrigger,
} from "@/components/ui/preview-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { PersonAvatar } from "@/components/booker/person-avatar";
import { dropdownMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  type Ask,
  busyIntervals,
  DAY_STEP,
  firstName,
  type Person,
  type Slot,
  type SlotState,
  stateAt,
  WINDOWS,
} from "@/lib/schedule";
import {
  addDays,
  formatDay,
  formatMinutes,
  formatOffsetDiff,
  formatTime,
  formatWeekday,
  MINUTE,
  zoned,
} from "@/lib/time";

const ROW = 60;
const STRIP_TOP = 8;
const STRIP_HEIGHT = 28;

type Run<T> = { from: number; to: number; value: T };

function runs<T>(values: T[]): Run<T>[] {
  const out: Run<T>[] = [];
  values.forEach((value, i) => {
    const last = out[out.length - 1];
    if (last && last.value === value) last.to = i + 1;
    else out.push({ from: i, to: i + 1, value });
  });
  return out;
}

/*
 * Three encodings, one per question:
 *   shape  → is it working hours?   thick bar = working, thin line = outside hours
 *   shade  → are they free?         light bar = free, dark bar = busy
 *   colour → does it work for all?  solid green = everyone free in working hours,
 *                                   green line  = bookable, but outside someone's hours
 */
type Mark = "line" | "free" | "busy" | "match" | "reach";

const MARKS: Record<Mark, { fill: string; opacity: number; label: string }> = {
  line: { fill: "var(--foreground)", opacity: 0.2, label: "Outside working hours" },
  free: { fill: "var(--foreground)", opacity: 0.1, label: "Free" },
  busy: { fill: "var(--foreground)", opacity: 0.7, label: "Busy" },
  match: { fill: "var(--success)", opacity: 0.85, label: "Everyone free" },
  reach: { fill: "var(--success)", opacity: 0.9, label: "Bookable, outside someone's hours" },
};

function markFor(state: SlotState, aligned: boolean, reachable: boolean): Mark {
  if (aligned) return "match";
  if (state === "busy") return "busy";
  if (state === "free") return "free";
  return reachable ? "reach" : "line";
}

const LINE_HEIGHT = 2;

function PersonWeek({ person, day }: { person: Person; day: Date }) {
  const days = [0, 1, 2, 3, 4].map((i) => addDays(day, i));
  const span = person.workEnd - person.workStart;
  return (
    <div className="flex w-full flex-col gap-3">
      <div>
        <div className="font-medium">{person.name}</div>
        <div className="text-muted-foreground text-xs">
          {person.role} · {person.city} · {formatMinutes(person.workStart)}–
          {formatMinutes(person.workEnd)}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {days.map((d) => {
          const local = zoned(d.getTime() + 12 * 60 * MINUTE, person.timeZone);
          const weekend = local.weekday === 0 || local.weekday === 6;
          const busy = weekend ? [] : busyIntervals(person, local.dateKey);
          return (
            <div className="flex items-center gap-2 text-xs" key={d.getTime()}>
              <span className="w-8 text-muted-foreground">
                {formatWeekday(d.getTime() + 12 * 60 * MINUTE, person.timeZone)}
              </span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                {!weekend &&
                  busy.map(([s, e]) => (
                    <span
                      className="absolute inset-y-0 bg-foreground/70"
                      key={s}
                      style={{
                        left: `${((s - person.workStart) / span) * 100}%`,
                        width: `${((e - s) / span) * 100}%`,
                      }}
                    />
                  ))}
              </div>
              <span className="w-12 text-end text-muted-foreground tabular-nums">
                {weekend ? "off" : `${busy.length} mtg`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OverlapView({
  ask,
  viewer,
  day,
  onDayChange,
  isDayAvailable,
  cursor,
  onCursorChange,
  selectedSlot,
  now,
  onViewerCityChange,
}: {
  ask: Ask;
  viewer: Person;
  day: Date;
  onDayChange: (day: Date) => void;
  isDayAvailable: (day: Date) => boolean;
  cursor: number;
  onCursorChange: (minutes: number) => void;
  selectedSlot: Slot | null;
  now: number;
  onViewerCityChange: (city: string) => void;
}) {
  const people = ask.people;
  const dayStart = day.getTime();
  const dayMinutes = (addDays(day, 1).getTime() - dayStart) / MINUTE;
  const cols = Math.round(dayMinutes / DAY_STEP);
  const height = people.length * ROW;

  const states = useMemo(
    () =>
      people.map((person) =>
        Array.from({ length: cols }, (_, c) =>
          stateAt(person, dayStart + c * DAY_STEP * MINUTE),
        ),
      ),
    [people, cols, dayStart],
  );

  // Columns that can be booked: nobody busy or asleep, inside the window if one was asked.
  const reachable = useMemo(() => {
    const judged =
      ask.timezone === "theirs" ? people.filter((p) => !p.isViewer) : [viewer];
    return Array.from({ length: cols }, (_, c) => {
      if (people.length < 2) return false;
      if (!states.every((row) => row[c] === "free" || row[c] === "off")) return false;
      if (!ask.window) return true;
      const [from, to] = WINDOWS[ask.window];
      const t = dayStart + c * DAY_STEP * MINUTE;
      return judged.every((p) => {
        const m = zoned(t, p.timeZone).minutes;
        return m >= from && m < to;
      });
    });
  }, [ask.timezone, ask.window, cols, dayStart, people, states, viewer]);

  // The answer: bookable and inside everyone's working hours.
  const aligned = useMemo(() => {
    return reachable.map((ok, c) => ok && states.every((row) => row[c] === "free"));
  }, [reachable, states]);

  // One shared grid (every 3 hours on your clock), so labels line up down the
  // rows; each row reads the same instant on its own clock ("8:30 pm").
  const gridCols = useMemo(() => {
    const out: number[] = [];
    for (let c = 0; c < cols; c++) {
      if (zoned(dayStart + c * DAY_STEP * MINUTE, viewer.timeZone).minutes % 180 === 0) out.push(c);
    }
    return out;
  }, [cols, dayStart, viewer.timeZone]);
  const ticks = useMemo(
    () =>
      people.map((person) =>
        gridCols.map((col) => ({
          col,
          label: formatMinutes(zoned(dayStart + col * DAY_STEP * MINUTE, person.timeZone).minutes),
        })),
      ),
    [people, gridCols, dayStart],
  );

  const hasMatch = aligned.some(Boolean);
  const hasReach = reachable.some((r, c) => r && !aligned[c]);

  const cursorAt = dayStart + cursor * MINUTE;
  const viewerDay = formatWeekday(cursorAt, viewer.timeZone);

  const slotCols =
    selectedSlot && selectedSlot.start >= dayStart && selectedSlot.start < dayStart + dayMinutes * MINUTE
      ? {
          from: (selectedSlot.start - dayStart) / MINUTE / DAY_STEP,
          to: (selectedSlot.end - dayStart) / MINUTE / DAY_STEP,
        }
      : null;

  return (
    <Frame>
      <FrameHeader className="flex-row flex-wrap items-center gap-x-4 gap-y-2">
        <div className="me-auto">
          <FrameTitle>Overlap</FrameTitle>
          <FrameDescription>
            {formatDay(day)} in your time · drag the cursor or use the arrow keys
          </FrameDescription>
        </div>
        <div className="flex items-center gap-1">
          <Button
            aria-label="Previous day"
            onClick={() => onDayChange(addDays(day, -1))}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <Popover>
            <PopoverTrigger render={<Button size="sm" variant="outline" />}>
              <CalendarIcon aria-hidden="true" />
              {formatDay(day)}
            </PopoverTrigger>
            <PopoverPopup align="end" className={cn("w-auto", dropdownMotion)}>
              <Calendar
                defaultMonth={day}
                disabled={(d: Date) => !isDayAvailable(d)}
                mode="single"
                onSelect={(d?: Date) => d && onDayChange(d)}
                selected={day}
              />
            </PopoverPopup>
          </Popover>
          <Button
            aria-label="Next day"
            onClick={() => onDayChange(addDays(day, 1))}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </div>
      </FrameHeader>
      <FramePanel className="p-0">
        <ScrollArea className="rounded-[inherit]" scrollFade>
          <div className="grid min-w-[46rem] grid-cols-[14rem_minmax(0,1fr)] gap-x-4 px-5 pt-4 pb-5">
            {/* People column */}
            <div className="flex flex-col">
              {people.map((person) => {
                const local = formatTime(cursorAt, person.timeZone);
                const weekday = formatWeekday(cursorAt, person.timeZone);
                return (
                  <div className="flex items-center gap-2.5" key={person.id} style={{ height: ROW }}>
                    <PersonAvatar now={now} person={person} />
                    <div className="min-w-0 flex-1">
                      {person.isViewer ? (
                        <div className="truncate font-medium text-sm">You</div>
                      ) : (
                        <PreviewCard>
                          <PreviewCardTrigger
                            className="block truncate font-medium text-sm underline-offset-4 hover:underline"
                            href="#"
                            onClick={(e) => e.preventDefault()}
                          >
                            {firstName(person)}
                          </PreviewCardTrigger>
                          <PreviewCardPopup align="start" className="w-72">
                            <PersonWeek day={day} person={person} />
                          </PreviewCardPopup>
                        </PreviewCard>
                      )}
                      <div className="truncate text-muted-foreground text-xs">
                        {person.isViewer ? (
                          <CityEditor city={person.city} onChange={onViewerCityChange} />
                        ) : (
                          <>
                            {person.city} · {formatOffsetDiff(cursorAt, viewer.timeZone, person.timeZone)}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="font-medium text-sm tabular-nums">{local}</div>
                      <div className="text-muted-foreground text-xs">
                        {weekday !== viewerDay ? weekday : " "}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Strips */}
            <div className="relative" style={{ height }}>
              <svg
                aria-hidden="true"
                className="absolute inset-0 size-full"
                preserveAspectRatio="none"
                viewBox={`0 0 ${cols} ${height}`}
              >
                {/* The glow: a soft column behind every row where all of them line up.
                    Stronger where it's inside everyone's working hours. */}
                {runs(reachable.map((r, c) => (aligned[c] ? 2 : r ? 1 : 0)))
                  .filter((run) => run.value > 0)
                  .map((run) => (
                    <rect
                      className="overlap-glow"
                      fill="var(--success)"
                      fillOpacity={run.value === 2 ? 0.14 : 0.07}
                      height={height}
                      key={`glow-${run.from}-${run.to}`}
                      width={run.to - run.from}
                      x={run.from}
                      y={0}
                    />
                  ))}
                {states.map((row, r) => {
                  const mid = r * ROW + STRIP_TOP + STRIP_HEIGHT / 2;
                  const marks = row.map((state, c) => markFor(state, aligned[c], reachable[c]));
                  return (
                    <g key={people[r].id}>
                      {runs(marks).map((run) => {
                        const thin = run.value === "line" || run.value === "reach";
                        const h = thin ? (run.value === "reach" ? LINE_HEIGHT * 1.5 : LINE_HEIGHT) : STRIP_HEIGHT;
                        return (
                          <rect
                            fill={MARKS[run.value].fill}
                            fillOpacity={MARKS[run.value].opacity}
                            height={h}
                            key={run.from}
                            width={run.to - run.from}
                            x={run.from}
                            y={mid - h / 2}
                          />
                        );
                      })}
                    </g>
                  );
                })}
                {slotCols && (
                  <rect
                    fill="none"
                    height={height - 4}
                    stroke="var(--foreground)"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    width={slotCols.to - slotCols.from}
                    x={slotCols.from}
                    y={2}
                  />
                )}
              </svg>

              {/* Local times under each strip, on the shared grid */}
              {ticks.map((rowTicks, r) =>
                rowTicks.map((tick, i) => (
                  <span
                    className={cn(
                      "pointer-events-none absolute whitespace-nowrap text-[0.625rem] text-muted-foreground tabular-nums leading-none",
                      // The first label sits at the left edge: align its start, not its centre.
                      i === 0 && tick.col === 0 ? "translate-x-0" : "-translate-x-1/2",
                    )}
                    key={`${people[r].id}-${tick.col}`}
                    style={{
                      left: `${(tick.col / cols) * 100}%`,
                      top: r * ROW + STRIP_TOP + STRIP_HEIGHT + 5,
                    }}
                  >
                    {tick.label}
                  </span>
                )),
              )}

              {/* The one cursor */}
              {/* Full-width layer, so translateX(%) is a share of the strip width:
                  a transform transition, off the main thread, retargets mid-drag. */}
              <div
                aria-hidden="true"
                className="overlap-cursor pointer-events-none absolute inset-x-0 -top-2 -bottom-1"
                style={{ transform: `translateX(${(cursor / dayMinutes) * 100}%)` }}
              >
                <div className="absolute inset-y-0 left-0 -translate-x-1/2 border-foreground border-l" />
                <div className="absolute -top-1 left-0 size-2 -translate-x-1/2 rounded-full bg-foreground" />
              </div>
            </div>

            <div className="flex items-center pt-3 text-muted-foreground text-xs">
              Your time
            </div>
            <div className="pt-3">
              <Slider
                aria-label="Time cursor"
                getAriaLabel={() => "Time cursor"}
                max={dayMinutes}
                min={0}
                onValueChange={(value: number | readonly number[]) =>
                  onCursorChange(Array.isArray(value) ? value[0] : (value as number))
                }
                step={DAY_STEP}
                thumbAlignment="center"
                value={cursor}
              />
            </div>
            <div className="col-span-2 flex flex-wrap items-center gap-x-6 gap-y-2 pt-4">
              <Legend items={["free", "busy", "line"]} />
              {/* Only explain the greens actually on screen; say so when the best isn't there. */}
              {people.length > 1 && (
                <div className="ms-auto flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {!hasMatch && (
                    <span className="text-muted-foreground text-xs">
                      {hasReach
                        ? "Nobody's working hours line up on this day"
                        : "No time works for everyone on this day"}
                    </span>
                  )}
                  {(hasMatch || hasReach) && (
                    <Legend
                      items={[...(hasMatch ? (["match"] as const) : []), ...(hasReach ? (["reach"] as const) : [])]}
                      matchLabel={
                        ask.window
                          ? `Everyone free, ${ask.window} ${ask.timezone === "theirs" ? "their" : "your"} time`
                          : "Everyone free in working hours"
                      }
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </FramePanel>
    </Frame>
  );
}

/** Your city is only a label (the clock comes from the browser), so it's editable. */
function CityEditor({ city, onChange }: { city: string; onChange: (city: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(city);
  return (
    <Popover
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(city);
      }}
      open={open}
    >
      <PopoverTrigger
        aria-label={`Your city: ${city}. Change it`}
        className="inline-flex max-w-full items-center gap-1 truncate rounded-sm underline decoration-dotted underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {city}
        <PencilIcon aria-hidden="true" className="size-3 shrink-0 opacity-64" />
      </PopoverTrigger>
      <PopoverPopup align="start" className={cn("w-64", dropdownMotion)}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onChange(draft);
            setOpen(false);
          }}
        >
          <Field>
            <FieldLabel>Your city</FieldLabel>
            <Input autoFocus onChange={(e) => setDraft(e.target.value)} size="sm" value={draft} />
            <FieldDescription>
              A label only. Times follow your device&apos;s time zone.
            </FieldDescription>
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Reset
            </Button>
            <Button size="sm" type="submit">
              Save
            </Button>
          </div>
        </form>
      </PopoverPopup>
    </Popover>
  );
}

/** Each swatch is drawn exactly like the mark it explains, shape included. */
function Legend({
  items,
  matchLabel,
  className,
}: {
  items: Mark[];
  matchLabel?: string;
  className?: string;
}) {
  return (
    <ul
      aria-label="Legend"
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 text-muted-foreground text-xs", className)}
    >
      {items.map((mark, i) => {
        const thin = mark === "line" || mark === "reach";
        return (
          <li className="inline-flex items-center gap-1.5" key={mark}>
            {i > 0 && <Separator className="me-1.5 h-3" orientation="vertical" />}
            <svg aria-hidden="true" className="h-2.5 w-4" viewBox="0 0 16 10">
              <rect
                fill={MARKS[mark].fill}
                fillOpacity={MARKS[mark].opacity}
                height={thin ? LINE_HEIGHT * 1.5 : 10}
                rx={thin ? 0 : 2}
                width={16}
                x={0}
                y={thin ? 3.5 : 0}
              />
            </svg>
            <span className={mark === "match" ? "text-foreground" : undefined}>
              {mark === "match" && matchLabel ? matchLabel : MARKS[mark].label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

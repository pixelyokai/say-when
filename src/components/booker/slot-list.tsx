"use client";

import { CheckIcon, HistoryIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Meter, MeterIndicator, MeterLabel, MeterTrack, MeterValue } from "@/components/ui/meter";
import { RadioGroupPrimitive, RadioPrimitive } from "@/components/ui/radio-group";
import {
  segmentedControlItemVariants,
  segmentedControlRootClassName,
} from "@/lib/segmented-control";
import { cn } from "@/lib/utils";
import { explainSlot, firstName, type Person, type Slot } from "@/lib/schedule";
import { formatDay, formatTime, formatWeekday } from "@/lib/time";

export type SlotFilter = "best" | "all" | "mornings";

const FILTERS: { value: SlotFilter; label: string }[] = [
  { value: "best", label: "Best" },
  { value: "all", label: "All" },
  { value: "mornings", label: "Mornings" },
];

export function SlotFilterControl({
  value,
  onValueChange,
}: {
  value: SlotFilter;
  onValueChange: (value: SlotFilter) => void;
}) {
  return (
    <RadioGroupPrimitive
      aria-label="Which slots to show"
      className={segmentedControlRootClassName}
      onValueChange={(next) => onValueChange(next as SlotFilter)}
      value={value}
    >
      {FILTERS.map((filter) => (
        <RadioPrimitive.Root
          className={segmentedControlItemVariants({ size: "sm", state: "checked" })}
          key={filter.value}
          value={filter.value}
        >
          {filter.label}
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  );
}

function SlotCard({
  slot,
  viewer,
  rank,
  selected,
  onSelect,
  onBook,
  usual,
  yes,
}: {
  slot: Slot;
  viewer: Person;
  rank: number;
  selected: boolean;
  onSelect: () => void;
  onBook: () => void;
  usual: "time" | "hour" | null;
  /** Guests who said yes, when this slot is in a poll. */
  yes: string[] | null;
}) {
  const guests = slot.comforts.filter((c) => !c.person.isViewer);
  const comfort = Math.round(slot.score * 100);
  return (
    <Card
      aria-label={`${formatWeekday(slot.start, viewer.timeZone)} ${formatTime(slot.start, viewer.timeZone)}, ${comfort}% comfort`}
      aria-pressed={selected}
      className={cn(
        "cursor-pointer outline-none transition-[border-color,background-color] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring pointer-fine:hover:border-ring/40",
        // Selected: a 2px foreground outline (border + inset ring) and a faint fill,
        // strong enough to read at a glance in both themes.
        selected &&
          "border-foreground bg-accent/60 ring-1 ring-foreground ring-inset pointer-fine:hover:border-foreground",
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <CardHeader className="p-4 pb-3!">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {formatWeekday(slot.start, viewer.timeZone)} {formatTime(slot.start, viewer.timeZone)}
          {rank === 0 && <Badge variant="success">Best</Badge>}
          {selected && (
            <Badge variant="default">
              <CheckIcon aria-hidden="true" />
              Selected
            </Badge>
          )}
          {usual && (
            <Badge variant="info">
              <HistoryIcon aria-hidden="true" />
              Usual {usual}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {formatDay(new Date(slot.start))} · your time
        </CardDescription>
      </CardHeader>
      <CardPanel className="flex flex-col gap-3 px-4 pb-0">
        <Meter max={100} min={0} value={comfort}>
          <div className="flex items-center justify-between gap-2">
            <MeterLabel className="font-normal text-muted-foreground text-xs">Comfort</MeterLabel>
            <MeterValue className="text-xs">{() => `${comfort}%`}</MeterValue>
          </div>
          <MeterTrack className="h-1.5 rounded-full">
            <MeterIndicator
              className={cn(
                comfort >= 80 ? "bg-success" : comfort >= 50 ? "bg-warning" : "bg-destructive",
              )}
            />
          </MeterTrack>
        </Meter>
        <ul className="flex flex-col gap-1 text-xs">
          {guests.map((c) => (
              <li className="flex items-center justify-between gap-2" key={c.person.id}>
                <span className="truncate text-muted-foreground">{firstName(c.person)}</span>
                <span
                  className={cn(
                    "tabular-nums",
                    c.comfort < 1 ? "text-warning-foreground" : "text-foreground",
                  )}
                >
                  {formatTime(slot.start, c.person.timeZone)}
                  {formatWeekday(slot.start, c.person.timeZone) !==
                    formatWeekday(slot.start, viewer.timeZone) && (
                    <span className="text-muted-foreground">
                      {" "}
                      {formatWeekday(slot.start, c.person.timeZone)}
                    </span>
                  )}
                </span>
              </li>
            ))}
        </ul>
        <p className="text-muted-foreground text-xs">{explainSlot(slot)}</p>
        {yes && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="me-1 text-muted-foreground text-xs">Said yes</span>
            {guests.map((c) => (
              <Badge
                className={yes.includes(c.person.id) ? undefined : "opacity-48"}
                key={c.person.id}
                variant={yes.includes(c.person.id) ? "success" : "outline"}
              >
                {firstName(c.person)}
              </Badge>
            ))}
          </div>
        )}
      </CardPanel>
      <CardFooter className="p-4">
        <Button
          className="press-motion w-full"
          onClick={(event) => {
            event.stopPropagation();
            onBook();
          }}
          size="sm"
          variant={rank === 0 ? "default" : "outline"}
        >
          Book this slot
        </Button>
      </CardFooter>
    </Card>
  );
}

export function SlotList({
  slots,
  viewer,
  selectedStart,
  onSelect,
  onBook,
  usualFor,
  yesFor,
}: {
  slots: Slot[];
  viewer: Person;
  selectedStart: number | null;
  onSelect: (slot: Slot) => void;
  onBook: (slot: Slot) => void;
  usualFor: (slot: Slot) => "time" | "hour" | null;
  yesFor: (slot: Slot) => string[] | null;
}) {
  const grid = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {slots.map((slot, i) => (
        <SlotCard
          key={slot.start}
          onBook={() => onBook(slot)}
          onSelect={() => onSelect(slot)}
          rank={i}
          selected={slot.start === selectedStart}
          slot={slot}
          usual={usualFor(slot)}
          viewer={viewer}
          yes={yesFor(slot)}
        />
      ))}
    </div>
  );
  return grid;
}

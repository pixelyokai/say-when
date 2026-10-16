"use client";

import {
  AtSignIcon,
  CalendarIcon,
  ClockIcon,
  HistoryIcon,
  MapPinIcon,
  PhoneIcon,
  PlusIcon,
  SlashIcon,
  UserRoundIcon,
  UsersRoundIcon,
  VideoIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Composer,
  ComposerActionGroup,
  ComposerActions,
  ComposerInput,
  ComposerItem,
  type ComposerItemValue,
  ComposerList,
  ComposerPopup,
  ComposerToken,
  type ComposerTokenPart,
  type ComposerTrigger,
  type ComposerValue,
  useComposerContext,
} from "@/components/ui/composer";
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Group } from "@/lib/groups";
import { firstName, initials, PEOPLE } from "@/lib/schedule";
import {
  SlidingHighlight,
  slidingItemClassName,
  useListElement,
} from "@/components/booker/sliding-highlight";
import { describeHabit, groupLabel, type Habit } from "@/lib/history";
import { dropdownMotion } from "@/lib/motion";
import { addDays, dayKey, formatDay, formatTime, startOfDay } from "@/lib/time";

const DURATIONS = [15, 30, 45, 60, 90];

const TYPES = [
  { id: "video", label: "Video call" },
  { id: "phone", label: "Phone call" },
  { id: "in-person", label: "In person" },
];

export const NEW_GROUP_ACTION = "new-group";

function triggers(now: number, recent: Habit[], saved: Group[]): ComposerTrigger[] {
  return [
    // `#` has no list: it opens the date picker (see onQueryChange).
    { character: "#", items: [], showEmpty: false },
    {
      character: "@",
      items: [
        // Your saved groups first: they're the reason to reach for @.
        ...saved.map((group) => ({
          id: group.id,
          label: group.name,
          description: `Group · ${group.members.length} people`,
          kind: "team",
          // Members travel with the token, so a sentence survives the group being deleted.
          data: group.members.join(","),
        })),
        // Recent mixes, unless one of your groups already covers exactly those people.
        ...recent
          .filter(
            (habit) =>
              !saved.some(
                (g) =>
                  g.members.length === habit.people.length &&
                  g.members.every((id) => habit.people.includes(id)),
              ),
          )
          .map((habit) => ({
          id: habit.people.join("+"),
          label: groupLabel(habit.people),
          description: `Recent · ${describeHabit(habit)}`,
          kind: "group",
        })),
        ...PEOPLE.map((person) => ({
          id: person.id,
          label: firstName(person),
          description: `${person.department} · ${person.city} · ${formatTime(now, person.timeZone)}`,
          kind: "person",
        })),
        {
          id: NEW_GROUP_ACTION,
          label: "New group…",
          description: "Mix people from any team",
          type: "action" as const,
          kind: "new-group",
        },
      ],
    },
    {
      character: "/",
      items: [
        ...DURATIONS.map((minutes) => ({
          id: `${minutes}m`,
          label: minutes < 60 || minutes % 60 ? `${minutes} min` : `${minutes / 60} hour`,
          description: "Duration",
          kind: "duration",
          data: String(minutes),
        })),
        ...TYPES.map((type) => ({
          ...type,
          description: "Meeting type",
          kind: "type",
        })),
        {
          id: "again",
          label: "same as last time",
          description: "Repeat this group's usual meeting",
          kind: "repeat",
        },
        ...Array.from({ length: 14 }, (_, i) => {
          const date = addDays(startOfDay(new Date(now)), i);
          const relative = i === 0 ? "Today" : i === 1 ? "Tomorrow" : null;
          return {
            id: `date-${dayKey(date)}`,
            label: formatDay(date),
            description: relative ? `Date · ${relative}` : "Date",
            kind: "date",
            data: dayKey(date),
          };
        }),
      ],
    },
  ];
}

function tokenIcon(kind: string | undefined, id: string) {
  if (kind === "team" || kind === "group") return <UsersRoundIcon aria-hidden="true" />;
  if (kind === "repeat") return <HistoryIcon aria-hidden="true" />;
  if (kind === "new-group") return <PlusIcon aria-hidden="true" />;
  if (kind === "date") return <CalendarIcon aria-hidden="true" />;
  if (kind === "duration") return <ClockIcon aria-hidden="true" />;
  if (kind === "type") {
    if (id === "phone") return <PhoneIcon aria-hidden="true" />;
    if (id === "in-person") return <MapPinIcon aria-hidden="true" />;
    return <VideoIcon aria-hidden="true" />;
  }
  return <UserRoundIcon aria-hidden="true" />;
}

function SuggestionItem({ item }: { item: ComposerItemValue }) {
  const person = item.kind === "person" ? PEOPLE.find((p) => p.id === item.id) : undefined;
  return (
    <ComposerItem className={slidingItemClassName} value={item}>
      {person ? (
        <Avatar className="size-5 text-[0.625rem]">
          <AvatarFallback>{initials(person)}</AvatarFallback>
        </Avatar>
      ) : (
        <span className="flex size-5 items-center justify-center text-muted-foreground [&_svg]:size-4">
          {tokenIcon(item.kind, item.id)}
        </span>
      )}
      <span className="truncate">{person ? person.name : item.label}</span>
      {item.description && (
        <span className="ms-auto truncate text-muted-foreground text-xs">
          {item.description}
        </span>
      )}
    </ComposerItem>
  );
}

/** Removes the `#` that opened the date picker, wherever the caret left it. */
function withoutHashTrigger(value: ComposerValue): ComposerValue {
  for (let i = value.length - 1; i >= 0; i--) {
    const part = value[i];
    if (part.type !== "text") continue;
    const at = part.text.search(/#(?=\s|$)(?![\s\S]*#(?=\s|$))/);
    if (at === -1) continue;
    const text = part.text.slice(0, at) + part.text.slice(at + 1);
    return [...value.slice(0, i), { type: "text", text }, ...value.slice(i + 1)];
  }
  return value;
}

/** Removes the last occurrence of a typed trigger and its query, e.g. "@new". */
function withoutTypedTrigger(value: ComposerValue, typed: string): ComposerValue {
  for (let i = value.length - 1; i >= 0; i--) {
    const part = value[i];
    if (part.type !== "text") continue;
    const at = part.text.lastIndexOf(typed);
    if (at === -1) continue;
    const text = part.text.slice(0, at) + part.text.slice(at + typed.length);
    return [...value.slice(0, i), { type: "text", text }, ...value.slice(i + 1)];
  }
  return value;
}

/** Back to the sentence with the caret at its end, ready for the next words. */
function focusComposerInput() {
  const input = document.querySelector<HTMLElement>('[data-slot="composer-input"]');
  if (!input) return;
  input.focus();
  // focus() on a contenteditable puts the caret at the start.
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Opens from the Date button, or from typing `#` in the sentence. */
function DateButton({
  open,
  onOpenChange,
  onPick,
  now,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (date: Date) => void;
  now: number;
}) {
  const today = startOfDay(new Date(now));
  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger
        render={<Button aria-label="Pick a date (#)" size="xs" variant="ghost" />}
      >
        <CalendarIcon aria-hidden="true" />
        Date
        <Kbd className="max-sm:hidden">#</Kbd>
      </PopoverTrigger>
      <PopoverPopup
        align="start"
        className={cn("w-auto", dropdownMotion)}
        finalFocus={false}
        side="bottom"
      >
        <Calendar
          autoFocus
          defaultMonth={today}
          disabled={{ before: today }}
          mode="single"
          onSelect={(d?: Date) => d && onPick(d)}
        />
      </PopoverPopup>
    </Popover>
  );
}

function TriggerButtons({ date }: { date: React.ReactNode }) {
  const composer = useComposerContext();
  return (
    <ComposerActionGroup>
      <Button
        aria-label="Add people"
        onClick={() => composer.insertTrigger("@")}
        size="xs"
        variant="ghost"
      >
        <AtSignIcon aria-hidden="true" />
        People
      </Button>
      <Button
        aria-label="Duration, meeting type or date"
        onClick={() => composer.insertTrigger("/")}
        size="xs"
        variant="ghost"
      >
        <SlashIcon aria-hidden="true" />
        Duration
      </Button>
      {date}
    </ComposerActionGroup>
  );
}

export function AskComposer({
  value,
  onValueChange,
  onSubmit,
  now,
  canBook,
  recentGroups,
  savedGroups,
  onPickDate,
  onNewGroup,
}: {
  value: ComposerValue;
  onValueChange: (value: ComposerValue) => void;
  onSubmit: () => void;
  now: number;
  canBook: boolean;
  recentGroups: Habit[];
  savedGroups: Group[];
  onPickDate: (date: Date) => void;
  onNewGroup: () => void;
}) {
  const [list, setList] = useListElement();
  const [dateOpen, setDateOpen] = useState(false);
  const closeDate = (picked?: Date) => {
    setDateOpen(false);
    // Drop the `#` that opened it, then add the date where the sentence ends.
    onValueChange(withoutHashTrigger(value));
    if (picked) onPickDate(picked);
    requestAnimationFrame(focusComposerInput);
  };
  return (
    <Composer
      className="[--composer-max-rows:4]"
      onQueryChange={(query) => {
        if (query?.character === "#" && query.text === "") setDateOpen(true);
      }}
      onAction={(item, query) => {
        if (item.id !== NEW_GROUP_ACTION) return;
        // Take the "@new" the visitor typed back out before opening the editor.
        onValueChange(withoutTypedTrigger(value, query.character + query.text));
        onNewGroup();
      }}
      onSubmit={onSubmit}
      onValueChange={onValueChange}
      submitDisabled={!canBook}
      triggers={triggers(now, recentGroups, savedGroups)}
      value={value}
    >
      <ComposerInput
        aria-label="Describe the meeting"
        autoFocus
        placeholder="30 min with @lena and @priya next week, in the afternoon their time"
        renderToken={(token: ComposerTokenPart) => (
          <ComposerToken icon={tokenIcon(token.kind, token.id)} token={token} variant="chip" />
        )}
      />
      <ComposerPopup className={dropdownMotion}>
        <SlidingHighlight list={list} />
        <ComposerList className="relative" ref={setList}>
          {(item: ComposerItemValue) => <SuggestionItem item={item} key={item.id} />}
        </ComposerList>
      </ComposerPopup>
      <ComposerActions>
        <TriggerButtons
          date={
            <DateButton
              now={now}
              onOpenChange={(open) => (open ? setDateOpen(true) : closeDate())}
              onPick={closeDate}
              open={dateOpen}
            />
          }
        />
        <ComposerActionGroup align="end">
          <span className="hidden items-center gap-1.5 text-muted-foreground text-xs sm:inline-flex">
            <Kbd>↵</Kbd> to book the best slot
            <span aria-hidden="true" className="px-1">
              ·
            </span>
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </span>
        </ComposerActionGroup>
      </ComposerActions>
    </Composer>
  );
}

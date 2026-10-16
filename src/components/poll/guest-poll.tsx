"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MenuSelect } from "@/components/booker/menu-select";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import { readPollHash, recordVote, replyLink } from "@/lib/poll";
import { comfortFor, firstName, initials, PEOPLE, type Person } from "@/lib/schedule";
import { formatDay, formatMinutes, formatTime, formatWeekday } from "@/lib/time";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function GuestPoll() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const parsed = useMemo(() => readPollHash(hash), [hash]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [picks, setPicks] = useState<number[]>([]);
  const [sent, setSent] = useState(false);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  if (!parsed) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-12">
        <Empty className="rounded-2xl border border-dashed">
          <EmptyHeader>
            <EmptyTitle>This link is incomplete</EmptyTitle>
            <EmptyDescription>Ask the organizer to send it again.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );
  }

  const { poll } = parsed;
  const guestId = chosen ?? (parsed.as && poll.guests.includes(parsed.as) ? parsed.as : null);
  const me = PEOPLE.find((p) => p.id === guestId) as Person | undefined;
  const others = poll.guests.filter((id) => id !== guestId).map((id) => PEOPLE.find((p) => p.id === id) as Person);
  const guestItems = poll.guests.map((id) => ({
    value: id,
    label: PEOPLE.find((p) => p.id === id)?.name ?? id,
  }));

  const send = () => {
    if (!me) return;
    recordVote(poll, me.id, picks);
    setSent(true);
  };

  const reply = me ? replyLink(window.location.origin, poll.id, me.id, picks) : "";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 sm:py-12">
      <header className="flex items-center gap-2">
        <h1 className="font-heading font-semibold text-base">Say When</h1>
        <Badge variant="outline">Concept</Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{poll.title}</CardTitle>
          <CardDescription>
            {poll.durationMin} min · pick every time that works for you. Times are shown in your
            own time zone.
          </CardDescription>
        </CardHeader>
        <CardPanel className="flex flex-col gap-5">
          <Field>
            <FieldLabel>Who are you?</FieldLabel>
            <MenuSelect
              aria-label="Who are you?"
              items={guestItems}
              onValueChange={(v) => {
                setChosen(v);
                setSent(false);
              }}
              placeholder="Choose your name"
              value={guestId}
            />
          </Field>

          {me && (
            <ul aria-label="Options" className="flex flex-col gap-2">
              {poll.slots.map((start) => {
                const checked = picks.includes(start);
                const inHours = comfortFor(me, start, poll.durationMin) >= 1;
                const id = `slot-${start}`;
                return (
                  <li key={start}>
                    <Label
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors hover:bg-accent/50",
                        checked && "border-ring/70 bg-accent/50",
                      )}
                      htmlFor={id}
                    >
                      <Checkbox
                        checked={checked}
                        id={id}
                        onCheckedChange={(next) => {
                          setSent(false);
                          setPicks((p) => (next ? [...p, start] : p.filter((s) => s !== start)));
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium tabular-nums">
                          {formatWeekday(start, me.timeZone)} {formatTime(start, me.timeZone)}
                        </span>
                        <span className="block truncate font-normal text-muted-foreground text-xs">
                          {formatDay(new Date(start), me.timeZone)} ·{" "}
                          {others.map((o) => `${firstName(o)} ${formatTime(start, o.timeZone)}`).join(" · ")}
                        </span>
                      </span>
                      {!inHours && <Badge variant="warning">outside your hours</Badge>}
                    </Label>
                  </li>
                );
              })}
            </ul>
          )}
        </CardPanel>
        {me && (
          <CardFooter className="flex-col items-stretch gap-3">
            <div className="flex items-center gap-3">
              <Avatar className="size-7 border border-border">
                <AvatarFallback>{initials(me)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
                {me.city} · works {formatMinutes(me.workStart)}–{formatMinutes(me.workEnd)}
              </span>
              <Button onClick={send}>
                {picks.length === 0 ? "None of these work" : `Send ${picks.length} ${picks.length === 1 ? "time" : "times"}`}
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>

      {sent && me && (
        <Alert className="enter-motion" variant="success">
          <CheckIcon />
          <AlertTitle>Sent, {firstName(me)}</AlertTitle>
          <AlertDescription>
            <span>
              If the organizer has the page open in this browser, your answer is already there.
              Otherwise send them this reply link:
            </span>
            <div className="flex gap-2">
              <Input aria-label="Reply link" readOnly size="sm" value={reply} />
              <Button onClick={() => copyToClipboard(reply)} size="sm" variant="outline">
                {isCopied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
                {isCopied ? "Copied" : "Copy"}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <footer className="mt-auto pt-6 text-muted-foreground text-xs">
        An unofficial concept, not affiliated with Cal.com. Built with coss ui. The people and
        calendars are fictional, and nothing is sent.
      </footer>
    </main>
  );
}

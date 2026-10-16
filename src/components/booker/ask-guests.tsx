"use client";

import { CheckIcon, CopyIcon, ExternalLinkIcon, UsersRoundIcon, XIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";
import { Input } from "@/components/ui/input";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { toastManager } from "@/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import { guestLink, type PollState } from "@/lib/poll";
import { firstName, initials, PEOPLE, type Person } from "@/lib/schedule";
import { formatDay, formatTime } from "@/lib/time";

function guest(id: string): Person {
  return PEOPLE.find((p) => p.id === id) as Person;
}

function LinkRow({ link, person }: { link: string; person: Person }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  return (
    <li className="flex items-center gap-3">
      <Avatar className="size-7 border border-border">
        <AvatarFallback>{initials(person)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          {person.name} <span className="text-muted-foreground">· {person.city}</span>
        </div>
        <Input aria-label={`Link for ${person.name}`} className="mt-1" readOnly size="sm" value={link} />
      </div>
      <div className="flex gap-1 self-end">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={`Copy ${firstName(person)}'s link`}
                onClick={() => copyToClipboard(link)}
                size="icon-sm"
                variant="outline"
              />
            }
          >
            {isCopied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          </TooltipTrigger>
          <TooltipPopup>{isCopied ? "Copied" : "Copy link"}</TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={`Open as ${firstName(person)}`}
                onClick={() => window.open(link, "_blank")}
                size="icon-sm"
                variant="outline"
              />
            }
          >
            <ExternalLinkIcon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipPopup>Open as {firstName(person)} in a new tab</TooltipPopup>
        </Tooltip>
      </div>
    </li>
  );
}

export function AskGuestsDialog({
  state,
  open,
  onOpenChange,
}: {
  state: PollState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Ask the guests</DialogTitle>
          <DialogDescription>
            Each guest gets the same {state.poll.slots.length} options, shown in their own time,
            and taps the ones that work. Answers land below the slots as they come in.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <ul className="flex flex-col gap-4">
            {state.poll.guests.map((id) => (
              <LinkRow key={id} link={guestLink(origin, state.poll, id)} person={guest(id)} />
            ))}
          </ul>
          <p className="mt-5 text-muted-foreground text-xs">
            Concept, no server: answers from other tabs in this browser arrive live. A guest on
            another device sends back a reply link instead.
          </p>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/** Live answers per option, plus who is still to reply. */
export function PollStatus({
  state,
  viewer,
  selectedStart,
  onSelect,
  onShowLinks,
  onClose,
}: {
  state: PollState;
  viewer: Person;
  selectedStart: number | null;
  onSelect: (start: number) => void;
  onShowLinks: () => void;
  onClose: () => void;
}) {
  const { poll, votes } = state;
  const answered = poll.guests.filter((id) => votes[id]);
  const waiting = poll.guests.filter((id) => !votes[id]);
  const yesFor = (start: number) => poll.guests.filter((id) => votes[id]?.includes(start));
  const winner = poll.slots.find((start) => yesFor(start).length === poll.guests.length);

  return (
    <Frame className="enter-motion">
      <FrameHeader className="flex-row flex-wrap items-center gap-x-4 gap-y-2">
        <div className="me-auto">
          <FrameTitle className="flex items-center gap-2">
            <UsersRoundIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            Guest answers
            <Badge variant={answered.length === poll.guests.length ? "success" : "secondary"}>
              {answered.length} of {poll.guests.length}
            </Badge>
          </FrameTitle>
          <FrameDescription>
            {waiting.length
              ? `Waiting for ${waiting.map((id) => firstName(guest(id))).join(", ")}`
              : winner
                ? "Everyone answered. One option works for all of them."
                : "Everyone answered, but no option works for all of them."}
          </FrameDescription>
        </div>
        <div className="flex gap-1">
          <Button onClick={onShowLinks} size="sm" variant="outline">
            Guest links
          </Button>
          <Button aria-label="Close the poll" onClick={onClose} size="icon-sm" variant="ghost">
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      </FrameHeader>
      <FramePanel className="p-2">
        <ul className="flex flex-col">
          {poll.slots.map((start) => {
            const yes = yesFor(start);
            const no = answered.filter((id) => !yes.includes(id));
            const all = yes.length === poll.guests.length;
            return (
              <li key={start}>
                <button
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_8rem_auto] items-center gap-4 rounded-lg px-3 py-2.5 text-start outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                    selectedStart === start && "bg-accent",
                  )}
                  onClick={() => onSelect(start)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-sm tabular-nums">
                      {formatDay(new Date(start))} · {formatTime(start, viewer.timeZone)}
                    </span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {poll.guests
                        .map((id) => `${firstName(guest(id))} ${formatTime(start, guest(id).timeZone)}`)
                        .join(" · ")}
                    </span>
                  </span>
                  <Progress aria-label="Yes answers" max={poll.guests.length} value={yes.length}>
                    <ProgressTrack>
                      <ProgressIndicator className={all ? "bg-success" : undefined} />
                    </ProgressTrack>
                  </Progress>
                  <span className="flex items-center gap-1.5">
                    {yes.map((id) => (
                      <Badge key={id} variant="success">
                        {firstName(guest(id))}
                      </Badge>
                    ))}
                    {no.map((id) => (
                      <Badge className="line-through" key={id} variant="outline">
                        {firstName(guest(id))}
                      </Badge>
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </FramePanel>
    </Frame>
  );
}

export function announceVote(guestId: string): void {
  toastManager.add({ title: `${firstName(guest(guestId))} answered`, type: "info" });
}

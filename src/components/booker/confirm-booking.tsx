"use client";

import { useState } from "react";
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
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toastManager } from "@/components/ui/toast";
import { MenuSelect } from "@/components/booker/menu-select";
import { PersonAvatar } from "@/components/booker/person-avatar";
import { useIsMobile } from "@/hooks/use-media-query";
import { firstName, type Person, type Slot } from "@/lib/schedule";
import { formatDay, formatTime, formatWeekday } from "@/lib/time";

const LOCATIONS = [
  { value: "cal-video", label: "Cal Video" },
  { value: "google-meet", label: "Google Meet" },
  { value: "phone", label: "Phone call" },
  { value: "in-person", label: "In person" },
];

const DURATIONS = [15, 30, 45, 60, 90].map((m) => ({
  value: String(m),
  label: m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : `${m / 60} hours`,
}));

function defaultLocation(meetingType: string | null): string {
  if (meetingType === "Phone call") return "phone";
  if (meetingType === "In person") return "in-person";
  return "cal-video";
}

function BookingForm({
  slot,
  now,
  duration,
  onDurationChange,
  location,
  onLocationChange,
  title,
  onTitleChange,
  sendInvites,
  onSendInvitesChange,
}: {
  slot: Slot;
  now: number;
  duration: string;
  onDurationChange: (value: string) => void;
  location: string;
  onLocationChange: (value: string) => void;
  title: string;
  onTitleChange: (value: string) => void;
  sendInvites: boolean;
  onSendInvitesChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-2">
        {slot.comforts.map(({ person }) => (
          <li className="flex items-center gap-3" key={person.id}>
            <PersonAvatar className="size-7" now={now} person={person} />
            <span className="min-w-0 flex-1 truncate text-sm">
              {person.isViewer ? "You" : person.name}
              <span className="text-muted-foreground"> · {person.city}</span>
            </span>
            <span className="text-sm tabular-nums">
              {formatWeekday(slot.start, person.timeZone)} {formatTime(slot.start, person.timeZone)}
            </span>
          </li>
        ))}
      </ul>
      <Separator />
      <Fieldset className="flex flex-col gap-4">
        <FieldsetLegend className="sr-only">Meeting details</FieldsetLegend>
        <Field>
          <FieldLabel>Title</FieldLabel>
          <Input onChange={(e) => onTitleChange(e.target.value)} value={title} />
        </Field>
        <div className="grid w-full grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Duration</FieldLabel>
            <MenuSelect items={DURATIONS} onValueChange={onDurationChange} value={duration} />
          </Field>
          <Field>
            <FieldLabel>Location</FieldLabel>
            <MenuSelect items={LOCATIONS} onValueChange={onLocationChange} value={location} />
          </Field>
        </div>
        <Field className="flex-row items-center justify-between">
          <FieldLabel>Send calendar invites</FieldLabel>
          <Switch checked={sendInvites} onCheckedChange={onSendInvitesChange} />
        </Field>
      </Fieldset>
      <p className="text-muted-foreground text-xs">
        Concept only: nothing is sent and no calendar is touched.
      </p>
    </div>
  );
}

export function ConfirmBooking({
  slot,
  viewer,
  now,
  meetingType,
  durationMin,
  onOpenChange,
  onBooked,
}: {
  slot: Slot | null;
  viewer: Person;
  now: number;
  meetingType: string | null;
  durationMin: number;
  onOpenChange: (open: boolean) => void;
  /** The meeting as confirmed: the dialog can change its length and type. */
  onBooked: (details: { durationMin: number; meetingType: string | null }) => void;
}) {
  const isMobile = useIsMobile();
  const [duration, setDuration] = useState(String(durationMin));
  const [location, setLocation] = useState(defaultLocation(meetingType));
  const [sendInvites, setSendInvites] = useState(true);
  const guests = slot?.comforts.filter((c) => !c.person.isViewer).map((c) => c.person) ?? [];
  const [title, setTitle] = useState(
    `Sync with ${guests.map(firstName).join(", ")}`,
  );

  if (!slot) return null;

  const when = `${formatDay(new Date(slot.start))}, ${formatTime(slot.start, viewer.timeZone)} your time`;
  const confirm = () => {
    onOpenChange(false);
    onBooked({
      durationMin: Number(duration),
      meetingType: LOCATIONS.find((l) => l.value === location)?.label ?? meetingType,
    });
    toastManager.add({
      title: `Sent to ${guests.length} ${guests.length === 1 ? "person" : "people"}`,
      description: sendInvites
        ? `${title} · ${when}. Calendar invites are on the way (not really, it's a concept).`
        : `${title} · ${when}.`,
      type: "success",
    });
  };

  const form = (
    <BookingForm
      duration={duration}
      location={location}
      now={now}
      onDurationChange={setDuration}
      onLocationChange={setLocation}
      onSendInvitesChange={setSendInvites}
      onTitleChange={setTitle}
      sendInvites={sendInvites}
      slot={slot}
      title={title}
    />
  );

  if (isMobile) {
    return (
      <Drawer onOpenChange={onOpenChange} open>
        <DrawerPopup showBar>
          <DrawerHeader>
            <DrawerTitle>Confirm meeting</DrawerTitle>
            <DrawerDescription>{when}</DrawerDescription>
          </DrawerHeader>
          <DrawerPanel>{form}</DrawerPanel>
          <DrawerFooter>
            <DrawerClose render={<Button variant="ghost" />}>Cancel</DrawerClose>
            <Button className="press-motion" onClick={confirm}>Confirm and send</Button>
          </DrawerFooter>
        </DrawerPopup>
      </Drawer>
    );
  }

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Confirm meeting</DialogTitle>
          <DialogDescription>{when}</DialogDescription>
        </DialogHeader>
        <DialogPanel>{form}</DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button className="press-motion" onClick={confirm}>Confirm and send</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

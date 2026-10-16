"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { initials, type Person } from "@/lib/schedule";
import { formatMinutes, formatTime } from "@/lib/time";

/** Avatar whose tooltip shows the person's local time right now. */
export function PersonAvatar({
  person,
  now,
  className,
}: {
  person: Person;
  now: number;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Avatar className={cn("border border-border", className)}>
            <AvatarFallback>{person.isViewer ? "You" : initials(person)}</AvatarFallback>
          </Avatar>
        }
      />
      <TooltipPopup>
        <span className="font-medium">{formatTime(now, person.timeZone)}</span>{" "}
        <span className="text-muted-foreground">
          in {person.city} · works {formatMinutes(person.workStart)}–
          {formatMinutes(person.workEnd)}
        </span>
      </TooltipPopup>
    </Tooltip>
  );
}

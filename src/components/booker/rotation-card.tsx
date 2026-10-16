"use client";

import { RepeatIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import { Meter, MeterIndicator, MeterTrack } from "@/components/ui/meter";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Series } from "@/lib/rotation";
import { comfortFor, firstName, type Person } from "@/lib/schedule";
import { formatDay, formatTime } from "@/lib/time";

function pct(value: number): number {
  return Math.round(value * 100);
}

function tone(value: number): string {
  return value >= 0.8 ? "bg-success" : value >= 0.5 ? "bg-warning" : "bg-destructive";
}

/** "Negotiate": share the early and late calls instead of one person always paying. */
export function RotationCard({
  series,
  viewer,
  durationMin,
  onBook,
}: {
  series: Series;
  viewer: Person;
  durationMin: number;
  onBook: () => void;
}) {
  const guests = series.shares.filter((s) => !s.person.isViewer);
  const helped = [...guests].sort(
    (a, b) => b.fixedBad - b.rotatingBad - (a.fixedBad - a.rotatingBad),
  )[0];
  return (
    <Card className="enter-motion">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RepeatIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          Take turns instead
        </CardTitle>
        <CardDescription>
          With one fixed time, {firstName(helped.person)} is outside their hours{" "}
          {helped.fixedBad === series.weeks ? "every week" : `${helped.fixedBad} of ${series.weeks} weeks`}.
          Alternating between {series.templates.length} times shares the early and late calls, so
          that drops to {helped.rotatingBad} of {series.weeks}.
        </CardDescription>
        <CardAction>
          <Badge variant="success">Fairer</Badge>
        </CardAction>
      </CardHeader>
      <CardPanel className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ol className="flex flex-col gap-2" aria-label="Weekly series">
          {series.starts.map((start, week) => {
            const stretched = series.shares
              .map((s) => ({ person: s.person, comfort: comfortFor(s.person, start, durationMin) }))
              .filter((c) => c.comfort < 1 && !c.person.isViewer);
            return (
              <li className="flex items-center gap-3 text-sm" key={start}>
                <span className="w-14 shrink-0 text-muted-foreground text-xs">Week {week + 1}</span>
                <span className="min-w-0 flex-1 tabular-nums">
                  {formatDay(new Date(start))} · {formatTime(start, viewer.timeZone)}
                </span>
                <span className="flex flex-wrap justify-end gap-1">
                  {stretched.length === 0 ? (
                    <Badge variant="success">all in hours</Badge>
                  ) : (
                    stretched.map((c) => (
                      <Badge key={c.person.id} variant="warning">
                        {firstName(c.person)} {formatTime(start, c.person.timeZone)}
                      </Badge>
                    ))
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[5rem_minmax(0,1fr)_7rem] gap-3 text-muted-foreground text-xs">
            <span />
            <span>Average comfort</span>
            <span className="text-end">Weeks out of hours</span>
          </div>
          <Separator />
          {[...guests, ...series.shares.filter((s) => s.person.isViewer)].map((share) => (
            <div className="grid grid-cols-[5rem_minmax(0,1fr)_7rem] items-center gap-3" key={share.person.id}>
              <span className="truncate text-sm">
                {share.person.isViewer ? "You" : firstName(share.person)}
              </span>
              <Meter aria-label={`${share.person.name} average comfort`} max={100} min={0} value={pct(share.rotating)}>
                <MeterTrack className="h-1.5 rounded-full">
                  <MeterIndicator className={tone(share.rotating)} />
                </MeterTrack>
              </Meter>
              <span
                className={cn(
                  "text-end text-xs tabular-nums",
                  share.rotatingBad < share.fixedBad
                    ? "text-success-foreground"
                    : share.rotatingBad > share.fixedBad
                      ? "text-warning-foreground"
                      : "text-muted-foreground",
                )}
              >
                {share.fixedBad} → {share.rotatingBad} of {series.weeks}
              </span>
            </div>
          ))}
        </div>
      </CardPanel>
      <CardFooter className="justify-end gap-2">
        <Button className="press-motion" onClick={onBook}>Book the {series.starts.length}-week series</Button>
      </CardFooter>
    </Card>
  );
}

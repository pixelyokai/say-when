"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// The poll lives in the URL hash and times depend on the visitor's zone: client only.
export const GuestPollLoader = dynamic(
  () => import("@/components/poll/guest-poll").then((m) => m.GuestPoll),
  {
    ssr: false,
    loading: () => (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 sm:py-12">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </main>
    ),
  },
);

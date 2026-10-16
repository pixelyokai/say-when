"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Everything depends on the visitor's clock and time zone, so it renders on the client only.
export const BookerLoader = dynamic(
  () => import("@/components/booker/booker").then((m) => m.Booker),
  {
    ssr: false,
    loading: () => (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </main>
    ),
  },
);

import type { Metadata } from "next";
import { GuestPollLoader } from "@/components/poll/guest-poll-loader";

export const metadata: Metadata = {
  title: "Pick a time · Book in one sentence",
};

export default function PollPage() {
  return <GuestPollLoader />;
}

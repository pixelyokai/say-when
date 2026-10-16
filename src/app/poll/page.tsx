import type { Metadata } from "next";
import { GuestPollLoader } from "@/components/poll/guest-poll-loader";

export const metadata: Metadata = {
  title: "Pick a time · Say When",
};

export default function PollPage() {
  return <GuestPollLoader />;
}

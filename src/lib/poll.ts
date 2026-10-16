/**
 * "Ask the guests": a shortlist each guest answers in their own time zone.
 *
 * There is no server. The poll travels inside the link itself, answers come
 * back live from other tabs in the same browser (BroadcastChannel + storage),
 * and from other devices as a reply link the guest sends back.
 */

export type Poll = {
  id: string;
  title: string;
  durationMin: number;
  guests: string[];
  /** Slot starts, epoch ms. */
  slots: number[];
  organizerTz: string;
};

/** Guest id → the slot starts they said yes to. */
export type Votes = Record<string, number[]>;

export type PollState = { poll: Poll; votes: Votes };

const ACTIVE = "book-in-one-sentence:poll:active";
const pollKey = (id: string) => `book-in-one-sentence:poll:${id}`;
const CHANNEL = "book-in-one-sentence:polls";

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function newPollId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function guestLink(origin: string, poll: Poll, guest: string): string {
  return `${origin}/poll#p=${toBase64Url(JSON.stringify(poll))}&as=${guest}`;
}

export function replyLink(origin: string, pollId: string, guest: string, picks: number[]): string {
  return `${origin}/#reply=${toBase64Url(JSON.stringify({ pollId, guest, picks }))}`;
}

export function readPollHash(hash: string): { poll: Poll; as: string | null } | null {
  try {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const p = params.get("p");
    if (!p) return null;
    const poll = JSON.parse(fromBase64Url(p)) as Poll;
    if (!poll.id || !Array.isArray(poll.slots) || !Array.isArray(poll.guests)) return null;
    return { poll, as: params.get("as") };
  } catch {
    return null;
  }
}

export function readReplyHash(
  hash: string,
): { pollId: string; guest: string; picks: number[] } | null {
  try {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const r = params.get("reply");
    if (!r) return null;
    const reply = JSON.parse(fromBase64Url(r));
    if (typeof reply.pollId !== "string" || !Array.isArray(reply.picks)) return null;
    return reply;
  } catch {
    return null;
  }
}

function read(id: string): PollState | null {
  try {
    const raw = localStorage.getItem(pollKey(id));
    return raw ? (JSON.parse(raw) as PollState) : null;
  } catch {
    return null;
  }
}

function write(state: PollState): void {
  try {
    localStorage.setItem(pollKey(state.poll.id), JSON.stringify(state));
  } catch {
    // Storage blocked: live tab sync still works through the channel.
  }
}

export function loadActivePoll(): PollState | null {
  try {
    const id = localStorage.getItem(ACTIVE);
    return id ? read(id) : null;
  } catch {
    return null;
  }
}

export function startPoll(poll: Poll): PollState {
  const state = { poll, votes: {} };
  write(state);
  try {
    localStorage.setItem(ACTIVE, poll.id);
  } catch {}
  return state;
}

export function closePoll(): void {
  try {
    localStorage.removeItem(ACTIVE);
  } catch {}
}

/** Records a guest's answer and tells every open tab. */
export function recordVote(poll: Poll, guest: string, picks: number[]): PollState {
  const current = read(poll.id) ?? { poll, votes: {} };
  const next = { ...current, votes: { ...current.votes, [guest]: picks } };
  write(next);
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ type: "vote", pollId: poll.id, guest, picks });
    channel.close();
  } catch {}
  return next;
}

/** Merges a reply that came back as a link. Returns null if the poll isn't known here. */
export function mergeReply(reply: { pollId: string; guest: string; picks: number[] }): PollState | null {
  const current = read(reply.pollId);
  if (!current) return null;
  const next = { ...current, votes: { ...current.votes, [reply.guest]: reply.picks } };
  write(next);
  return next;
}

/** Calls back whenever a guest answers in another tab. */
export function subscribeToVotes(pollId: string, onChange: (state: PollState) => void): () => void {
  let channel: BroadcastChannel | null = null;
  const refresh = () => {
    const state = read(pollId);
    if (state) onChange(state);
  };
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => {
      if (event.data?.pollId === pollId) {
        const state = read(pollId);
        // The storage write can land after the message in some browsers.
        if (state) onChange({ ...state, votes: { ...state.votes, [event.data.guest]: event.data.picks } });
      }
    };
  } catch {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === pollKey(pollId)) refresh();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    channel?.close();
    window.removeEventListener("storage", onStorage);
  };
}

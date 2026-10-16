import data from "@/data/people.json";
import { PEOPLE } from "@/lib/schedule";

/** A named mix of people, made by the visitor. Mentioned as `@<slug>`. */
export type Group = { id: string; name: string; members: string[] };

const KEY = "book-in-one-sentence:groups:v1";

export const STARTER_GROUPS: Group[] = data.starterGroups;

/** "Launch crew" → "launch-crew": what you type after @. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clean(groups: Group[]): Group[] {
  // Drop people that no longer exist, and groups left empty.
  return groups
    .map((g) => ({ ...g, members: g.members.filter((id) => PEOPLE.some((p) => p.id === id)) }))
    .filter((g) => g.id && g.name && g.members.length > 0);
}

export function loadGroups(): Group[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? STARTER_GROUPS : clean(JSON.parse(raw));
  } catch {
    return STARTER_GROUPS;
  }
}

function save(groups: Group[]): Group[] {
  try {
    localStorage.setItem(KEY, JSON.stringify(groups));
  } catch {
    // Blocked storage: the change lasts for this visit only.
  }
  return groups;
}

export type GroupDraft = { name: string; members: string[] };

/** Problems with a draft, by field. Empty when it can be saved. */
export function validateGroup(
  draft: GroupDraft,
  groups: Group[],
  editingId: string | null,
): { name?: string; members?: string } {
  const errors: { name?: string; members?: string } = {};
  const name = draft.name.trim();
  const slug = slugify(name);
  if (!name) errors.name = "Give the group a name.";
  else if (!slug) errors.name = "Use at least one letter or number.";
  else if (PEOPLE.some((p) => p.id === slug))
    errors.name = "That's someone's name. Pick another so @ stays clear.";
  else if (
    groups.some((g) => g.id !== editingId && g.name.trim().toLowerCase() === name.toLowerCase())
  )
    errors.name = "You already have a group with that name.";
  if (draft.members.length < 2) errors.members = "Pick at least two people.";
  return errors;
}

/** A new id from the name, made unique. Ids never change, so a rename keeps old sentences working. */
function newId(name: string, groups: Group[]): string {
  const base = slugify(name);
  let id = base;
  for (let n = 2; groups.some((g) => g.id === id); n++) id = `${base}-${n}`;
  return id;
}

export function createGroup(groups: Group[], draft: GroupDraft): Group[] {
  const group = { id: newId(draft.name, groups), name: draft.name.trim(), members: draft.members };
  return save([...groups, group]);
}

export function updateGroup(groups: Group[], id: string, draft: GroupDraft): Group[] {
  return save(
    groups.map((g) => (g.id === id ? { ...g, name: draft.name.trim(), members: draft.members } : g)),
  );
}

export function deleteGroup(groups: Group[], id: string): Group[] {
  return save(groups.filter((g) => g.id !== id));
}

/** Calls back when groups change in another tab. */
export function subscribeToGroups(onChange: (groups: Group[]) => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) onChange(loadGroups());
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

export function membersOf(group: Group) {
  return group.members
    .map((id) => PEOPLE.find((p) => p.id === id))
    .filter((p) => p !== undefined);
}

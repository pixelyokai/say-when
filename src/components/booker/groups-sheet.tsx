"use client";

import {
  ArrowLeftIcon,
  CalendarPlusIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UsersRoundIcon,
} from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckboxGroup } from "@/components/ui/checkbox-group";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "@/components/ui/sheet";
import { toastManager } from "@/components/ui/toast";
import {
  SlidingHighlight,
  slidingItemClassName,
  useListElement,
} from "@/components/booker/sliding-highlight";
import { cn } from "@/lib/utils";
import {
  createGroup,
  deleteGroup,
  type Group,
  type GroupDraft,
  membersOf,
  slugify,
  updateGroup,
  validateGroup,
} from "@/lib/groups";
import { afterGesture } from "@/lib/after-gesture";
import { dropdownMotion } from "@/lib/motion";
import { DEPARTMENTS, initials, PEOPLE, type Person } from "@/lib/schedule";
import { formatTime } from "@/lib/time";

export type GroupsView = { mode: "list" } | { mode: "edit"; id: string | null };

function AvatarStack({ people }: { people: Person[] }) {
  const shown = people.slice(0, 5);
  return (
    <div className="flex -space-x-1">
      {shown.map((person) => (
        <Avatar
          className="size-6 text-[0.5625rem] tracking-tight ring-2 ring-background"
          key={person.id}
        >
          <AvatarFallback>{initials(person)}</AvatarFallback>
        </Avatar>
      ))}
      {people.length > shown.length && (
        <Avatar className="size-6 text-[0.5625rem] ring-2 ring-background">
          <AvatarFallback>+{people.length - shown.length}</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

function departmentsOf(people: Person[]): string[] {
  return DEPARTMENTS.filter((d) => people.some((p) => p.department === d));
}

function GroupRow({
  group,
  onSchedule,
  onEdit,
  onDelete,
}: {
  group: Group;
  onSchedule: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const people = membersOf(group);
  const [list, setList] = useListElement();
  return (
    <li className="flex items-center gap-3 rounded-xl border px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-sm">{group.name}</span>
          <Kbd>@{group.id}</Kbd>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <AvatarStack people={people} />
          <span className="text-muted-foreground text-xs">{people.length} people</span>
          {departmentsOf(people).map((d) => (
            <Badge key={d} variant="outline">
              {d}
            </Badge>
          ))}
        </div>
      </div>
      <Button className="press-motion" onClick={onSchedule} size="sm" variant="outline">
        <CalendarPlusIcon aria-hidden="true" />
        Schedule
      </Button>
      <Menu>
        <MenuTrigger
          render={<Button aria-label={`More for ${group.name}`} size="icon-sm" variant="ghost" />}
        >
          <EllipsisIcon aria-hidden="true" />
        </MenuTrigger>
        <MenuPopup align="end" className={dropdownMotion}>
          <div className="relative" ref={setList}>
            <SlidingHighlight list={list} />
            <MenuItem className={slidingItemClassName} onClick={onEdit}>
              <PencilIcon aria-hidden="true" />
              Edit
            </MenuItem>
            <MenuSeparator />
            <MenuItem className={slidingItemClassName} onClick={onDelete} variant="destructive">
              <Trash2Icon aria-hidden="true" />
              Delete
            </MenuItem>
          </div>
        </MenuPopup>
      </Menu>
    </li>
  );
}

/** People picker: one block per department, each with a select-all parent checkbox. */
function MemberPicker({
  selected,
  onChange,
  now,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  now: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      {DEPARTMENTS.map((department) => {
        const people = PEOPLE.filter((p) => p.department === department);
        const ids = people.map((p) => p.id);
        const chosen = selected.filter((id) => ids.includes(id));
        return (
          <CheckboxGroup
            aria-labelledby={`dept-${slugify(department)}`}
            allValues={ids}
            className="w-full gap-1"
            key={department}
            onValueChange={(value: string[]) =>
              onChange([...selected.filter((id) => !ids.includes(id)), ...value])
            }
            value={chosen}
          >
            <Label
              className="flex w-full items-center gap-2 px-2 py-1.5"
              id={`dept-${slugify(department)}`}
            >
              <Checkbox parent />
              <span className="flex-1">{department}</span>
              <span className="font-normal text-muted-foreground text-xs tabular-nums">
                {chosen.length}/{ids.length}
              </span>
            </Label>
            {people.map((person) => (
              <Label
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 font-normal transition-colors duration-150 pointer-fine:hover:bg-accent/60",
                  chosen.includes(person.id) && "bg-accent/40",
                )}
                key={person.id}
              >
                <span className="w-4" />
                <Checkbox value={person.id} />
                <Avatar className="size-7 border border-border">
                  <AvatarFallback>{initials(person)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sm">{person.name}</span>
                  <span className="block truncate text-muted-foreground text-xs">{person.email}</span>
                </span>
                <span className="text-end text-muted-foreground text-xs">
                  <span className="block">{person.city}</span>
                  <span className="block tabular-nums">{formatTime(now, person.timeZone)}</span>
                </span>
              </Label>
            ))}
          </CheckboxGroup>
        );
      })}
    </div>
  );
}

function GroupEditor({
  group,
  groups,
  now,
  onCancel,
  onSaved,
}: {
  group: Group | null;
  groups: Group[];
  now: number;
  onCancel: () => void;
  onSaved: (groups: Group[], saved: GroupDraft) => void;
}) {
  const [draft, setDraft] = useState<GroupDraft>(
    group ? { name: group.name, members: group.members } : { name: "", members: [] },
  );
  const [tried, setTried] = useState(false);
  const errors = validateGroup(draft, groups, group?.id ?? null);
  const shownErrors = tried ? errors : {};
  const mention = group?.id ?? slugify(draft.name);

  const submit = () => {
    setTried(true);
    if (errors.name || errors.members) return;
    const next = group ? updateGroup(groups, group.id, draft) : createGroup(groups, draft);
    onSaved(next, draft);
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <SheetHeader>
        <Button
          className="-ms-2 mb-1 w-fit"
          onClick={onCancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ArrowLeftIcon aria-hidden="true" />
          Groups
        </Button>
        <SheetTitle>{group ? `Edit ${group.name}` : "New group"}</SheetTitle>
        <SheetDescription>
          Mix people from any team. You can @mention the group in your sentence.
        </SheetDescription>
      </SheetHeader>
      <SheetPanel className="flex flex-col gap-6">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input
            aria-invalid={shownErrors.name ? true : undefined}
            autoFocus
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Launch crew"
            value={draft.name}
          />
          {shownErrors.name ? (
            <p className="text-destructive-foreground text-xs" role="alert">
              {shownErrors.name}
            </p>
          ) : (
            <FieldDescription>
              {mention ? (
                <>
                  Mention it as <Kbd>@{mention}</Kbd>
                </>
              ) : (
                "You'll mention it with @ and this name."
              )}
            </FieldDescription>
          )}
        </Field>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="font-medium text-sm">People</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {draft.members.length} selected
            </span>
          </div>
          {shownErrors.members && (
            <p className="text-destructive-foreground text-xs" role="alert">
              {shownErrors.members}
            </p>
          )}
          <MemberPicker
            now={now}
            onChange={(members) => setDraft((d) => ({ ...d, members }))}
            selected={draft.members}
          />
        </div>
      </SheetPanel>
      <SheetFooter>
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button className="press-motion" type="submit">
          {group ? "Save changes" : "Create group"}
        </Button>
      </SheetFooter>
    </form>
  );
}

export function GroupsSheet({
  open,
  onOpenChange,
  view,
  onViewChange,
  groups,
  onGroupsChange,
  onSchedule,
  now,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: GroupsView;
  onViewChange: (view: GroupsView) => void;
  groups: Group[];
  onGroupsChange: (groups: Group[]) => void;
  onSchedule: (group: Group) => void;
  now: number;
}) {
  const [deleting, setDeleting] = useState<Group | null>(null);
  const editing = view.mode === "edit" ? (groups.find((g) => g.id === view.id) ?? null) : null;

  return (
    <>
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetPopup className="sm:max-w-md">
          {view.mode === "edit" ? (
            <GroupEditor
              group={editing}
              groups={groups}
              key={view.id ?? "new"}
              now={now}
              onCancel={() => onViewChange({ mode: "list" })}
              onSaved={(next, saved) => {
                onGroupsChange(next);
                onViewChange({ mode: "list" });
                toastManager.add({
                  title: editing ? `${saved.name.trim()} updated` : `${saved.name.trim()} created`,
                  description: `${saved.members.length} people. Type @ in the sentence to use it.`,
                  type: "success",
                });
              }}
            />
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>Groups</SheetTitle>
                <SheetDescription>
                  Save a mix of people once, then book with all of them by typing <Kbd>@</Kbd> and
                  the group&apos;s name.
                </SheetDescription>
              </SheetHeader>
              <SheetPanel>
                {groups.length === 0 ? (
                  <Empty className="rounded-2xl border border-dashed md:py-12">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <UsersRoundIcon />
                      </EmptyMedia>
                      <EmptyTitle className="text-base">No groups yet</EmptyTitle>
                      <EmptyDescription>
                        Pick people from Marketing, Engineering, Product and Customer care, and
                        give the mix a name.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button onClick={() => onViewChange({ mode: "edit", id: null })}>
                        <PlusIcon aria-hidden="true" />
                        New group
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {groups.map((group) => (
                      <GroupRow
                        group={group}
                        key={group.id}
                        onDelete={() => afterGesture(() => setDeleting(group))}
                        onEdit={() => onViewChange({ mode: "edit", id: group.id })}
                        onSchedule={() => onSchedule(group)}
                      />
                    ))}
                  </ul>
                )}
              </SheetPanel>
              {groups.length > 0 && (
                <SheetFooter>
                  <Button
                    className="press-motion"
                    onClick={() => onViewChange({ mode: "edit", id: null })}
                  >
                    <PlusIcon aria-hidden="true" />
                    New group
                  </Button>
                </SheetFooter>
              )}
            </>
          )}
        </SheetPopup>
      </Sheet>

      <AlertDialog onOpenChange={(o) => !o && setDeleting(null)} open={deleting !== null}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The people stay, only the group goes. Sentences that already mention it keep working
              until you change them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button
              onClick={() => {
                if (!deleting) return;
                onGroupsChange(deleteGroup(groups, deleting.id));
                toastManager.add({ title: `${deleting.name} deleted`, type: "success" });
                setDeleting(null);
              }}
              variant="destructive"
            >
              Delete group
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}

import { parseAsk } from "@/lib/parse";
import { findSlots, makeViewer, PEOPLE, resolveDays, slotLabel } from "@/lib/schedule";
import { proposeRotation } from "@/lib/rotation";
import { habitFor, recentGroups, describeHabit, groupLabel, loadHistory } from "@/lib/history";


const viewer = makeViewer("Asia/Kolkata");
const now = Date.now();
const text = (t: string) => [{ type: "text" as const, text: t }];

const history = loadHistory(now);
console.log("recent groups:", recentGroups(history).map((g) => `${groupLabel(g.people)} · ${g.durationMin}m · ${describeHabit(g)}`));
console.log("habit lena+priya:", habitFor(["lena", "priya"], history) && describeHabit(habitFor(["lena", "priya"], history)!));
console.log("parse repeat:", parseAsk(text("with lena and priya same as last time")).repeat, parseAsk(text("again with marcus")).repeat);

for (const s of ["lena marcus priya oliver next week", "marcus and oliver next week", "lena and oliver next week 45 min", "marcus priya lena next week"]) {
  const p = parseAsk(text(s));
  const ask = { people: [viewer, ...p.people.map((id) => PEOPLE.find((x) => x.id === id)!)], durationMin: p.durationMin ?? 30, window: null, timezone: "mine" as const };
  const days = resolveDays(p.days, new Date(now));
  const best = findSlots(ask, days, viewer, now)[0];
  const t0 = performance.now();
  const series = proposeRotation(ask, days, viewer, now);
  console.log(`\n> ${s}  (best fixed ${best ? Math.round(best.score * 100) + "%" : "none"}, rotation in ${(performance.now() - t0).toFixed(0)}ms)`);
  if (!series) { console.log("  no rotation offered"); continue; }
  console.log(`  alternates: ${series.templates.map((t) => slotLabel(t, viewer.timeZone)).join(" / ")}`);
  console.log(`  worst bad weeks ${series.fixedWorstBad} -> ${series.worstBad} of ${series.weeks}`);
  for (const sh of series.shares) console.log(`   ${sh.person.name.padEnd(14)} bad ${sh.fixedBad}->${sh.rotatingBad}  avg ${Math.round(sh.fixed * 100)}% -> ${Math.round(sh.rotating * 100)}%`);
}

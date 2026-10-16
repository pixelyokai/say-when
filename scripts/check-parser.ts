import { parseAsk } from "@/lib/parse";
import { findSlots, makeViewer, PEOPLE, pickDistinct, resolveDays, explainSlot, slotLabel, suggestFix } from "@/lib/schedule";

const text = (t: string) => [{ type: "text" as const, text: t }];
const sentences = [
  "30 min with lena and priya next week, afternoons their time",
  "1 hour with marcus tomorrow",
  "quick call with oliver on thursday mornings their time",
  "45m with the design team this week",
  "half an hour with Priya, Marcus and Lena after lunch my time",
  "coffee with lena friday",
  "2h workshop with everyone: lena marcus priya oliver next week",
  "meet marcus and oliver sometime next week evenings their time",
  "15 minutes with priya today",
  "asdf qwerty lena",
  "lena tuesday at 3pm",
  "30 min with priya and lena next week at 4:30 pm",
  "marcus tomorrow after 5pm",
  "call lena before noon friday",
  "oliver at 9am oliver's time next week",
  "priya and marcus at 21:00",
  "lena on oct 24 at 3pm",
  "30 min with priya 24th october",
  "marcus 24/10",
  "lena and oliver on the 28th",
  "priya 2026-11-03 afternoon",
];
const viewer = makeViewer("Asia/Kolkata");
const now = Date.now();
for (const s of sentences) {
  const p = parseAsk(text(s));
  const ask = {
    people: [viewer, ...p.people.map((id) => PEOPLE.find((x) => x.id === id)!)],
    durationMin: p.durationMin ?? 30,
    window: p.window,
    timezone: p.timezone ?? "mine",
    time: p.time ? { ...p.time, timeZone: PEOPLE.find((x) => x.id === p.timeOf)?.timeZone ?? viewer.timeZone } : null,
  } as const;
  const days = resolveDays(p.days, new Date(now), p.date);
  const t0 = performance.now();
  const slots = findSlots({ ...ask, people: [...ask.people] }, days, viewer, now);
  const ms = (performance.now() - t0).toFixed(1);
  const best = pickDistinct(slots, 3);
  console.log(`\n> ${s}\n  ${JSON.stringify(p)}\n  ${slots.length} slots in ${ms}ms`);
  for (const b of best) console.log(`  - ${slotLabel(b, viewer.timeZone)} ${Math.round(b.score * 100)}% · ${explainSlot(b)}`);
  if (!best.length || best[0].score < 0.5) {
    const fix = suggestFix({ ...ask, people: [...ask.people] }, days, viewer, now);
    console.log(`  fix: ${fix?.message ?? "none"}`);
  }
}

// Chat con il coach (testo o voce già trascritta).
import { userFrom } from "../lib/auth.mjs";
import { getJSON, K } from "../lib/db.mjs";
import { json, fail, body, siteUrl } from "../lib/http.mjs";
import { nowParts } from "../lib/time.mjs";
import { coachReply } from "../lib/coach.mjs";
import { defaultPlan, defaultProfile, itemsForDate } from "../lib/plan.mjs";
import { startJob } from "../lib/jobs.mjs";
import { snapshot } from "../lib/snapshot.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail("Metodo non permesso", 405);
  const uid = await userFrom(req);
  if (!uid) return fail("Non autenticato", 401);
  const b = await body(req);
  try {
    let activity = null;
    if (b.activityId) {
      const [profile, plan] = await Promise.all([getJSON(K.profile(uid), defaultProfile), getJSON(K.plan(uid), defaultPlan)]);
      const date = b.date || nowParts(profile.tz).date;
      const it = itemsForDate(plan, date).find((i) => i.id === b.activityId);
      if (it) {
        activity = { title: it.title, category: it.category };
        if (it.workoutId) {
          const w = plan.workouts.find((x) => x.id === it.workoutId);
          if (w) activity.extra = `Scheda di oggi "${w.name}": ${w.exercises.map((e) => `${e.name} ${e.sets}x${e.reps}${e.weight ? " " + e.weight : ""}${e.rest ? " rec " + e.rest : ""}`).join("; ")}.`;
        }
        if (it.language) activity.extra = `Pratica di lingua: ${it.language}. Fai conversazione in quella lingua al suo livello e correggi.`;
      }
    }
    const r = await coachReply(uid, {
      message: String(b.message || "").slice(0, 4000),
      voice: !!b.voice,
      activity,
      craving: !!b.craving,
      start: !!b.start,
    });
    if (r.interviewDone) await startJob(siteUrl(req), uid, "plan");
    return json({ reply: r.reply, effects: r.effects.map((e) => ({ type: e.type })), state: await snapshot(uid, b.viewDate) });
  } catch (e) {
    console.error("chat error", e);
    const msg = e?.status === 401 || e?.status === 403
      ? "Il coach non è configurato (chiave AI mancante o non valida)."
      : e?.status === 429
        ? "Il coach è sovraccarico, riprova tra un minuto."
        : "Il coach non ha risposto, riprova.";
    return fail(msg, 500);
  }
};

export const config = { path: "/api/chat", method: ["POST"] };

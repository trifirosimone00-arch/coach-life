// Tutte le azioni dei pulsanti dell'app (senza intelligenza artificiale).
import { userFrom } from "../lib/auth.mjs";
import { getJSON, setJSON, update, K } from "../lib/db.mjs";
import { json, fail, body, siteUrl } from "../lib/http.mjs";
import { nowParts } from "../lib/time.mjs";
import {
  defaultProfile, defaultPlan, defaultDay, addLogs, deleteLog, normPlan, addBadge, addPoints, itemsForDate,
} from "../lib/plan.mjs";
import {
  setItemStatus, addTask, updateTask, deleteTask, editRoutine, resolveProposal, forget, setDayOff, appendChat,
} from "../lib/actions.mjs";
import { startJob } from "../lib/jobs.mjs";
import { snapshot } from "../lib/snapshot.mjs";

const SECTIONS = ["workouts", "smoking", "budget", "study", "goals", "importantDates", "water", "languages", "challenges"];

async function handle(uid, b, req) {
  const profile = await getJSON(K.profile(uid), defaultProfile);
  const tz = profile.tz || "Europe/Rome";
  const extra = {};
  switch (b.type) {
    case "status":
      extra.result = await setItemStatus(uid, b);
      break;
    case "log":
      extra.result = await addLogs(uid, tz, b.entries || []);
      break;
    case "deleteLog":
      await deleteLog(uid, b.id, String(b.date || "").slice(0, 7));
      break;
    case "task.add":
      extra.result = await addTask(uid, b.task || {});
      break;
    case "task.update":
      extra.result = await updateTask(uid, b.id, b.task || {});
      break;
    case "task.delete":
      await deleteTask(uid, b.id);
      break;
    case "routine":
      await editRoutine(uid, b.ops || []);
      break;
    case "planSection": {
      if (!SECTIONS.includes(b.section)) throw new Error("Sezione non valida");
      const plan = await getJSON(K.plan(uid), defaultPlan);
      await setJSON(K.plan(uid), { ...normPlan({ ...plan, [b.section]: b.data }, plan), status: plan.status });
      break;
    }
    case "proposal":
      extra.result = await resolveProposal(uid, b.id, !!b.accept);
      break;
    case "settings":
      await update(K.profile(uid), defaultProfile, (p) => {
        p.settings = { ...p.settings, ...(b.settings || {}) };
        if (typeof b.name === "string") p.name = b.name.slice(0, 60);
        if (typeof b.tz === "string" && b.tz) p.tz = b.tz;
        return p;
      });
      break;
    case "dayOff":
      await setDayOff(uid, b.on);
      break;
    case "memory.delete":
      await forget(uid, b.id);
      break;
    case "onboarding.answers":
      await update(K.profile(uid), defaultProfile, (p) => {
        p.answers = { ...p.answers, ...(b.answers || {}) };
        if (b.answers?.nome && !p.name) p.name = String(b.answers.nome).slice(0, 60);
        if (b.answers?.tono) {
          const map = { "Coach severo": "severo", "Amico che ti sprona": "amico", "Calmo e gentile": "gentile", Ironico: "ironico" };
          p.settings.tone = map[b.answers.tono] || p.settings.tone;
        }
        if (b.tz) p.tz = b.tz;
        if (b.done) p.onboardingStep = "interview";
        return p;
      });
      break;
    case "onboarding.generate": {
      // Evita di lanciare più generazioni insieme (tocchi ripetuti su Riprova)
      const job = await getJSON(K.job(uid), null);
      if (job?.job === "plan" && job.status === "running" && Date.now() - job.ts < 10 * 60000) break;
      await update(K.profile(uid), defaultProfile, (p) => {
        p.onboardingStep = "generating";
        return p;
      });
      await startJob(siteUrl(req), uid, "plan");
      break;
    }
    case "onboarding.back":
      await update(K.profile(uid), defaultProfile, (p) => {
        p.onboardingStep = b.step === "cards" ? "cards" : "interview";
        return p;
      });
      break;
    case "onboarding.approve": {
      await update(K.plan(uid), defaultPlan, (p) => {
        p.status = "active";
        return p;
      });
      await update(K.profile(uid), defaultProfile, (p) => {
        p.onboarded = true;
        p.onboardingStep = "done";
        return p;
      });
      if (await addBadge(uid, { id: "start", title: "Si parte", text: "Hai approvato il tuo primo piano" })) await addPoints(uid, 20, "Piano approvato");
      await appendChat(uid, [{ role: "assistant", text: "Piano attivo. Da adesso ti scrivo io all'orario di ogni attività. Attiva le notifiche e non farmi aspettare.", kind: "system" }]);
      break;
    }
    case "checkin": {
      const now = nowParts(tz);
      const date = b.date || now.date;
      const c = b.data || {};
      const entries = [];
      if (Number.isFinite(Number(c.extraCigarettes)) && Number(c.extraCigarettes) > 0) entries.push({ type: "sigaretta", value: Number(c.extraCigarettes), date, note: "dal bilancio serale" });
      if (c.sleep) entries.push({ type: "sonno", value: Number(c.sleep), date });
      if (c.mood) entries.push({ type: "umore", value: Number(c.mood), date });
      if (c.energy) entries.push({ type: "energia", value: Number(c.energy), date });
      const diary = [c.good && `Bene: ${c.good}`, c.improve && `Da migliorare: ${c.improve}`, c.tomorrow && `Domani: ${c.tomorrow}`].filter(Boolean).join(" · ");
      if (diary || c.score) entries.push({ type: "diario", value: c.score ? Number(c.score) : null, note: diary, date });
      if (entries.length) await addLogs(uid, tz, entries);
      await update(K.day(uid, date), defaultDay, (d) => {
        d.checkin = { ...c, ts: Date.now() };
        return d;
      });
      const plan = await getJSON(K.plan(uid), defaultPlan);
      const ci = itemsForDate(plan, date).find((i) => i.kind === "checkin");
      if (ci) await setItemStatus(uid, { date, itemId: ci.id, status: "done", rating: c.score });
      break;
    }
    default:
      throw new Error("Azione sconosciuta");
  }
  return extra;
}

export default async (req) => {
  if (req.method !== "POST") return fail("Metodo non permesso", 405);
  const uid = await userFrom(req);
  if (!uid) return fail("Non autenticato", 401);
  const b = await body(req);
  try {
    const extra = await handle(uid, b, req);
    return json({ ok: true, ...extra, state: b.noState ? undefined : await snapshot(uid, b.viewDate) });
  } catch (e) {
    console.error(e);
    return fail(e.message || "Errore", 400);
  }
};

export const config = { path: "/api/action", method: ["POST"] };

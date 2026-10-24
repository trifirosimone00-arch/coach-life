// Struttura del piano, valori di default, attività del giorno, punti e statistiche.
import { getJSON, setJSON, update, K, shortId } from "./db.mjs";
import { nowParts, toMin, addDays, dowOf, daysBetween, weekStart } from "./time.mjs";

export const CATEGORIES = [
  "sveglia", "lavoro", "sport", "studio", "lingua", "progetto", "casa", "commissione",
  "sociale", "coppia", "salute", "soldi", "sonno", "checkin", "altro",
];

export const EXPENSE_CATS = ["cibo", "uscite", "trasporti", "sigarette", "casa", "salute", "svago", "abbigliamento", "altro"];

export function defaultProfile() {
  return {
    name: "",
    email: "",
    tz: "Europe/Rome",
    onboarded: false,
    onboardingStep: "cards", // cards -> interview -> generating -> review -> done
    answers: {}, // risposte alle schede iniziali
    summary: "", // profilo scritto dal coach dopo l'intervista
    settings: {
      tone: "severo", // severo | amico | gentile | ironico
      nagEvery: 5, // minuti tra un sollecito e l'altro
      nagMax: 12, // solleciti massimi per attività
      voiceReply: "auto", // auto (se parli tu) | sempre | mai
      voiceName: "",
      voiceRate: 1.05,
      practiceLanguages: true,
    },
    created: Date.now(),
  };
}

export function defaultPlan() {
  return {
    status: "empty", // empty | draft | active
    routine: [],
    tasks: [],
    workouts: [],
    smoking: { active: false, baseline: 0, pricePerPack: 5.5, perPack: 20, startDate: null, steps: [] },
    budget: { currency: "€", payday: null, categories: {}, fixed: [], savingsGoal: null },
    study: { exams: [], thesis: null },
    goals: [],
    importantDates: [],
    water: { enabled: false, everyHours: 2, from: "09:00", to: "17:30", days: [1, 2, 3, 4, 5] },
    languages: [],
    challenges: [],
    notes: "",
    updated: Date.now(),
  };
}

export function defaultGame() {
  return { points: 0, streak: 0, best: 0, lastDay: null, badges: [], history: [] };
}

export function levelOf(points) {
  const p = Math.max(0, points);
  const level = Math.floor(Math.sqrt(p / 40)) + 1;
  const cur = 40 * (level - 1) ** 2;
  const next = 40 * level ** 2;
  const names = ["Principiante", "In movimento", "Costante", "Determinato", "Disciplinato", "Inarrestabile", "Leggenda"];
  return { level, name: names[Math.min(level - 1, names.length - 1)], cur, next, progress: (p - cur) / (next - cur) };
}

// Normalizza un'attività di routine.
export function normActivity(a = {}) {
  const days = Array.isArray(a.days) ? a.days.map(Number).filter((d) => d >= 1 && d <= 7) : [1, 2, 3, 4, 5, 6, 7];
  const start = /^\d{1,2}:\d{2}$/.test(a.start || "") ? a.start.padStart(5, "0") : "09:00";
  const end = /^\d{1,2}:\d{2}$/.test(a.end || "") ? a.end.padStart(5, "0") : null;
  return {
    id: a.id || shortId("r"),
    title: String(a.title || "Attività").slice(0, 80),
    category: CATEGORIES.includes(a.category) ? a.category : "altro",
    days: [...new Set(days)].sort(),
    start,
    end,
    nag: a.nag !== false,
    kind: ["normal", "checkin", "workout", "language", "morning"].includes(a.kind) ? a.kind : "normal",
    workoutId: a.workoutId || null,
    language: a.language || null,
    notes: String(a.notes || "").slice(0, 300),
    points: Number(a.points) > 0 ? Math.min(50, Number(a.points)) : 10,
  };
}

export function normTask(t = {}) {
  return {
    id: t.id || shortId("t"),
    title: String(t.title || "Impegno").slice(0, 120),
    category: CATEGORIES.includes(t.category) ? t.category : "commissione",
    date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || "") ? t.date : null,
    start: /^\d{1,2}:\d{2}$/.test(t.start || "") ? t.start.padStart(5, "0") : null,
    end: /^\d{1,2}:\d{2}$/.test(t.end || "") ? t.end.padStart(5, "0") : null,
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(t.deadline || "") ? t.deadline : null,
    location: String(t.location || "").slice(0, 120),
    notes: String(t.notes || "").slice(0, 400),
    priority: ["alta", "media", "bassa"].includes(t.priority) ? t.priority : "media",
    area: String(t.area || "").slice(0, 30), // es. lavoro, casa, coppia
    done: !!t.done,
    nag: t.nag !== false,
    created: t.created || Date.now(),
  };
}

// Minuti nella giornata: gli orari prima delle 4 contano come fine serata.
export function dayMin(h) {
  const m = toMin(h);
  if (m === null) return 9999;
  return m < 240 ? m + 1440 : m;
}

// Tutte le cose in agenda per una data (routine + impegni singoli), ordinate per orario.
export function itemsForDate(plan, date) {
  const dow = dowOf(date);
  const routine = (plan.routine || [])
    .filter((a) => a.days.includes(dow))
    .map((a) => ({ ...a, type: "routine", date }));
  const tasks = (plan.tasks || [])
    .filter((t) => t.date === date)
    .map((t) => ({ ...t, type: "task", kind: "normal", points: 10 }));
  return [...routine, ...tasks].sort((a, b) => dayMin(a.start) - dayMin(b.start));
}

// Limite sigarette per una data, dal piano di riduzione.
export function smokingLimit(plan, date) {
  const s = plan.smoking || {};
  if (!s.active || !Array.isArray(s.steps) || !s.steps.length) return null;
  let limit = s.baseline ?? null;
  for (const st of [...s.steps].sort((a, b) => (a.from < b.from ? -1 : 1))) {
    if (st.from <= date) limit = Number(st.limit);
  }
  return limit;
}

// ----- Giorno (stato attività, flag notifiche) -----
export function defaultDay() {
  return { items: {}, flags: {}, dayOff: false, checkin: null };
}

export async function getDay(uid, date) {
  return getJSON(K.day(uid, date), defaultDay);
}

// ----- Log -----
export const LOG_TYPES = [
  "sigaretta", "voglia", "spesa", "entrata", "risparmio", "acqua", "pasto", "sonno", "peso",
  "allenamento", "serie", "corsa", "studio", "tesi", "lingua", "progetto", "umore", "energia",
  "diario", "lavoro", "altro",
];

export function normLog(l, tz) {
  const now = nowParts(tz);
  const type = LOG_TYPES.includes(l.type) ? l.type : "altro";
  const value = l.value === undefined || l.value === null || l.value === "" ? null : Number(l.value);
  return {
    id: l.id || shortId("l"),
    ts: Date.now(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(l.date || "") ? l.date : now.date,
    time: now.hhmm,
    type,
    value: Number.isFinite(value) ? value : null,
    unit: String(l.unit || "").slice(0, 20),
    category: String(l.category || "").slice(0, 30),
    note: String(l.note || "").slice(0, 500),
    meta: l.meta && typeof l.meta === "object" ? l.meta : undefined,
  };
}

export async function addLogs(uid, tz, entries) {
  const byMonth = {};
  const out = [];
  for (const e of entries) {
    const n = normLog(e, tz);
    out.push(n);
    (byMonth[n.date.slice(0, 7)] ||= []).push(n);
  }
  for (const [m, list] of Object.entries(byMonth)) {
    await update(K.logs(uid, m), [], (cur) => [...cur, ...list]);
  }
  return out;
}

export async function deleteLog(uid, id, month) {
  await update(K.logs(uid, month), [], (cur) => cur.filter((l) => l.id !== id));
}

export async function logsSince(uid, fromDate, toDate) {
  const months = new Set();
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) months.add(d.slice(0, 7));
  const all = [];
  for (const m of months) all.push(...(await getJSON(K.logs(uid, m), [])));
  return all.filter((l) => l.date >= fromDate && l.date <= toDate);
}

// ----- Punti e serie -----
export async function addPoints(uid, delta, reason) {
  return update(K.game(uid), defaultGame, (g) => {
    g.points = Math.max(0, (g.points || 0) + delta);
    g.history = [{ ts: Date.now(), delta, reason }, ...(g.history || [])].slice(0, 60);
    return g;
  });
}

export async function addBadge(uid, badge) {
  let added = false;
  await update(K.game(uid), defaultGame, (g) => {
    if (!(g.badges || []).some((b) => b.id === badge.id)) {
      g.badges = [...(g.badges || []), { ...badge, ts: Date.now() }];
      added = true;
    }
    return g;
  });
  return added;
}

// Chiude una giornata: aggiorna la serie se almeno il 60% delle attività è fatto.
export async function closeDay(uid, plan, date) {
  const day = await getDay(uid, date);
  if (day.flags.closed) return;
  const items = itemsForDate(plan, date).filter((i) => i.kind !== "morning");
  const total = items.length;
  const done = items.filter((i) => day.items[i.id]?.status === "done").length;
  const ok = day.dayOff ? done >= Math.ceil(total * 0.3) : total === 0 ? true : done / total >= 0.6;
  await update(K.game(uid), defaultGame, (g) => {
    if (g.lastDay && g.lastDay >= date) return g;
    if (ok) {
      g.streak = g.lastDay && daysBetween(g.lastDay, date) === 1 ? (g.streak || 0) + 1 : 1;
      g.best = Math.max(g.best || 0, g.streak);
    } else {
      g.streak = 0;
    }
    g.lastDay = date;
    return g;
  });
  day.flags.closed = true;
  await setJSON(K.day(uid, date), day);
}

// ----- Statistiche per coach e grafici -----
export function summarizeLogs(logs, plan, from, to) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const by = (type) => logs.filter((l) => l.type === type);
  const perDay = (type, field = "value", countOnly = false) =>
    days.map((d) => {
      const list = logs.filter((l) => l.type === type && l.date === d);
      return countOnly ? list.length : list.reduce((s, l) => s + (Number(l[field]) || (field === "value" && l.value === null ? 1 : 0)), 0);
    });
  const cigs = days.map((d) =>
    logs.filter((l) => l.type === "sigaretta" && l.date === d).reduce((s, l) => s + (l.value ?? 1), 0)
  );
  const expenses = by("spesa");
  const spentByCat = {};
  for (const e of expenses) spentByCat[e.category || "altro"] = (spentByCat[e.category || "altro"] || 0) + (e.value || 0);
  const sleep = by("sonno").map((l) => l.value).filter(Number.isFinite);
  const mood = by("umore").map((l) => l.value).filter(Number.isFinite);
  return {
    days,
    cigarettes: cigs,
    cravings: perDay("voglia", "value", true),
    limits: days.map((d) => smokingLimit(plan, d)),
    studyMin: days.map((d) =>
      logs.filter((l) => ["studio", "tesi", "lingua"].includes(l.type) && l.date === d && (l.unit === "min" || !l.unit)).reduce((s, l) => s + (l.value || 0), 0)
    ),
    languageMin: perDay("lingua"),
    thesisPages: days.map((d) => logs.filter((l) => l.type === "tesi" && l.date === d && l.unit === "pagine").reduce((s, l) => s + (l.value || 0), 0)),
    workouts: perDay("allenamento", "value", true),
    runKm: days.map((d) => logs.filter((l) => l.type === "corsa" && l.date === d).reduce((s, l) => s + (l.value || 0), 0)),
    water: perDay("acqua", "value", true),
    spentPerDay: days.map((d) => expenses.filter((l) => l.date === d).reduce((s, l) => s + (l.value || 0), 0)),
    spentTotal: expenses.reduce((s, l) => s + (l.value || 0), 0),
    spentByCat,
    income: by("entrata").reduce((s, l) => s + (l.value || 0), 0),
    saved: by("risparmio").reduce((s, l) => s + (l.value || 0), 0),
    sleepAvg: sleep.length ? +(sleep.reduce((a, b) => a + b, 0) / sleep.length).toFixed(1) : null,
    sleepPerDay: days.map((d) => logs.find((l) => l.type === "sonno" && l.date === d)?.value ?? null),
    moodAvg: mood.length ? +(mood.reduce((a, b) => a + b, 0) / mood.length).toFixed(1) : null,
    meals: by("pasto").slice(-10).map((l) => ({ date: l.date, note: l.note, score: l.value })),
    weight: by("peso").map((l) => ({ date: l.date, value: l.value })),
    projectHours: by("progetto").reduce((s, l) => s + (l.value || 0), 0),
  };
}

// Quanti soldi risparmiati rispetto a quanto si fumava prima.
export function smokingSavings(plan, logs, from, to) {
  const s = plan.smoking || {};
  if (!s.baseline || !s.startDate) return null;
  const start = s.startDate > from ? s.startDate : from;
  if (start > to) return null;
  let saved = 0;
  let notSmoked = 0;
  for (let d = start; d <= to; d = addDays(d, 1)) {
    const smoked = logs.filter((l) => l.type === "sigaretta" && l.date === d).reduce((a, l) => a + (l.value ?? 1), 0);
    const diff = Math.max(0, s.baseline - smoked);
    notSmoked += diff;
  }
  saved = (notSmoked / (s.perPack || 20)) * (s.pricePerPack || 5.5);
  return { notSmoked, saved: +saved.toFixed(2) };
}

// Statistiche sulle attività saltate (per proporre modifiche).
export async function skipInsights(uid, plan, today, days = 14) {
  const counts = {};
  for (let i = 1; i <= days; i++) {
    const d = addDays(today, -i);
    const day = await getJSON(K.day(uid, d), null);
    if (!day) continue;
    for (const it of itemsForDate(plan, d)) {
      if (it.type !== "routine") continue;
      const st = day.items[it.id]?.status;
      const c = (counts[it.id] ||= { id: it.id, title: it.title, planned: 0, done: 0, skipped: 0, missed: 0, reasons: [] });
      c.planned++;
      if (st === "done") c.done++;
      else if (st === "skipped") {
        c.skipped++;
        if (day.items[it.id]?.reason) c.reasons.push(day.items[it.id].reason);
      } else c.missed++;
    }
  }
  return Object.values(counts).filter((c) => c.skipped + c.missed >= 3);
}

// Applica una lista di modifiche alla routine.
export function applyRoutineOps(plan, ops = []) {
  for (const op of ops) {
    if (op.op === "add" && op.activity) plan.routine.push(normActivity(op.activity));
    if (op.op === "update" && op.id) {
      const i = plan.routine.findIndex((a) => a.id === op.id);
      if (i >= 0) plan.routine[i] = normActivity({ ...plan.routine[i], ...(op.activity || {}), id: op.id });
    }
    if (op.op === "delete" && op.id) plan.routine = plan.routine.filter((a) => a.id !== op.id);
  }
  plan.updated = Date.now();
  return plan;
}

// Normalizza un piano completo (generato dal coach o modificato a mano).
export function normPlan(p = {}, base = defaultPlan()) {
  const plan = { ...base, ...p };
  plan.routine = (p.routine || base.routine || []).map(normActivity);
  plan.tasks = (p.tasks || base.tasks || []).map(normTask);
  plan.workouts = (p.workouts || base.workouts || []).map((w) => ({
    id: w.id || shortId("w"),
    name: String(w.name || "Scheda").slice(0, 60),
    focus: String(w.focus || "").slice(0, 120),
    exercises: (w.exercises || []).map((e) => ({
      name: String(e.name || "Esercizio").slice(0, 60),
      sets: Number(e.sets) || 3,
      reps: String(e.reps ?? "10").slice(0, 20),
      weight: e.weight === undefined || e.weight === null ? "" : String(e.weight).slice(0, 20),
      rest: String(e.rest || "").slice(0, 20),
      notes: String(e.notes || "").slice(0, 120),
    })),
  }));
  const s = p.smoking || base.smoking || {};
  plan.smoking = {
    active: !!s.active,
    baseline: Number(s.baseline) || 0,
    pricePerPack: Number(s.pricePerPack) || 5.5,
    perPack: Number(s.perPack) || 20,
    startDate: s.startDate || null,
    quitDate: s.quitDate || null,
    steps: (s.steps || []).map((x) => ({ from: x.from, limit: Number(x.limit) || 0 })).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.from || "")),
  };
  const b = p.budget || base.budget || {};
  plan.budget = {
    currency: b.currency || "€",
    payday: Number(b.payday) || null,
    monthlyIncome: Number(b.monthlyIncome) || null,
    categories: Object.fromEntries(Object.entries(b.categories || {}).map(([k, v]) => [k, Number(v) || 0])),
    fixed: (b.fixed || []).map((f) => ({ id: f.id || shortId("f"), title: String(f.title || "Spesa fissa"), amount: Number(f.amount) || 0, day: Number(f.day) || 1, saving: !!f.saving })),
    savingsGoal: b.savingsGoal
      ? { title: String(b.savingsGoal.title || "Obiettivo"), target: Number(b.savingsGoal.target) || 0, deadline: b.savingsGoal.deadline || null, monthly: Number(b.savingsGoal.monthly) || null }
      : null,
  };
  const st = p.study || base.study || {};
  plan.study = {
    exams: (st.exams || []).map((e) => ({ id: e.id || shortId("e"), name: String(e.name || "Esame"), date: e.date || null, topics: (e.topics || []).map((t) => (typeof t === "string" ? { title: t, done: false } : { title: String(t.title || ""), done: !!t.done })) })),
    thesis: st.thesis
      ? {
          title: String(st.thesis.title || "Tesi"),
          deadline: st.thesis.deadline || null,
          weeklyPages: Number(st.thesis.weeklyPages) || null,
          chapters: (st.thesis.chapters || []).map((c) => ({
            id: c.id || shortId("c"),
            title: String(c.title || "Capitolo"),
            done: !!c.done,
            paragraphs: (c.paragraphs || []).map((x) => (typeof x === "string" ? { title: x, done: false } : { title: String(x.title || ""), done: !!x.done })),
          })),
        }
      : null,
  };
  plan.goals = (p.goals || base.goals || []).map((g) => ({
    id: g.id || shortId("g"),
    title: String(g.title || "Obiettivo").slice(0, 100),
    area: String(g.area || "").slice(0, 30),
    deadline: g.deadline || null,
    why: String(g.why || "").slice(0, 200),
    milestones: (g.milestones || []).map((m) => (typeof m === "string" ? { title: m, done: false } : { title: String(m.title || ""), done: !!m.done })),
  }));
  plan.importantDates = (p.importantDates || base.importantDates || []).map((d) => ({
    id: d.id || shortId("d"),
    title: String(d.title || "Data"),
    date: d.date, // YYYY-MM-DD (se yearly conta solo mese-giorno)
    yearly: d.yearly !== false,
    person: String(d.person || ""),
  }));
  const w = p.water || base.water || {};
  plan.water = { enabled: !!w.enabled, everyHours: Number(w.everyHours) || 2, from: w.from || "09:00", to: w.to || "17:30", days: w.days || [1, 2, 3, 4, 5] };
  plan.languages = (p.languages || base.languages || []).map((l) => ({
    code: String(l.code || "en").slice(0, 5),
    name: String(l.name || "Inglese"),
    level: String(l.level || "A2"),
    goal: String(l.goal || ""),
    focus: Array.isArray(l.focus) ? l.focus.map(String) : [],
  }));
  plan.challenges = (p.challenges || base.challenges || []).map((c) => ({
    id: c.id || shortId("s"),
    title: String(c.title || "Sfida"),
    week: c.week || null,
    target: Number(c.target) || 1,
    progress: Number(c.progress) || 0,
    done: !!c.done,
    points: Number(c.points) || 30,
  }));
  plan.updated = Date.now();
  return plan;
}

export async function loadAll(uid) {
  const [profile, plan, game] = await Promise.all([
    getJSON(K.profile(uid), defaultProfile),
    getJSON(K.plan(uid), defaultPlan),
    getJSON(K.game(uid), defaultGame),
  ]);
  return { profile, plan, game };
}

export function currentWeek(date) {
  return weekStart(date);
}

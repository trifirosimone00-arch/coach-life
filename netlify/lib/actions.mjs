// Operazioni condivise tra app (pulsanti) e coach (strumenti).
import { getJSON, setJSON, update, K, shortId } from "./db.mjs";
import { nowParts, toMin } from "./time.mjs";
import {
  itemsForDate, getDay, addPoints, addLogs, defaultPlan, defaultProfile, normTask, applyRoutineOps, defaultDay,
} from "./plan.mjs";

const AUTO_LOG = {
  sport: (it, min) => ({ type: "allenamento", value: 1, note: it.title, meta: { minutes: min } }),
  lingua: (it, min) => ({ type: "lingua", value: min, unit: "min", category: it.language || "", note: it.title }),
  studio: (it, min) => ({ type: "studio", value: min, unit: "min", note: it.title }),
  progetto: (it, min) => ({ type: "progetto", value: +(min / 60).toFixed(2), unit: "ore", note: it.title }),
};

export async function setItemStatus(uid, { date, itemId, status, rating, note, reason, snoozeMinutes }) {
  const [profile, plan] = await Promise.all([getJSON(K.profile(uid), defaultProfile), getJSON(K.plan(uid), defaultPlan)]);
  const tz = profile.tz || "Europe/Rome";
  const now = nowParts(tz);
  date = date || now.date;
  const item = itemsForDate(plan, date).find((i) => i.id === itemId);
  if (!item) throw new Error("Attività non trovata per questa data");
  const day = await getDay(uid, date);
  const prev = day.items[itemId] || {};
  const cur = { ...prev, updatedAt: Date.now() };
  let delta = 0;
  const msgs = [];

  if (status === "started") {
    cur.status = "started";
    cur.startedAt = cur.startedAt || Date.now();
    const s = toMin(item.start);
    if (!prev.startBonus && date === now.date && s !== null && now.minutes - s <= 10 && now.minutes - s >= -15) {
      cur.startBonus = true;
      delta += 5;
      msgs.push("+5 puntualità");
    }
  } else if (status === "snoozed") {
    const mins = Number(snoozeMinutes) || 15;
    cur.status = "snoozed";
    cur.snoozeUntil = (date === now.date ? now.minutes : toMin(item.start) || 0) + mins;
    cur.snoozeCount = (prev.snoozeCount || 0) + 1;
    cur.snoozeNotified = false;
    cur.pings = 0;
  } else if (status === "skipped") {
    cur.status = "skipped";
    cur.reason = String(reason || "").slice(0, 300);
    if (!prev.skipPenalty) {
      cur.skipPenalty = true;
      delta -= 5;
      msgs.push("-5 attività saltata");
    }
  } else if (status === "done") {
    cur.status = "done";
    cur.doneAt = Date.now();
    if (rating !== undefined && rating !== null) cur.rating = Math.max(1, Math.min(5, Number(rating) || 3));
    if (note) cur.note = String(note).slice(0, 500);
    if (!prev.donePoints) {
      cur.donePoints = true;
      delta += item.points || 10;
      msgs.push(`+${item.points || 10} ${item.title}`);
      // Log automatico della durata
      const fn = AUTO_LOG[item.category];
      if (fn) {
        const s = toMin(item.start);
        const e = toMin(item.end);
        let min = s !== null && e !== null ? e - s : 30;
        if (cur.startedAt) min = Math.max(5, Math.round((Date.now() - cur.startedAt) / 60000)) || min;
        if (min > 300) min = s !== null && e !== null ? e - s : 60;
        await addLogs(uid, tz, [{ ...fn(item, min), date }]);
      }
    }
    if (item.type === "task") {
      await update(K.plan(uid), defaultPlan, (p) => {
        const t = p.tasks.find((x) => x.id === itemId);
        if (t) t.done = true;
        return p;
      });
    }
  } else if (status === "reset") {
    delete cur.status;
  } else {
    throw new Error("Stato non valido");
  }
  day.items[itemId] = cur;
  await setJSON(K.day(uid, date), day);
  let game = null;
  if (delta) game = await addPoints(uid, delta, `${item.title}: ${status}`);
  return { item: { id: item.id, title: item.title }, state: cur, points: delta, messages: msgs, game };
}

export async function setDayOff(uid, on, date) {
  const profile = await getJSON(K.profile(uid), defaultProfile);
  date = date || nowParts(profile.tz).date;
  return update(K.day(uid, date), defaultDay, (d) => {
    d.dayOff = !!on;
    return d;
  });
}

export async function addTask(uid, t) {
  const task = normTask(t);
  await update(K.plan(uid), defaultPlan, (p) => {
    p.tasks.push(task);
    p.updated = Date.now();
    return p;
  });
  return task;
}

export async function updateTask(uid, id, fields) {
  let out = null;
  await update(K.plan(uid), defaultPlan, (p) => {
    const i = p.tasks.findIndex((x) => x.id === id);
    if (i < 0) throw new Error("Impegno non trovato");
    p.tasks[i] = normTask({ ...p.tasks[i], ...fields, id });
    out = p.tasks[i];
    return p;
  });
  return out;
}

export async function deleteTask(uid, id) {
  await update(K.plan(uid), defaultPlan, (p) => {
    p.tasks = p.tasks.filter((x) => x.id !== id);
    return p;
  });
}

export async function editRoutine(uid, ops) {
  return update(K.plan(uid), defaultPlan, (p) => applyRoutineOps(p, ops));
}

export async function addProposal(uid, { summary, ops, reason }) {
  const prop = { id: shortId("p"), summary: String(summary || "").slice(0, 600), reason: String(reason || "").slice(0, 300), ops: ops || [], ts: Date.now() };
  await update(K.pending(uid), [], (list) => [prop, ...list].slice(0, 10));
  return prop;
}

export async function resolveProposal(uid, id, accept) {
  let prop = null;
  await update(K.pending(uid), [], (list) => {
    prop = list.find((p) => p.id === id);
    return list.filter((p) => p.id !== id);
  });
  if (!prop) throw new Error("Proposta non trovata");
  if (accept) await editRoutine(uid, prop.ops);
  return prop;
}

export async function remember(uid, facts) {
  const add = (facts || []).map((f) => String(f).trim()).filter(Boolean).map((text) => ({ id: shortId("m"), text: text.slice(0, 300), ts: Date.now() }));
  await update(K.memory(uid), [], (list) => {
    const existing = new Set(list.map((m) => m.text.toLowerCase()));
    return [...list, ...add.filter((m) => !existing.has(m.text.toLowerCase()))].slice(-200);
  });
  return add;
}

export async function forget(uid, id) {
  await update(K.memory(uid), [], (list) => list.filter((m) => m.id !== id));
}

export async function appendChat(uid, msgs) {
  const add = msgs.map((m) => ({ id: shortId("c"), ts: Date.now(), ...m }));
  await update(K.chat(uid), [], (list) => [...list, ...add].slice(-300));
  return add;
}

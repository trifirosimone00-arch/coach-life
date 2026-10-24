// Fotografia completa dello stato per l'app.
import { getJSON, K } from "./db.mjs";
import { nowParts, addDays, weekStart } from "./time.mjs";
import {
  loadAll, itemsForDate, getDay, logsSince, summarizeLogs, smokingLimit, smokingSavings, levelOf,
} from "./plan.mjs";
import { publicKey } from "./push.mjs";

export async function snapshot(uid, date) {
  const { profile, plan, game } = await loadAll(uid);
  const tz = profile.tz || "Europe/Rome";
  const now = nowParts(tz);
  const today = now.date;
  date = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : today;
  const ws = weekStart(date);
  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const day = await getDay(uid, d);
    week.push({
      date: d,
      dayOff: day.dayOff,
      checkin: day.checkin,
      items: itemsForDate(plan, d).map((it) => ({ ...it, state: day.items[it.id] || {} })),
    });
  }
  const todayDay = await getDay(uid, today);
  const todayItems = itemsForDate(plan, today).map((it) => ({ ...it, state: todayDay.items[it.id] || {} }));
  const from14 = addDays(today, -13);
  const monthStart = now.month + "-01";
  const logs = await logsSince(uid, monthStart < from14 ? monthStart : from14, today);
  const stats14 = summarizeLogs(logs.filter((l) => l.date >= from14), plan, from14, today);
  const statsMonth = summarizeLogs(logs.filter((l) => l.date >= monthStart), plan, monthStart, today);
  const [chat, memory, pending, reports, learn, job, push] = await Promise.all([
    getJSON(K.chat(uid), []),
    getJSON(K.memory(uid), []),
    getJSON(K.pending(uid), []),
    getJSON(K.reports(uid), []),
    getJSON(K.learn(uid), {}),
    getJSON(K.job(uid), null),
    getJSON(K.push(uid), []),
  ]);
  const cigToday = logs.filter((l) => l.type === "sigaretta" && l.date === today).reduce((s, l) => s + (l.value ?? 1), 0);
  return {
    now,
    today,
    date,
    profile,
    plan,
    game: { ...game, ...levelOf(game.points) },
    todayItems,
    dayOff: todayDay.dayOff,
    checkin: todayDay.checkin,
    week,
    logsToday: logs.filter((l) => l.date === today),
    logsRecent: logs.filter((l) => l.date >= addDays(today, -6)).slice(-120),
    stats14,
    statsMonth,
    smoking: {
      today: cigToday,
      limit: smokingLimit(plan, today),
      // solo giornate concluse (fino a ieri)
      savingsAll: plan.smoking?.startDate && plan.smoking.startDate < today ? smokingSavings(plan, await logsSince(uid, plan.smoking.startDate, addDays(today, -1)), plan.smoking.startDate, addDays(today, -1)) : null,
    },
    chat: chat.slice(-80),
    memory,
    pending,
    reports: reports.slice(0, 20),
    learn,
    job,
    pushDevices: push.length,
    vapidKey: publicKey(),
  };
}


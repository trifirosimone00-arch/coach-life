// Gira ogni 5 minuti: notifiche di inizio, solleciti, fine attività, acqua, scadenze, report.
import { getJSON, update, K } from "../lib/db.mjs";
import { env } from "../lib/http.mjs";
import { nowParts, toMin, addDays, lastDayOfMonth } from "../lib/time.mjs";
import { defaultProfile, defaultPlan, defaultDay, itemsForDate, smokingLimit, closeDay } from "../lib/plan.mjs";
import { sendPush } from "../lib/push.mjs";
import { appendChat } from "../lib/actions.mjs";
import { startJob } from "../lib/jobs.mjs";

const START_WIN = 30; // minuti entro cui mandare la notifica di inizio
const END_WIN = 60;

function startText(it, tone) {
  const t = it.title;
  const at = it.start;
  if (it.kind === "checkin") return `Bilancio della giornata. 2 minuti: apri e rispondi.`;
  const severe = {
    sport: `${at} — ${t}. Scarpe ai piedi, si va.`,
    studio: `${at} — ${t}. Telefono lontano, si inizia.`,
    lingua: `${at} — ${t}. Pochi minuti, ma tutti i giorni.`,
    sonno: `${at} — ${t}. Spegni tutto, domani si riparte forte.`,
    sociale: `${at} — ${t}. Esci e goditela, te la sei guadagnata.`,
    coppia: `${at} — ${t}. Tempo di qualità, telefono in tasca.`,
    commissione: `${at} — ${t}. Fallo adesso e te lo togli.`,
  };
  const soft = `${at} — è il momento di: ${t}.`;
  return tone === "severo" ? severe[it.category] || `${at} — ${t}. Si parte adesso.` : soft;
}

function nagText(it, n, tone) {
  const t = it.title;
  if (tone !== "severo") return [`Ci sei? ${t} ti aspetta.`, `Promemoria: ${t}. Inizia o dimmi se rimandi.`][n % 2];
  const list = [
    `Ancora niente? ${t} ti aspetta.`,
    `Sto aspettando. ${t}: inizia, rimanda o dimmi perché salti.`,
    `Le scuse non contano. ${t}, adesso.`,
    `Ogni minuto che passa è un minuto perso. ${t}.`,
    `Rispondimi. ${t}: sì o no?`,
  ];
  return list[n % list.length];
}

function morningText(plan, items, date, name) {
  const rest = items.filter((i) => i.kind !== "morning");
  const lines = rest.slice(0, 5).map((i) => `${i.start} ${i.title}`).join(" · ");
  const lim = smokingLimit(plan, date);
  return `Buongiorno${name ? " " + name : ""}. Oggi ${rest.length} cose: ${lines}${rest.length > 5 ? "…" : ""}${lim !== null ? `. Limite sigarette: ${lim}.` : "."}`;
}

export async function processUser(uid, at, origin) {
  const [profile, plan] = await Promise.all([getJSON(K.profile(uid), defaultProfile), getJSON(K.plan(uid), defaultPlan)]);
  if (plan.status !== "active") return;
  const tz = profile.tz || "Europe/Rome";
  const now = nowParts(tz, at);
  const date = now.date;
  const mins = now.minutes;
  const s = profile.settings || {};
  const tone = s.tone || "severo";
  const nagEvery = Math.max(3, Number(s.nagEvery) || 5);
  const nagMax = Math.max(1, Number(s.nagMax) || 12);

  // Chiudi la giornata di ieri (serie)
  if (mins < 120) await closeDay(uid, plan, addDays(date, -1));

  const day = await getJSON(K.day(uid, date), defaultDay);
  const items = itemsForDate(plan, date);
  const changes = {};
  const flags = {};
  const sends = [];
  const chatLog = [];
  const remaining = items.filter((i) => i.kind !== "morning" && !["done", "skipped"].includes(day.items[i.id]?.status)).length;
  const push = (body, it, extra = {}) =>
    sends.push({ body, tag: it ? `a-${it.id}` : extra.tag || "info", url: it ? `/?a=${encodeURIComponent(it.id)}&d=${date}` : extra.url || "/", badge: remaining, renotify: true, ...extra });

  for (const it of items) {
    const st = day.items[it.id] || {};
    const ch = {};
    const startM = toMin(it.start);
    if (startM === null) continue;
    const endM = toMin(it.end);
    const status = st.status;
    if (status === "done" || status === "skipped") continue;

    // Briefing del mattino
    if (it.kind === "morning") {
      if (!st.notifiedAt && mins >= startM && mins < startM + START_WIN) {
        const txt = morningText(plan, items, date, profile.name);
        push(txt, null, { tag: "morning" });
        chatLog.push(txt);
        ch.notifiedAt = Date.now();
        ch.status = "done";
      }
      if (Object.keys(ch).length) changes[it.id] = ch;
      continue;
    }

    // Notifica di inizio
    if (!st.notifiedAt && !status && mins >= startM && mins < startM + START_WIN) {
      const txt = startText(it, tone);
      push(txt, it);
      chatLog.push(txt);
      ch.notifiedAt = Date.now();
      ch.lastPing = mins;
      ch.pings = 0;
    }
    // Fine del rimando
    else if (status === "snoozed" && !st.snoozeNotified && st.snoozeUntil !== undefined && mins >= st.snoozeUntil && mins < st.snoozeUntil + START_WIN) {
      push(`Tempo scaduto: ${it.title}, adesso.`, it);
      ch.snoozeNotified = true;
      ch.notifiedAt = st.notifiedAt || Date.now();
      ch.lastPing = mins;
      ch.pings = 0;
    }
    // Solleciti finché non risponde
    else if (
      it.nag !== false &&
      !day.dayOff &&
      st.notifiedAt &&
      (!status || (status === "snoozed" && st.snoozeNotified)) &&
      mins - (st.lastPing ?? mins) >= nagEvery &&
      (st.pings || 0) < nagMax &&
      mins < (endM ?? startM + 90) + 15 &&
      mins >= (st.lastPing ?? 0)
    ) {
      push(nagText(it, st.pings || 0, tone), it);
      ch.lastPing = mins;
      ch.pings = (st.pings || 0) + 1;
    }

    // Fine attività: com'è andata?
    if (endM !== null && !st.endAsked && it.kind !== "checkin" && mins >= endM && mins < endM + END_WIN && (status === "started" || st.notifiedAt)) {
      const txt = status === "started" ? `Finito ${it.title}? Com'è andata?` : `${it.title}: l'hai fatto? Dimmi com'è andata.`;
      push(txt, it, { url: `/?a=${encodeURIComponent(it.id)}&d=${date}&end=1` });
      chatLog.push(txt);
      ch.endAsked = true;
    }
    if (Object.keys(ch).length) changes[it.id] = ch;
  }

  // Acqua
  const w = plan.water || {};
  if (w.enabled && (w.days || []).includes(now.dow)) {
    const from = toMin(w.from) ?? 540;
    const to = toMin(w.to) ?? 1050;
    const step = Math.max(30, (Number(w.everyHours) || 2) * 60);
    for (let m = from; m <= to; m += step) {
      const key = `water-${m}`;
      if (!day.flags[key] && mins >= m && mins < m + 15) {
        push("💧 Acqua. Un bicchiere adesso.", null, { tag: "water" });
        flags[key] = true;
      }
    }
  }

  // Uscite fisse e stipendio (alle 9)
  const b = plan.budget || {};
  if (mins >= 540 && mins < 570) {
    const dom = Number(date.slice(8, 10));
    const last = Number(lastDayOfMonth(date).slice(8, 10));
    for (const f of b.fixed || []) {
      const fd = Math.min(f.day, last);
      const key = `fixed-${f.id}`;
      if (fd === dom && !day.flags[key]) {
        push(f.saving ? `Oggi metti da parte ${f.amount} ${b.currency || "€"}: ${f.title}. Subito, prima di spenderli.` : `Oggi scade: ${f.title} (${f.amount} ${b.currency || "€"}).`, null, { tag: key, url: "/#progressi" });
        flags[key] = true;
      }
    }
    if (b.payday && Math.min(b.payday, last) === dom && !day.flags.payday) {
      const save = (b.fixed || []).filter((f) => f.saving).reduce((s2, f) => s2 + f.amount, 0);
      push(`Giorno di stipendio. ${save ? `Prima cosa: metti da parte ${save} ${b.currency || "€"}.` : "Segna l'entrata e metti da parte qualcosa."}`, null, { tag: "payday", url: "/#progressi" });
      flags.payday = true;
    }
  }

  // Date importanti (alle 10): 3 giorni prima e il giorno stesso
  if (mins >= 600 && mins < 630) {
    for (const d of plan.importantDates || []) {
      if (!d.date) continue;
      for (const ahead of [3, 0]) {
        const target = addDays(date, ahead);
        const match = d.yearly ? d.date.slice(5) === target.slice(5) : d.date === target;
        const key = `date-${d.id}-${ahead}`;
        if (match && !day.flags[key]) {
          push(ahead ? `Tra 3 giorni: ${d.title}. Hai già organizzato qualcosa?` : `Oggi: ${d.title}! Non dimenticarlo.`, null, { tag: key });
          flags[key] = true;
        }
      }
    }
  }

  // Report settimanale (domenica 20:00) e mensile (ultimo giorno 21:00)
  if (origin) {
    if (now.dow === 7 && mins >= 1200 && mins < 1230 && !day.flags.weekly) {
      flags.weekly = true;
      try { await startJob(origin, uid, "weekly"); } catch (e) { console.error(e); }
    }
    if (date === lastDayOfMonth(date) && mins >= 1260 && mins < 1290 && !day.flags.monthly) {
      flags.monthly = true;
      try { await startJob(origin, uid, "monthly"); } catch (e) { console.error(e); }
    }
    // Lunedì: se salta spesso qualcosa, il coach prepara una proposta
    if (now.dow === 1 && mins >= 780 && mins < 810 && !day.flags.adapt) {
      flags.adapt = true;
      try { await startJob(origin, uid, "adapt"); } catch (e) { console.error(e); }
    }
  }

  if (!Object.keys(changes).length && !Object.keys(flags).length && !sends.length) return;
  // Salva unendo con lo stato attuale (l'utente potrebbe aver appena risposto)
  await update(K.day(uid, date), defaultDay, (d) => {
    for (const [id, c] of Object.entries(changes)) {
      const curSt = d.items[id] || {};
      const readSt = day.items[id] || {};
      // se nel frattempo l'utente ha risposto, il suo stato vince
      if (curSt.status !== readSt.status) delete c.status;
      d.items[id] = { ...curSt, ...c };
    }
    d.flags = { ...d.flags, ...flags };
    return d;
  });
  for (const p of sends) await sendPush(uid, p);
  if (chatLog.length) await appendChat(uid, chatLog.map((text) => ({ role: "coach_push", text })));
}

export default async () => {
  const at = new Date();
  const origin = (env("URL") || "").replace(/\/$/, "");
  const users = await getJSON(K.usersIndex(), []);
  const started = Date.now();
  for (const uid of users) {
    if (Date.now() - started > 25000) break;
    try {
      await processUser(uid, at, origin);
    } catch (e) {
      console.error("scheduler user error", uid, e);
    }
  }
};

export const config = { schedule: "*/5 * * * *" };

// Il cervello di Coach Life: contesto, strumenti e conversazione con Claude.
import Anthropic from "@anthropic-ai/sdk";
import { getJSON, setJSON, update, K } from "./db.mjs";
import { env } from "./http.mjs";
import { nowParts, addDays, itDate, toMin, daysBetween, weekStart } from "./time.mjs";
import {
  itemsForDate, getDay, logsSince, summarizeLogs, smokingLimit, smokingSavings, skipInsights, levelOf,
  defaultProfile, defaultPlan, defaultGame, normPlan, addLogs, addPoints, CATEGORIES, LOG_TYPES, EXPENSE_CATS,
} from "./plan.mjs";
import {
  setItemStatus, addTask, updateTask, deleteTask, editRoutine, addProposal, remember, forget, appendChat, setDayOff,
} from "./actions.mjs";

export const MODEL_CHAT = () => env("COACH_MODEL", "claude-haiku-5-5");
export const MODEL_SMART = () => env("COACH_MODEL_SMART", "claude-sonnet-5-5");

let _client;
export function anthropic() {
  if (!_client) _client = new Anthropic({ maxRetries: 2 });
  return _client;
}

const TONES = {
  severo:
    "Sei un coach SEVERO ed esigente, stile allenatore sportivo: diretto, poche parole, pretendi impegno e costanza, non accetti scuse deboli e lo dici chiaramente. Mai offensivo, mai umiliante: sei duro perché credi nella persona. Quando fa bene lo riconosci in modo asciutto. Se la persona è davvero giù o stressata ammorbidisci il tono per quel momento e alleggerisci il piano.",
  amico: "Sei un amico che sprona: caloroso, diretto, motivante, con un po' di energia. Spingi ma con il sorriso.",
  gentile: "Sei un coach calmo e gentile: incoraggiante, paziente, mai giudicante.",
  ironico: "Sei un coach ironico: battute leggere e simpatiche, ma molto concreto sugli obiettivi.",
};

function fmtItem(it, st) {
  const status = st?.status ? { done: "✓ fatto", skipped: "✗ saltato", started: "▶ in corso", snoozed: "⏸ rimandato" }[st.status] : "da fare";
  return `- [${it.id}] ${it.start || "--:--"}${it.end ? "–" + it.end : ""} ${it.title} (${it.category}${it.type === "task" ? ", impegno" : ""}) → ${status}${st?.reason ? ` (motivo: ${st.reason})` : ""}`;
}

// Costruisce il contesto aggiornato dell'utente da dare al coach.
export async function buildContext(uid) {
  const [profile, plan, game, memory, pending] = await Promise.all([
    getJSON(K.profile(uid), defaultProfile),
    getJSON(K.plan(uid), defaultPlan),
    getJSON(K.game(uid), defaultGame),
    getJSON(K.memory(uid), []),
    getJSON(K.pending(uid), []),
  ]);
  const tz = profile.tz || "Europe/Rome";
  const now = nowParts(tz);
  const today = now.date;
  const day = await getDay(uid, today);
  const from = addDays(today, -6);
  const monthStart = now.month + "-01";
  const logs = await logsSince(uid, monthStart < from ? monthStart : from, today);
  const week = summarizeLogs(logs.filter((l) => l.date >= from), plan, from, today);
  const monthLogs = logs.filter((l) => l.date.startsWith(now.month));
  const month = summarizeLogs(monthLogs, plan, now.month + "-01", today);
  const lv = levelOf(game.points);
  const todayItems = itemsForDate(plan, today);
  const tomorrow = addDays(today, 1);
  const tomorrowItems = itemsForDate(plan, tomorrow);
  const upcoming = (plan.tasks || []).filter((t) => !t.done && t.date && t.date > tomorrow && t.date <= addDays(today, 21));
  const undated = (plan.tasks || []).filter((t) => !t.done && !t.date);
  const insights = plan.status === "active" ? await skipInsights(uid, plan, today) : [];
  const cigToday = logs.filter((l) => l.type === "sigaretta" && l.date === today).reduce((s, l) => s + (l.value ?? 1), 0);
  const limit = smokingLimit(plan, today);
  const sav = plan.smoking?.startDate && plan.smoking.startDate < today ? smokingSavings(plan, logs, plan.smoking.startDate, addDays(today, -1)) : null;
  const thesis = plan.study?.thesis;
  const lines = [];

  lines.push(`ADESSO: ${itDate(today)}, ore ${now.hhmm} (fuso ${tz}).`);
  lines.push(`\nUTENTE: ${profile.name || "(nome non ancora detto)"}.`);
  if (profile.summary) lines.push(`Profilo:\n${profile.summary}`);
  else if (Object.keys(profile.answers || {}).length) lines.push(`Risposte alle schede iniziali: ${JSON.stringify(profile.answers)}`);
  if (memory.length) lines.push(`\nCOSE CHE SAI DI LUI/LEI (memoria):\n${memory.slice(-80).map((m) => `- [${m.id}] ${m.text}`).join("\n")}`);

  if (plan.status !== "empty") {
    lines.push(`\nOGGI${day.dayOff ? " — MODALITÀ GIORNATA NO ATTIVA (piano alleggerito, sii più morbido)" : ""}:`);
    lines.push(todayItems.length ? todayItems.map((i) => fmtItem(i, day.items[i.id])).join("\n") : "- niente in agenda");
    lines.push(`\nDOMANI (${itDate(tomorrow)}):\n${tomorrowItems.map((i) => `- ${i.start || "--:--"}${i.end ? "–" + i.end : ""} ${i.title}`).join("\n") || "- niente"}`);
    if (upcoming.length) lines.push(`\nIMPEGNI PROSSIMI:\n${upcoming.map((t) => `- [${t.id}] ${t.date} ${t.start || ""} ${t.title}${t.location ? " @ " + t.location : ""}`).join("\n")}`);
    if (undated.length) lines.push(`\nCOSE DA FARE SENZA DATA:\n${undated.map((t) => `- [${t.id}] ${t.title} (${t.area || t.category}, priorità ${t.priority}${t.deadline ? ", entro " + t.deadline : ""})`).join("\n")}`);
    lines.push(`\nROUTINE SETTIMANALE (id, giorni 1=lun..7=dom):\n${plan.routine.map((a) => `- [${a.id}] ${a.title} ${a.start}${a.end ? "–" + a.end : ""} giorni ${a.days.join(",")} (${a.category})`).join("\n")}`);
  }

  lines.push(`\nULTIMI 7 GIORNI (${week.days[0]} → ${today}):`);
  if (plan.smoking?.active || week.cigarettes.some((c) => c > 0)) {
    lines.push(`- Sigarette al giorno: ${week.cigarettes.join(", ")} (limiti: ${week.limits.map((l) => l ?? "-").join(", ")}). Oggi: ${cigToday}${limit !== null ? ` su limite ${limit}` : ""}. Voglie registrate: ${week.cravings.reduce((a, b) => a + b, 0)}.`);
    if (sav) lines.push(`- Da inizio piano fumo: ${sav.notSmoked} sigarette in meno, ${sav.saved} € risparmiati.`);
  }
  lines.push(`- Minuti di studio/lingue al giorno: ${week.studyMin.join(", ")}`);
  lines.push(`- Allenamenti: ${week.workouts.reduce((a, b) => a + b, 0)}; corsa km: ${week.runKm.reduce((a, b) => a + b, 0)}`);
  lines.push(`- Sonno medio: ${week.sleepAvg ?? "n.d."} h; umore medio: ${week.moodAvg ?? "n.d."}/5`);
  if (week.meals.length) lines.push(`- Ultimi pasti: ${week.meals.map((m) => `${m.date} ${m.note} (${m.score ?? "-"}/5)`).join("; ")}`);

  const b = plan.budget || {};
  lines.push(`\nSOLDI (mese ${now.month}): spesi ${month.spentTotal.toFixed(2)} €, entrate ${month.income.toFixed(2)} €, messi da parte ${month.saved.toFixed(2)} €.`);
  if (Object.keys(b.categories || {}).length)
    lines.push(`- Budget per categoria: ${Object.entries(b.categories).map(([k, v]) => `${k} ${(month.spentByCat[k] || 0).toFixed(0)}/${v}`).join(", ")}`);
  if (b.fixed?.length) lines.push(`- Uscite fisse: ${b.fixed.map((f) => `${f.title} ${f.amount}€ il ${f.day}`).join(", ")}${b.payday ? `; stipendio il ${b.payday}` : ""}`);
  if (b.savingsGoal) lines.push(`- Obiettivo risparmio: ${b.savingsGoal.title} ${b.savingsGoal.target}€${b.savingsGoal.deadline ? " entro " + b.savingsGoal.deadline : ""}`);

  if (thesis || plan.study?.exams?.length) {
    lines.push(`\nSTUDIO:`);
    for (const e of plan.study.exams || []) lines.push(`- Esame ${e.name}${e.date ? ` il ${e.date} (tra ${daysBetween(today, e.date)} giorni)` : ""}`);
    if (thesis) {
      const paras = thesis.chapters.flatMap((c) => c.paragraphs);
      lines.push(`- ${thesis.title}${thesis.deadline ? `: consegna ${thesis.deadline} (tra ${daysBetween(today, thesis.deadline)} giorni)` : ""}. Capitoli fatti ${thesis.chapters.filter((c) => c.done).length}/${thesis.chapters.length}, paragrafi fatti ${paras.filter((p) => p.done).length}/${paras.length}. Obiettivo ${thesis.weeklyPages ?? "?"} pagine/settimana, fatte questa settimana ${week.thesisPages.reduce((a, b) => a + b, 0)}.`);
    }
  }
  if (plan.goals?.length)
    lines.push(`\nOBIETTIVI:\n${plan.goals.map((g) => `- [${g.id}] ${g.title}${g.deadline ? " entro " + g.deadline : ""}: ${g.milestones.filter((m) => m.done).length}/${g.milestones.length} tappe`).join("\n")}`);
  const ws = weekStart(today);
  const ch = (plan.challenges || []).filter((c) => !c.week || c.week === ws);
  if (ch.length) lines.push(`\nSFIDE DELLA SETTIMANA:\n${ch.map((c) => `- [${c.id}] ${c.title}: ${c.progress}/${c.target}${c.done ? " ✓" : ""}`).join("\n")}`);
  if (plan.languages?.length) lines.push(`\nLINGUE CHE STUDIA: ${plan.languages.map((l) => `${l.name} (${l.level}${l.goal ? ", obiettivo: " + l.goal : ""})`).join("; ")}`);
  if (plan.importantDates?.length) lines.push(`\nDATE IMPORTANTI: ${plan.importantDates.map((d) => `${d.title} ${d.date}`).join("; ")}`);
  lines.push(`\nGIOCO: ${game.points} punti, livello ${lv.level} (${lv.name}), serie attuale ${game.streak} giorni (record ${game.best}).`);
  if (insights.length)
    lines.push(`\nATTIVITÀ SALTATE SPESSO (ultime 2 settimane):\n${insights.map((c) => `- [${c.id}] ${c.title}: pianificata ${c.planned}, fatta ${c.done}, saltata ${c.skipped}, ignorata ${c.missed}${c.reasons.length ? ". Motivi: " + c.reasons.join("; ") : ""}`).join("\n")}`);
  if (pending.length) lines.push(`\nPROPOSTE IN ATTESA DI APPROVAZIONE:\n${pending.map((p) => `- ${p.summary}`).join("\n")}`);

  return { text: lines.join("\n"), profile, plan, game, now, tz };
}

function systemPrompt(ctx, { voice, activity, interview, craving }) {
  const p = ctx.profile;
  const s = p.settings || {};
  const tone = TONES[s.tone] || TONES.severo;
  const langs = (ctx.plan.languages || []).map((l) => l.name).join(", ");
  const parts = [];
  parts.push(`Sei Coach Life, il coach personale dentro l'app "Coach Life". Il tuo compito è organizzare la vita quotidiana della persona e aiutarla a migliorare davvero: routine, allenamento, studio, lavoro, soldi, salute, relazioni, abitudini. Parli SEMPRE in italiano (tranne quando fai praticare una lingua).

TONO: ${tone}

COME LAVORI:
- Sei concreto e breve: messaggi da chat, 1-5 frasi. Niente papiri. Usa elenchi solo se servono davvero.
- Registri tutto quello che la persona ti dice di aver fatto usando gli strumenti (log_entries, set_activity_status): sigarette, spese, entrate, pasti con voto, ore di sonno, allenamenti con serie e pesi, studio, umore... Non chiedere conferma per registrare: registra e dillo in 3 parole.
- Gli id tra parentesi quadre nel contesto servono solo a te per gli strumenti: non mostrarli mai alla persona.
- COMMISSIONI, IMPEGNI E DECISIONI: quando la persona dice che deve fare qualcosa (una commissione, un appuntamento, una scadenza, una cosa da fare in casa, per lavoro, con il partner o gli amici), guarda la sua agenda e proponi il momento migliore considerando: tempo per arrivarci e distanza (chiedi dove si trova o dov'è il posto se non lo sai), orari di apertura del posto (se serve cercali con web_search), urgenza e scadenza, e il fatto di non sacrificare le attività importanti. Rispondi con LA SCELTA MIGLIORE + UN'ALTERNATIVA, ognuna con il perché in una riga. Quando la persona conferma ("ok", "va bene", "mettila"), aggiungila con add_task (data, ora inizio e fine). Se dice esplicitamente "mettila tu" o simili, aggiungila subito.
- Se la persona ti chiede di cambiare la routine (spostare, aggiungere, togliere attività) fallo subito con edit_routine. Se invece l'idea è tua (es. vedi che salta spesso qualcosa, o è stanca), NON cambiare: usa propose_routine_changes e la persona approverà dall'app.
- Se un'attività viene saltata: prendi atto (i punti tolti li gestisce l'app), chiedi il motivo se non c'è e proponi subito quando recuperarla (con add_task se accetta).
- Quando impari qualcosa di stabile e utile sulla persona (abitudini, preferenze, persone importanti, vincoli, obiettivi) salvalo con remember. Non salvare cose banali o momentanee.
- Per vedere i dettagli di una sezione del piano (schede palestra, budget, studio, obiettivi, sigarette...) usa get_plan_section prima di modificarla con update_plan_section, così non perdi niente.
- Sfide: ogni tanto proponi una sfida settimanale concreta e misurabile e, se la accetta, creala con add_challenge. Aggiorna i progressi con update_challenge.
- Traguardi (primo giorno senza fumo, capitolo finito, serie di 7 giorni...): festeggiali con un messaggio breve.
- Hai accesso al web (web_search) per orari, indirizzi, prezzi, eventi, informazioni aggiornate.
- Salute: dai consigli generali di buon senso su allenamento, sonno e alimentazione, senza diete estreme né numeri ossessivi. Per smettere di fumare incoraggia anche il supporto di professionisti (medico di base, centri antifumo; in Italia il Telefono Verde contro il Fumo dell'ISS 800 554 088). Se la persona sembra in seria difficoltà emotiva, sii umano, alleggerisci e suggerisci di parlarne con qualcuno di fiducia o un professionista.
- Non inventare dati: usa quelli nel contesto o chiedi.`);
  if (s.practiceLanguages !== false && langs)
    parts.push(`PRATICA LINGUE (${langs}): circa una volta ogni 5 messaggi, quando il momento è tranquillo, aggiungi alla fine una breve frase o domanda nella lingua che studia, adatta al suo livello. Se risponde in quella lingua, correggi gli errori in modo breve (corretto → spiegazione in 1 riga) e continua. Se ti chiede di fare conversazione in una lingua, parla in quella lingua al suo livello e correggi.`);
  if (voice)
    parts.push(`MODALITÀ VOCE: la persona ti ha parlato a voce e la tua risposta verrà letta ad alta voce. Rispondi in modo parlato e breve (massimo 3-4 frasi), niente elenchi, niente markdown, niente emoji, niente simboli. Gli orari scrivili come "alle 18 e 30".`);
  if (activity)
    parts.push(`MODALITÀ ATTIVITÀ: la persona sta facendo adesso "${activity.title}" (${activity.category}). ${activity.extra || ""} Aiutala in tempo reale: risposte brevissime e pratiche (es. prossimo esercizio, recupero, tecnica, motivazione). Se ti dice serie, ripetizioni e pesi registrali con log_entries (type "serie", value = peso in kg, unit "kg", note "esercizio: serie x ripetizioni").`);
  if (craving)
    parts.push(`VOGLIA DI FUMARE: la persona ha appena premuto "Voglia di fumare". La voglia passa in 3-5 minuti. Distraila subito con qualcosa di concreto da fare ORA (respirazione 4-7-8, bere un bicchiere d'acqua, camminare 2 minuti, un mini-quiz nella lingua che studia...), ricordale quanto ha già risparmiato e la sfida di oggi rispetto al limite. Tono deciso, frasi corte. Chiudi chiedendole di scriverti tra 5 minuti com'è andata.`);
  if (interview)
    parts.push(`MODALITÀ INTERVISTA INIZIALE: la persona ha appena installato l'app e ha compilato le schede veloci (risposte nel contesto). Ora devi conoscerla A FONDO per costruirle la vita quotidiana ideale. Fai UNA domanda alla volta (al massimo due se brevi e collegate), partendo dai punti meno chiari delle schede, e approfondisci: orari reali della giornata, lavoro e spostamenti, sonno, sport e livello fisico, alimentazione, studio/esami/tesi con scadenze, lingue e perché, abitudini da cambiare (fumo, telefono...), soldi (entrate, spese fisse, obiettivi di risparmio), relazioni (partner, amici, famiglia, date importanti), casa e commissioni, progetti personali, obiettivi a 1, 6, 12 mesi, cosa l'ha fatta mollare in passato. Commenta brevemente le risposte (con il tono scelto) e salva i fatti importanti con remember. L'intervista può durare anche a lungo: va bene, l'importante è capire tutto. Quando hai un quadro completo (o se la persona dice che basta), riassumi in 3-4 righe cosa hai capito, chiedi se è corretto e, se sì, chiama finish_interview con un profilo completo e dettagliato. NON creare tu il piano: lo crea l'app dopo finish_interview.`);
  parts.push(`CONTESTO AGGIORNATO:\n${ctx.text}`);
  return parts.join("\n\n");
}

// ----- Strumenti -----
const SECTION_NAMES = ["workouts", "smoking", "budget", "study", "goals", "importantDates", "water", "languages", "challenges", "tasks"];

const TOOLS = [
  {
    name: "log_entries",
    description: `Registra una o più cose fatte/successe. type: ${LOG_TYPES.join(", ")}. Esempi: sigaretta (value=numero sigarette, default 1), voglia (voglia di fumare), spesa (value=euro, category tra ${EXPENSE_CATS.join("/")}, note=cosa), entrata (value=euro, note=da dove), risparmio (value=euro messi da parte), acqua (value=bicchieri), pasto (note=cosa ha mangiato, value=voto 1-5), sonno (value=ore), peso (value=kg), allenamento (value=1, note), serie (value=kg, note="esercizio: 3x10"), corsa (value=km, meta {minutes}), studio/lingua (value=minuti, unit "min", category=lingua), tesi (value=pagine unit "pagine" oppure minuti unit "min"), progetto (value=ore), umore/energia (value 1-5), diario (note), lavoro (note=task completato). date opzionale YYYY-MM-DD (default oggi).`,
    input_schema: {
      type: "object",
      properties: {
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: LOG_TYPES },
              value: { type: "number" },
              unit: { type: "string" },
              category: { type: "string" },
              note: { type: "string" },
              date: { type: "string" },
              meta: { type: "object" },
            },
            required: ["type"],
          },
        },
      },
      required: ["entries"],
    },
  },
  {
    name: "set_activity_status",
    description: "Aggiorna lo stato di un'attività dell'agenda (routine o impegno): started (iniziata), done (fatta, con rating 1-5 e note), skipped (saltata, con reason), snoozed (rimandata di snooze_minutes). Usa l'id tra parentesi quadre.",
    input_schema: {
      type: "object",
      properties: {
        activity_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD, default oggi" },
        status: { type: "string", enum: ["started", "done", "skipped", "snoozed"] },
        rating: { type: "number" },
        note: { type: "string" },
        reason: { type: "string" },
        snooze_minutes: { type: "number" },
      },
      required: ["activity_id", "status"],
    },
  },
  {
    name: "add_task",
    description: "Aggiunge un impegno singolo in agenda (commissione, appuntamento, scadenza, cosa da fare). Con date e start riceverà la notifica all'orario. Senza date finisce nella lista 'da fare'.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        start: { type: "string", description: "HH:MM" },
        end: { type: "string", description: "HH:MM" },
        category: { type: "string", enum: CATEGORIES },
        area: { type: "string", description: "lavoro, casa, coppia, amici, uni, salute, soldi..." },
        location: { type: "string" },
        notes: { type: "string" },
        priority: { type: "string", enum: ["alta", "media", "bassa"] },
        deadline: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "Modifica un impegno esistente (sposta data/ora, cambia titolo, segna fatto con done=true).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" }, title: { type: "string" }, date: { type: "string" }, start: { type: "string" }, end: { type: "string" },
        location: { type: "string" }, notes: { type: "string" }, priority: { type: "string" }, deadline: { type: "string" }, done: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  { name: "delete_task", description: "Elimina un impegno.", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  {
    name: "edit_routine",
    description: "Modifica SUBITO la routine settimanale. Solo se la persona lo chiede esplicitamente. ops: add (activity completa), update (id + campi da cambiare in activity), delete (id). activity: {title, category, days [1-7], start HH:MM, end HH:MM, kind normal|checkin|workout|language|morning, workoutId, language, notes, nag}.",
    input_schema: {
      type: "object",
      properties: {
        ops: {
          type: "array",
          items: {
            type: "object",
            properties: { op: { type: "string", enum: ["add", "update", "delete"] }, id: { type: "string" }, activity: { type: "object" } },
            required: ["op"],
          },
        },
      },
      required: ["ops"],
    },
  },
  {
    name: "propose_routine_changes",
    description: "Propone modifiche alla routine che la persona dovrà approvare nell'app (usalo quando l'idea è tua). Stesso formato ops di edit_routine, più summary (spiegazione breve e chiara) e reason.",
    input_schema: {
      type: "object",
      properties: { summary: { type: "string" }, reason: { type: "string" }, ops: { type: "array", items: { type: "object" } } },
      required: ["summary", "ops"],
    },
  },
  {
    name: "get_plan_section",
    description: `Legge una sezione completa del piano in JSON: ${SECTION_NAMES.join(", ")}.`,
    input_schema: { type: "object", properties: { section: { type: "string", enum: SECTION_NAMES } }, required: ["section"] },
  },
  {
    name: "update_plan_section",
    description: `Sostituisce una sezione del piano con il JSON completo aggiornato (leggila prima con get_plan_section). Sezioni: workouts [{id,name,focus,exercises:[{name,sets,reps,weight,rest,notes}]}], smoking {active,baseline,pricePerPack,perPack,startDate,quitDate,steps:[{from YYYY-MM-DD,limit}]}, budget {currency,payday,monthlyIncome,categories:{nome:euro},fixed:[{title,amount,day,saving}],savingsGoal:{title,target,deadline,monthly}}, study {exams:[{name,date,topics:[{title,done}]}],thesis:{title,deadline,weeklyPages,chapters:[{title,done,paragraphs:[{title,done}]}]}}, goals [{id,title,area,deadline,why,milestones:[{title,done}]}], importantDates [{title,date,yearly,person}], water {enabled,everyHours,from,to,days}, languages [{code,name,level,goal,focus}], challenges [...], tasks [...].`,
    input_schema: { type: "object", properties: { section: { type: "string", enum: SECTION_NAMES }, data: {} }, required: ["section", "data"] },
  },
  {
    name: "get_stats",
    description: "Statistiche e log grezzi degli ultimi N giorni (max 90), opzionalmente filtrati per tipo.",
    input_schema: { type: "object", properties: { days: { type: "number" }, types: { type: "array", items: { type: "string" } } } },
  },
  {
    name: "remember",
    description: "Salva nella memoria a lungo termine fatti stabili e utili sulla persona (uno per elemento, frase breve in terza persona).",
    input_schema: { type: "object", properties: { facts: { type: "array", items: { type: "string" } } }, required: ["facts"] },
  },
  { name: "forget", description: "Cancella un fatto dalla memoria (id tra parentesi).", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  {
    name: "set_day_off",
    description: "Attiva o disattiva la modalità 'giornata no' per oggi (niente solleciti, piano più leggero).",
    input_schema: { type: "object", properties: { on: { type: "boolean" } }, required: ["on"] },
  },
  {
    name: "add_challenge",
    description: "Crea una sfida per questa settimana (misurabile).",
    input_schema: { type: "object", properties: { title: { type: "string" }, target: { type: "number" }, points: { type: "number" } }, required: ["title", "target"] },
  },
  {
    name: "update_challenge",
    description: "Aggiorna i progressi di una sfida; done=true la completa e assegna i punti.",
    input_schema: { type: "object", properties: { id: { type: "string" }, progress: { type: "number" }, done: { type: "boolean" } }, required: ["id"] },
  },
];

const INTERVIEW_TOOLS = [
  TOOLS.find((t) => t.name === "remember"),
  {
    name: "finish_interview",
    description: "Chiude l'intervista iniziale. profile: profilo completo e dettagliato della persona (testo, in terza persona, organizzato per aree: chi è, giornata tipo e orari, lavoro, sonno, sport/fisico, alimentazione, studio, lingue, abitudini da cambiare, soldi, relazioni e date, casa, progetti, obiettivi, cosa la motiva e cosa la fa mollare, preferenze sul coach).",
    input_schema: { type: "object", properties: { profile: { type: "string" }, name: { type: "string" } }, required: ["profile"] },
  },
];

const WEB_SEARCH = { type: "web_search_20250305", name: "web_search", max_uses: 3, user_location: { type: "approximate", country: "IT", timezone: "Europe/Rome" } };

async function execTool(uid, ctx, name, input, effects) {
  const tz = ctx.tz;
  switch (name) {
    case "log_entries": {
      const out = await addLogs(uid, tz, input.entries || []);
      effects.push({ type: "logs", count: out.length });
      // Primo giorno senza sigarette / sotto il limite: gestito nei report
      return { ok: true, saved: out.map((l) => `${l.type} ${l.value ?? ""}${l.unit ? " " + l.unit : ""} ${l.note || ""}`.trim()) };
    }
    case "set_activity_status": {
      const r = await setItemStatus(uid, { date: input.date, itemId: input.activity_id, status: input.status, rating: input.rating, note: input.note, reason: input.reason, snoozeMinutes: input.snooze_minutes });
      effects.push({ type: "status", ...r });
      return { ok: true, item: r.item.title, points: r.points };
    }
    case "add_task": {
      const t = await addTask(uid, input);
      effects.push({ type: "task", task: t });
      return { ok: true, id: t.id, task: t };
    }
    case "update_task": {
      const { id, ...f } = input;
      const t = await updateTask(uid, id, f);
      effects.push({ type: "task", task: t });
      return { ok: true, task: t };
    }
    case "delete_task":
      await deleteTask(uid, input.id);
      effects.push({ type: "task" });
      return { ok: true };
    case "edit_routine": {
      const p = await editRoutine(uid, input.ops || []);
      effects.push({ type: "routine" });
      return { ok: true, routine: p.routine.map((a) => `[${a.id}] ${a.title} ${a.start} giorni ${a.days.join(",")}`) };
    }
    case "propose_routine_changes": {
      const pr = await addProposal(uid, input);
      effects.push({ type: "proposal", proposal: pr });
      return { ok: true, note: "Proposta mostrata nell'app, in attesa di approvazione." };
    }
    case "get_plan_section": {
      const plan = await getJSON(K.plan(uid), defaultPlan);
      return plan[input.section] ?? null;
    }
    case "update_plan_section": {
      if (!SECTION_NAMES.includes(input.section)) throw new Error("Sezione non valida");
      let data = input.data;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch {}
      }
      const plan = await getJSON(K.plan(uid), defaultPlan);
      const next = normPlan({ ...plan, [input.section]: data }, plan);
      await setJSON(K.plan(uid), next);
      effects.push({ type: "plan", section: input.section });
      return { ok: true };
    }
    case "get_stats": {
      const days = Math.min(90, Math.max(1, Number(input.days) || 7));
      const to = ctx.now.date;
      const from = addDays(to, -(days - 1));
      let logs = await logsSince(uid, from, to);
      const sum = summarizeLogs(logs, ctx.plan, from, to);
      if (input.types?.length) logs = logs.filter((l) => input.types.includes(l.type));
      return { summary: sum, logs: logs.slice(-150).map(({ id, ts, ...l }) => l) };
    }
    case "remember": {
      const add = await remember(uid, input.facts);
      effects.push({ type: "memory", count: add.length });
      return { ok: true, saved: add.length };
    }
    case "forget":
      await forget(uid, input.id);
      effects.push({ type: "memory" });
      return { ok: true };
    case "set_day_off":
      await setDayOff(uid, input.on);
      effects.push({ type: "dayoff", on: !!input.on });
      return { ok: true };
    case "add_challenge": {
      const ws = weekStart(ctx.now.date);
      const ch = { id: "s" + Math.random().toString(36).slice(2, 8), title: String(input.title).slice(0, 100), week: ws, target: Number(input.target) || 1, progress: 0, done: false, points: Number(input.points) || 30 };
      await update(K.plan(uid), defaultPlan, (p) => {
        p.challenges = [...(p.challenges || []), ch];
        return p;
      });
      effects.push({ type: "challenge", challenge: ch });
      return { ok: true, id: ch.id };
    }
    case "update_challenge": {
      let award = 0;
      await update(K.plan(uid), defaultPlan, (p) => {
        const c = (p.challenges || []).find((x) => x.id === input.id);
        if (!c) throw new Error("Sfida non trovata");
        if (input.progress !== undefined) c.progress = Number(input.progress);
        if ((input.done || c.progress >= c.target) && !c.done) {
          c.done = true;
          award = c.points || 30;
        }
        return p;
      });
      if (award) await addPoints(uid, award, "Sfida completata");
      effects.push({ type: "challenge" });
      return { ok: true, points: award };
    }
    case "finish_interview": {
      await update(K.profile(uid), defaultProfile, (p) => {
        p.summary = String(input.profile || "").slice(0, 12000);
        if (input.name && !p.name) p.name = String(input.name).slice(0, 60);
        p.onboardingStep = "generating";
        return p;
      });
      effects.push({ type: "interview_done" });
      return { ok: true, note: "Profilo salvato. L'app ora genera il piano: di' alla persona che ci vogliono un paio di minuti." };
    }
    default:
      throw new Error("Strumento sconosciuto: " + name);
  }
}

// Converte la cronologia in messaggi validi per l'API (alternanza user/assistant).
function historyToMessages(history, limit = 30) {
  const msgs = [];
  for (const m of history.slice(-limit)) {
    if (!m.text) continue;
    const role = m.role === "user" ? "user" : "assistant";
    const text = m.role === "coach_push" ? `[notifica inviata alle ${new Date(m.ts).toISOString().slice(11, 16)} UTC] ${m.text}` : m.text;
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += "\n\n" + text;
    else msgs.push({ role, content: text });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

export async function runLoop({ system, messages, tools, model, maxTokens = 1500, exec, maxIters = 6, deadline = Date.now() + 50000, toolChoice }) {
  const client = anthropic();
  const msgs = [...messages];
  const texts = [];
  let useTools = tools;
  for (let i = 0; i < maxIters; i++) {
    let res;
    const params = { model, max_tokens: maxTokens, system, messages: msgs, tools: useTools };
    if (toolChoice && i === 0) params.tool_choice = toolChoice;
    try {
      res = await client.messages.create(params);
    } catch (e) {
      // Se la ricerca web non è disponibile riprova senza.
      if (useTools.some((t) => t.type === WEB_SEARCH.type) && e?.status === 400) {
        useTools = useTools.filter((t) => t.type !== WEB_SEARCH.type);
        i--;
        continue;
      }
      throw e;
    }
    msgs.push({ role: "assistant", content: res.content });
    const t = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (t) texts.push(t);
    if (res.stop_reason === "pause_turn") continue;
    const uses = res.content.filter((b) => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) break;
    const results = [];
    for (const u of uses) {
      let out;
      try {
        out = await exec(u.name, u.input || {});
      } catch (e) {
        out = { error: String(e?.message || e) };
      }
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out ?? null).slice(0, 12000), ...(out?.error ? { is_error: true } : {}) });
    }
    msgs.push({ role: "user", content: results });
    if (Date.now() > deadline) break;
  }
  return { text: texts.join("\n\n").trim(), messages: msgs };
}

// Conversazione principale.
export async function coachReply(uid, { message, voice = false, activity = null, craving = false, start = false }) {
  const ctx = await buildContext(uid);
  const interview = ctx.profile.onboardingStep === "interview";
  const history = await getJSON(K.chat(uid), []);
  let userText = String(message || "").trim();
  if (start && interview && !userText) userText = "(Ho finito le schede veloci. Iniziamo l'intervista.)";
  if (craving && !userText) userText = "Ho voglia di fumare adesso.";
  if (!userText) throw new Error("Messaggio vuoto");
  const messages = historyToMessages(history);
  messages.push({ role: "user", content: userText });
  const effects = [];
  const system = systemPrompt(ctx, { voice, activity, interview, craving });
  const tools = interview ? INTERVIEW_TOOLS : [...TOOLS, WEB_SEARCH];
  const { text } = await runLoop({
    system,
    messages,
    tools,
    model: MODEL_CHAT(),
    maxTokens: voice ? 600 : 1500,
    exec: (n, i) => execTool(uid, ctx, n, i, effects),
  });
  const reply = text || (effects.length ? "Fatto." : "Ok.");
  const toSave = [];
  if (!(start && interview && !message)) toSave.push({ role: "user", text: userText, voice: !!voice, kind: interview ? "interview" : craving ? "craving" : undefined });
  toSave.push({ role: "assistant", text: reply, kind: interview ? "interview" : undefined });
  const saved = await appendChat(uid, toSave);
  return { reply, effects, messages: saved, interviewDone: effects.some((e) => e.type === "interview_done") };
}

// ----- Generazione del piano completo (job in background) -----
const PLAN_TOOL = {
  name: "save_plan",
  description: "Salva il piano di vita completo e personalizzato.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "Profilo aggiornato della persona (testo dettagliato per aree)." },
      message: { type: "string", description: "Messaggio di presentazione del piano alla persona, nel tono scelto: cosa hai costruito e perché, in 6-10 frasi." },
      routine: {
        type: "array",
        description: "Routine settimanale completa. Ogni attività: {title, category, days [1=lun..7=dom], start HH:MM, end HH:MM, kind, workoutId, language, notes, nag, points}. Includi: briefing mattutino (kind morning, category sveglia, all'ora di sveglia, end null), lavoro/studio fissi, allenamenti (kind workout con workoutId), blocchi di studio/tesi/lingue (kind language con language per le lingue), progetti, pasti se utile, uscite/vita sociale/coppia, faccende, bilancio della sera (kind checkin, category checkin), stop schermi e sonno. Non sovrapporre attività. Durate realistiche. Orari dopo mezzanotte (es. andare a letto alle 00:00): mettili nei days del giorno in cui cominciano dopo la mezzanotte, oppure usa 23:59 se l'attività è legata alla sera prima.",
        items: { type: "object" },
      },
      workouts: { type: "array", items: { type: "object" }, description: "Schede di allenamento: [{id (es. w-a), name, focus, exercises:[{name,sets,reps,weight,rest,notes}]}]. Pesi iniziali prudenti o vuoti." },
      smoking: { type: "object", description: "Se fuma: {active:true, baseline (sigarette/giorno ora), pricePerPack, perPack, startDate (oggi), quitDate, steps:[{from YYYY-MM-DD, limit}]} secondo il ritmo scelto. Altrimenti {active:false}." },
      budget: { type: "object", description: "{currency, payday, monthlyIncome, categories:{cibo:..., uscite:..., trasporti:..., ...}, fixed:[{title, amount, day, saving}], savingsGoal:{title,target,deadline,monthly}}" },
      study: { type: "object", description: "{exams:[{name,date,topics:[{title,done}]}], thesis:{title,deadline,weeklyPages,chapters:[{title,done,paragraphs:[{title,done}]}]} oppure thesis:null}" },
      goals: { type: "array", items: { type: "object" }, description: "3-7 obiettivi a lungo termine: {title, area, deadline, why, milestones:[{title,done:false}]} (4-6 tappe ciascuno)" },
      importantDates: { type: "array", items: { type: "object" }, description: "[{title, date YYYY-MM-DD, yearly, person}]" },
      water: { type: "object", description: "{enabled, everyHours, from, to, days}" },
      languages: { type: "array", items: { type: "object" }, description: "[{code (en, es...), name, level (A1..C2), goal, focus:[...]}]" },
      challenges: { type: "array", items: { type: "object" }, description: "2 sfide per questa settimana: [{title, target, points}]" },
      tasks: { type: "array", items: { type: "object" }, description: "Impegni singoli già noti: [{title, date, start, end, category, area, location, notes, priority, deadline}]" },
    },
    required: ["summary", "message", "routine"],
  },
};

export async function generatePlan(uid) {
  const ctx = await buildContext(uid);
  const history = await getJSON(K.chat(uid), []);
  const interview = history.filter((m) => m.kind === "interview").map((m) => `${m.role === "user" ? "PERSONA" : "COACH"}: ${m.text}`).join("\n");
  const memory = await getJSON(K.memory(uid), []);
  const today = ctx.now.date;
  const system = `Sei Coach Life, un coach di vita esperto (organizzazione del tempo, allenamento, studio, finanze personali, abitudini). Devi costruire il piano di vita completo e su misura di una persona, partendo dalle sue risposte e dall'intervista. Il piano deve essere REALISTICO e sostenibile (non riempire ogni minuto, lascia margini e tempo libero), rispettare orari di lavoro, spostamenti e sonno, mettere al primo posto le scadenze vicine e gli obiettivi più importanti, e includere tempo per relazioni e uscite. Tutto in italiano. Oggi è ${itDate(today)} (${today}). Tono del coach scelto: ${ctx.profile.settings?.tone || "severo"}. Chiama save_plan una volta sola con tutto il piano.`;
  const user = `RISPOSTE ALLE SCHEDE:\n${JSON.stringify(ctx.profile.answers, null, 1)}\n\nPROFILO DALL'INTERVISTA:\n${ctx.profile.summary}\n\nMEMORIA:\n${memory.map((m) => "- " + m.text).join("\n")}\n\nTRASCRIZIONE INTERVISTA:\n${interview.slice(-30000)}`;
  let saved = null;
  await runLoop({
    system,
    messages: [{ role: "user", content: user }],
    tools: [PLAN_TOOL],
    toolChoice: { type: "tool", name: "save_plan" },
    model: MODEL_SMART(),
    maxTokens: 16000,
    maxIters: 1,
    deadline: Date.now() + 14 * 60000,
    exec: async (name, input) => {
      if (name !== "save_plan") throw new Error("solo save_plan");
      saved = input;
      return { ok: true };
    },
  });
  if (!saved) throw new Error("Il piano non è stato generato");
  await applyGeneratedPlan(uid, saved, today);
  return saved;
}

export async function applyGeneratedPlan(uid, saved, today) {
  const cur = await getJSON(K.plan(uid), defaultPlan);
  const ws = weekStart(today);
  const plan = normPlan(
    {
      routine: saved.routine || [],
      workouts: saved.workouts || [],
      smoking: saved.smoking?.active ? { ...saved.smoking, startDate: saved.smoking.startDate || today } : saved.smoking || cur.smoking,
      budget: saved.budget || cur.budget,
      study: saved.study || cur.study,
      goals: saved.goals || [],
      importantDates: saved.importantDates || [],
      water: saved.water || cur.water,
      languages: saved.languages || [],
      challenges: (saved.challenges || []).map((c) => ({ ...c, week: ws })),
      tasks: [...(cur.tasks || []), ...(saved.tasks || [])],
    },
    cur
  );
  plan.status = "draft";
  await setJSON(K.plan(uid), plan);
  await update(K.profile(uid), defaultProfile, (p) => {
    if (saved.summary) p.summary = String(saved.summary).slice(0, 12000);
    p.onboardingStep = "review";
    return p;
  });
  await appendChat(uid, [{ role: "assistant", text: saved.message || "Il tuo piano è pronto. Dai un'occhiata e approvalo.", kind: "plan" }]);
}

// ----- Report settimanale e mensile -----
export async function generateReport(uid, kind = "weekly") {
  const ctx = await buildContext(uid);
  const today = ctx.now.date;
  const from = kind === "monthly" ? today.slice(0, 7) + "-01" : addDays(today, -6);
  const logs = await logsSince(uid, from, today);
  const sum = summarizeLogs(logs, ctx.plan, from, today);
  const sav = smokingSavings(ctx.plan, logs, from, today);
  // Attività fatte/saltate nel periodo
  let planned = 0, done = 0, skipped = 0;
  const diary = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const day = await getJSON(K.day(uid, d), null);
    const items = itemsForDate(ctx.plan, d);
    planned += items.length;
    if (day) {
      done += items.filter((i) => day.items[i.id]?.status === "done").length;
      skipped += items.filter((i) => day.items[i.id]?.status === "skipped").length;
      if (day.checkin) diary.push({ date: d, ...day.checkin });
    }
  }
  const system = `Sei Coach Life. Scrivi il ${kind === "monthly" ? "resoconto di fine mese" : "report della settimana"} per la persona, nel tono scelto (${ctx.profile.settings?.tone || "severo"}). Struttura: un titolo breve; poi sezioni brevi in markdown: "Com'è andata" (2-3 frasi oneste), "I numeri" (elenco puntato con i dati principali: attività fatte, sigarette vs limite e soldi risparmiati, studio, allenamenti, sonno, spese vs budget, risparmio), "Bene" (max 3 punti), "Da migliorare" (max 3 punti), "Prossimo passo" (1-2 azioni concrete). Se vedi attività saltate spesso, proponi una modifica alla routine con propose_routine_changes. Proponi 1-2 sfide per la prossima settimana con add_challenge (solo nel report settimanale). Chiudi chiamando save_report.`;
  const user = `CONTESTO:\n${ctx.text}\n\nPERIODO ${from} → ${today}\nAttività: pianificate ${planned}, fatte ${done}, saltate ${skipped}.\nStatistiche: ${JSON.stringify(sum)}\nRisparmio fumo nel periodo: ${JSON.stringify(sav)}\nDiario serale: ${JSON.stringify(diary).slice(0, 6000)}`;
  let report = null;
  const effects = [];
  const tools = [
    TOOLS.find((t) => t.name === "propose_routine_changes"),
    TOOLS.find((t) => t.name === "add_challenge"),
    { name: "save_report", description: "Salva il report.", input_schema: { type: "object", properties: { title: { type: "string" }, text: { type: "string", description: "markdown" }, notification: { type: "string", description: "frase breve per la notifica" } }, required: ["title", "text"] } },
  ];
  await runLoop({
    system,
    messages: [{ role: "user", content: user }],
    tools,
    model: MODEL_SMART(),
    maxTokens: 4000,
    maxIters: 5,
    deadline: Date.now() + 10 * 60000,
    exec: async (name, input) => {
      if (name === "save_report") {
        report = input;
        return { ok: true };
      }
      return execTool(uid, ctx, name, input, effects);
    },
  });
  if (!report) throw new Error("Report non generato");
  const entry = { id: "rep" + Date.now().toString(36), kind, from, to: today, title: report.title, text: report.text, ts: Date.now() };
  await update(K.reports(uid), [], (list) => [entry, ...list].slice(0, 40));
  await appendChat(uid, [{ role: "assistant", text: `📊 ${report.title}\n\n${report.text}`, kind: "report" }]);
  return { entry, notification: report.notification };
}

// ----- Adattamento: proposta di modifiche se salta spesso qualcosa -----
export async function generateAdapt(uid) {
  const ctx = await buildContext(uid);
  const insights = await skipInsights(uid, ctx.plan, ctx.now.date);
  const pending = await getJSON(K.pending(uid), []);
  if (!insights.length || pending.length) return null;
  const effects = [];
  const system = `Sei Coach Life. La persona salta spesso alcune attività. Analizza perché (orari, stanchezza, motivi indicati) e proponi UNA modifica intelligente alla routine con propose_routine_changes (spostare orario/giorno, accorciare, dividere, sostituire). La summary deve essere chiara e breve (2-3 frasi, tono ${ctx.profile.settings?.tone || "severo"}).`;
  await runLoop({
    system,
    messages: [{ role: "user", content: `CONTESTO:\n${ctx.text}\n\nATTIVITÀ PROBLEMATICHE:\n${JSON.stringify(insights)}` }],
    tools: [TOOLS.find((t) => t.name === "propose_routine_changes")],
    model: MODEL_SMART(),
    maxTokens: 2000,
    maxIters: 2,
    exec: (n, i) => execTool(uid, ctx, n, i, effects),
  });
  const prop = effects.find((e) => e.type === "proposal")?.proposal;
  if (prop) await appendChat(uid, [{ role: "assistant", text: `Ho notato una cosa: ${prop.summary}\nTrovi la proposta in home, approvala o rifiutala.`, kind: "proposal" }]);
  return prop;
}

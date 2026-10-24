// Lingue: parola del giorno, flashcard, quiz settimanale, frasi utili.
import { userFrom } from "../lib/auth.mjs";
import { getJSON, update, K, shortId } from "../lib/db.mjs";
import { json, fail, body } from "../lib/http.mjs";
import { nowParts, addDays, weekStart } from "../lib/time.mjs";
import { defaultPlan, defaultProfile, addPoints, addLogs } from "../lib/plan.mjs";
import { anthropic, MODEL_CHAT } from "../lib/coach.mjs";
import { snapshot } from "../lib/snapshot.mjs";

const BOX_DAYS = [0, 1, 2, 4, 8, 16];

async function generate(schemaName, schema, prompt) {
  const tools = [{ name: schemaName, description: "Restituisce il contenuto richiesto.", input_schema: schema }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropic().messages.create({
      model: MODEL_CHAT(),
      max_tokens: 4000,
      tools,
      messages: [{ role: "user", content: `${prompt}\n\nRispondi SOLO chiamando lo strumento "${schemaName}".` }],
    });
    const u = res.content.find((b) => b.type === "tool_use" && b.name === schemaName);
    if (u) return u.input;
    // ultima possibilità: JSON scritto nel testo
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {}
    }
  }
  throw new Error("Contenuto non generato, riprova");
}

function langInfo(plan, code) {
  return (plan.languages || []).find((l) => l.code === code) || { code, name: code, level: "A2", goal: "" };
}

export default async (req) => {
  if (req.method !== "POST") return fail("Metodo non permesso", 405);
  const uid = await userFrom(req);
  if (!uid) return fail("Non autenticato", 401);
  const b = await body(req);
  try {
    const [profile, plan] = await Promise.all([getJSON(K.profile(uid), defaultProfile), getJSON(K.plan(uid), defaultPlan)]);
    const now = nowParts(profile.tz);
    const L = langInfo(plan, b.lang || plan.languages?.[0]?.code || "en");
    const who = `Studente italiano, livello ${L.level} in ${L.name}${L.goal ? `, obiettivo: ${L.goal}` : ""}${L.focus?.length ? `, focus: ${L.focus.join(", ")}` : ""}.`;
    const learn = await getJSON(K.learn(uid), {});
    const cur = learn[L.code] || { deck: [] };
    let extra = {};

    if (b.kind === "word") {
      if (!cur.word || cur.word.date !== now.date || b.refresh) {
        const recent = (cur.deck || []).slice(-60).map((c) => c.front).join(", ");
        const w = await generate(
          "word",
          { type: "object", properties: { word: { type: "string" }, translation: { type: "string" }, pronunciation: { type: "string", description: "pronuncia semplificata per italiani" }, example: { type: "string" }, exampleIt: { type: "string" }, tip: { type: "string", description: "uso o curiosità in una riga, in italiano" } }, required: ["word", "translation", "example", "exampleIt"] },
          `${who} Scegli la "parola o espressione del giorno" in ${L.name}, utile nella vita quotidiana e adatta al livello. Non ripetere queste: ${recent || "nessuna"}.`
        );
        cur.word = { ...w, date: now.date };
        cur.deck = [...(cur.deck || []), { id: shortId("k"), front: w.word, back: `${w.translation} — ${w.example}`, box: 0, due: now.date }];
      }
    } else if (b.kind === "phrases") {
      if (!cur.phrases || b.refresh) {
        const p = await generate(
          "phrases",
          { type: "object", properties: { groups: { type: "array", items: { type: "object", properties: { situation: { type: "string" }, phrases: { type: "array", items: { type: "object", properties: { text: { type: "string" }, it: { type: "string" }, pronunciation: { type: "string" } }, required: ["text", "it"] } } }, required: ["situation", "phrases"] } } }, required: ["groups"] },
          `${who} Crea 6 situazioni pratiche (es. ${L.goal ? "legate all'obiettivo: " + L.goal + ", " : ""}ristorante, trasporti, negozi, fare amicizia, lavoro/scuola, emergenze) con 6 frasi utili ciascuna in ${L.name}, con traduzione italiana e pronuncia semplificata.`
        );
        cur.phrases = { ts: Date.now(), groups: p.groups };
      }
    } else if (b.kind === "quiz") {
      const ws = weekStart(now.date);
      if (!cur.quiz || cur.quiz.week !== ws || b.refresh) {
        const q = await generate(
          "quiz",
          { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: { q: { type: "string" }, options: { type: "array", items: { type: "string" } }, answer: { type: "number", description: "indice 0-based dell'opzione giusta" }, explain: { type: "string" } }, required: ["q", "options", "answer", "explain"] } } }, required: ["questions"] },
          `${who} Crea il quiz settimanale di livello: 10 domande a scelta multipla (4 opzioni) in ${L.name} di difficoltà crescente (grammatica, lessico, comprensione di brevi frasi), spiegazioni in italiano. Parole recenti studiate: ${(cur.deck || []).slice(-20).map((c) => c.front).join(", ")}.`
        );
        cur.quiz = { week: ws, questions: q.questions, result: null };
      }
    } else if (b.kind === "quizResult") {
      if (cur.quiz) {
        cur.quiz.result = { score: Number(b.score) || 0, total: cur.quiz.questions.length, ts: Date.now() };
        await addPoints(uid, 5 + Math.round((Number(b.score) || 0) * 2), `Quiz ${L.name}`);
        await addLogs(uid, profile.tz, [{ type: "lingua", value: 10, unit: "min", category: L.name, note: `Quiz: ${b.score}/${cur.quiz.questions.length}` }]);
      }
    } else if (b.kind === "moreCards") {
      const existing = (cur.deck || []).map((c) => c.front).join(", ");
      const c = await generate(
        "cards",
        { type: "object", properties: { cards: { type: "array", items: { type: "object", properties: { front: { type: "string" }, back: { type: "string" } }, required: ["front", "back"] } } }, required: ["cards"] },
        `${who} Crea 10 flashcard utili in ${L.name} (fronte: parola o frase in ${L.name}; retro: traduzione italiana + mini esempio). ${b.topic ? "Tema: " + b.topic + "." : ""} Evita: ${existing.slice(0, 1500)}.`
      );
      cur.deck = [...(cur.deck || []), ...c.cards.map((x) => ({ id: shortId("k"), front: x.front, back: x.back, box: 0, due: now.date }))];
    } else if (b.kind === "addCard") {
      cur.deck = [...(cur.deck || []), { id: shortId("k"), front: String(b.front || "").slice(0, 120), back: String(b.back || "").slice(0, 300), box: 0, due: now.date }];
    } else if (b.kind === "review") {
      const card = (cur.deck || []).find((c) => c.id === b.cardId);
      if (card) {
        card.box = b.correct ? Math.min(5, (card.box || 0) + 1) : 0;
        card.due = addDays(now.date, BOX_DAYS[card.box]);
        cur.reviewed = (cur.reviewed?.date === now.date ? cur.reviewed : { date: now.date, n: 0 });
        cur.reviewed.n++;
        if (cur.reviewed.n === 10) {
          await addPoints(uid, 5, `10 flashcard ${L.name}`);
          await addLogs(uid, profile.tz, [{ type: "lingua", value: 5, unit: "min", category: L.name, note: "Flashcard" }]);
        }
      }
    } else if (b.kind === "deleteCard") {
      cur.deck = (cur.deck || []).filter((c) => c.id !== b.cardId);
    } else {
      return fail("Tipo sconosciuto");
    }
    await update(K.learn(uid), {}, (all) => ({ ...all, [L.code]: cur }));
    return json({ ok: true, ...extra, state: await snapshot(uid) });
  } catch (e) {
    console.error("learn error", e);
    return fail(e.message || "Errore", 500);
  }
};

export const config = { path: "/api/learn", method: ["POST"] };

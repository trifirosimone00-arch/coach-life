// Trasforma un messaggio vocale in testo con Gemini (tramite Netlify AI Gateway).
import { GoogleGenAI } from "@google/genai";
import { userFrom } from "../lib/auth.mjs";
import { json, fail, env } from "../lib/http.mjs";

const PROMPT =
  "Trascrivi esattamente questo messaggio vocale in italiano (può contenere parole in inglese o spagnolo). " +
  "È rivolto a un coach personale: routine, palestra, studio, tesi, lingue, sigarette, spese, commissioni, appuntamenti. " +
  "Restituisci SOLO il testo trascritto, senza virgolette né commenti. Se non si sente niente, restituisci una stringa vuota.";

// Tipi audio da provare: quello originale e un'alternativa compatibile.
function mimeCandidates(type) {
  const t = (type || "").split(";")[0].trim().toLowerCase();
  if (t.includes("mp4") || t.includes("m4a") || t.includes("aac")) return ["audio/mp4", "audio/aac"];
  if (t.includes("webm")) return ["audio/webm", "audio/ogg"];
  if (t.includes("ogg")) return ["audio/ogg"];
  if (t.includes("wav")) return ["audio/wav"];
  if (t.includes("mpeg") || t.includes("mp3")) return ["audio/mp3"];
  return [t || "audio/webm"];
}

export default async (req) => {
  if (req.method !== "POST") return fail("Metodo non permesso", 405);
  const uid = await userFrom(req);
  if (!uid) return fail("Non autenticato", 401);
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length < 1000) return fail("Audio troppo corto", 400);
  if (buf.length > 8_000_000) return fail("Audio troppo lungo (max ~3 minuti)", 400);
  const data = buf.toString("base64");
  const ai = new GoogleGenAI({});
  let lastErr;
  for (const mimeType of mimeCandidates(req.headers.get("content-type"))) {
    try {
      const res = await ai.models.generateContent({
        model: env("TRANSCRIBE_MODEL", "gemini-2.5-flash"),
        contents: [{ role: "user", parts: [{ inlineData: { mimeType, data } }, { text: PROMPT }] }],
        config: { temperature: 0 },
      });
      const text = (res.text || "").trim().replace(/^["“]|["”]$/g, "");
      return json({ text });
    } catch (e) {
      lastErr = e;
      console.error("transcribe error", mimeType, e?.status, e?.message);
    }
  }
  return fail("Non sono riuscito a capire l'audio, riprova o scrivi.", 500);
};

export const config = { path: "/api/transcribe", method: ["POST"] };

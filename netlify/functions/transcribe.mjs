// Trasforma un messaggio vocale in testo.
import OpenAI, { toFile } from "openai";
import { userFrom } from "../lib/auth.mjs";
import { json, fail, env } from "../lib/http.mjs";

let client;

export default async (req) => {
  if (req.method !== "POST") return fail("Metodo non permesso", 405);
  const uid = await userFrom(req);
  if (!uid) return fail("Non autenticato", 401);
  try {
    const type = req.headers.get("content-type") || "audio/webm";
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length < 1000) return fail("Audio troppo corto", 400);
    if (buf.length > 4_000_000) return fail("Audio troppo lungo (max ~2 minuti)", 400);
    const ext = type.includes("mp4") || type.includes("m4a") || type.includes("aac") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
    if (!client) client = new OpenAI({ maxRetries: 1 });
    const file = await toFile(buf, `voce.${ext}`, { type: type.split(";")[0] });
    const res = await client.audio.transcriptions.create({
      file,
      model: env("TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe"),
      language: "it",
      prompt: "Messaggio vocale a un coach personale: routine, palestra, studio, tesi, spagnolo, inglese, sigarette, spese, commissioni, appuntamenti.",
    });
    return json({ text: (res.text || "").trim() });
  } catch (e) {
    console.error("transcribe error", e?.status, e?.message);
    return fail("Non sono riuscito a capire l'audio, riprova o scrivi.", 500);
  }
};

export const config = { path: "/api/transcribe", method: ["POST"] };

// Iscrizione alle notifiche e notifica di prova.
import { userFrom } from "../lib/auth.mjs";
import { json, fail, body } from "../lib/http.mjs";
import { saveSubscription, removeSubscription, sendPush, publicKey } from "../lib/push.mjs";

export default async (req) => {
  const uid = await userFrom(req);
  if (!uid) return fail("Non autenticato", 401);
  if (req.method === "GET") return json({ key: publicKey() });
  const b = await body(req);
  try {
    if (b.action === "subscribe") {
      await saveSubscription(uid, b.subscription);
      const n = await sendPush(uid, { body: "Notifiche attive 💪 Da adesso ti scrivo io.", tag: "welcome", url: "/" });
      return json({ ok: true, delivered: n });
    }
    if (b.action === "unsubscribe") {
      await removeSubscription(uid, b.endpoint);
      return json({ ok: true });
    }
    if (b.action === "test") {
      const n = await sendPush(uid, { body: "Notifica di prova: funziona.", tag: "test", url: "/" });
      return json({ ok: true, delivered: n });
    }
    return fail("Azione sconosciuta");
  } catch (e) {
    return fail(e.message || "Errore");
  }
};

export const config = { path: "/api/push", method: ["GET", "POST"] };

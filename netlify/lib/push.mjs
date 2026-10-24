import webpush from "web-push";
import { getJSON, setJSON, update, K } from "./db.mjs";
import { env } from "./http.mjs";

let configured = false;
function setup() {
  if (configured) return true;
  const pub = env("VAPID_PUBLIC_KEY");
  const priv = env("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return false;
  webpush.setVapidDetails(env("VAPID_SUBJECT", "mailto:coachlife@example.com"), pub, priv);
  configured = true;
  return true;
}

export function publicKey() {
  return env("VAPID_PUBLIC_KEY", "");
}

export async function saveSubscription(uid, sub) {
  if (!sub || !sub.endpoint) throw new Error("Iscrizione non valida");
  await update(K.push(uid), [], (list) => [sub, ...list.filter((s) => s.endpoint !== sub.endpoint)].slice(0, 5));
}

export async function removeSubscription(uid, endpoint) {
  await update(K.push(uid), [], (list) => list.filter((s) => s.endpoint !== endpoint));
}

// Invia una notifica a tutti i dispositivi dell'utente. Ritorna quanti l'hanno ricevuta.
export async function sendPush(uid, payload) {
  if (!setup()) return 0;
  const subs = await getJSON(K.push(uid), []);
  if (!subs.length) return 0;
  let ok = 0;
  const dead = [];
  const data = JSON.stringify({ title: "Coach Life", ...payload });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s, data, { TTL: 3600, urgency: "high" });
        ok++;
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(s.endpoint);
        else console.error("push error", e?.statusCode, e?.body || e?.message);
      }
    })
  );
  if (dead.length) await setJSON(K.push(uid), subs.filter((s) => !dead.includes(s.endpoint)));
  return ok;
}

// Archivio dati: Netlify Blobs, un documento JSON per ogni pezzo di stato dell'utente.
import { getStore } from "@netlify/blobs";

let _store;
function store() {
  if (!_store) _store = getStore({ name: "coachlife", consistency: "strong" });
  return _store;
}

export async function getJSON(key, fallback = null) {
  const v = await store().get(key, { type: "json" });
  return v === null || v === undefined ? (typeof fallback === "function" ? fallback() : structuredClone(fallback)) : v;
}

export async function setJSON(key, value) {
  await store().setJSON(key, value);
  return value;
}

export async function del(key) {
  await store().delete(key);
}

export async function update(key, fallback, fn) {
  const cur = await getJSON(key, fallback);
  const next = (await fn(cur)) ?? cur;
  await setJSON(key, next);
  return next;
}

export async function listKeys(prefix) {
  const { blobs } = await store().list({ prefix });
  return blobs.map((b) => b.key);
}

// Chiavi
export const K = {
  usersIndex: () => "index/users",
  email: (email) => `emails/${encodeURIComponent(email.toLowerCase())}`,
  session: (token) => `sessions/${token}`,
  account: (uid) => `users/${uid}/account`,
  profile: (uid) => `users/${uid}/profile`,
  plan: (uid) => `users/${uid}/plan`,
  day: (uid, date) => `users/${uid}/days/${date}`,
  logs: (uid, month) => `users/${uid}/logs/${month}`,
  chat: (uid) => `users/${uid}/chat`,
  memory: (uid) => `users/${uid}/memory`,
  push: (uid) => `users/${uid}/push`,
  game: (uid) => `users/${uid}/game`,
  pending: (uid) => `users/${uid}/pending`,
  learn: (uid) => `users/${uid}/learn`,
  reports: (uid) => `users/${uid}/reports`,
  job: (uid) => `users/${uid}/job`,
};

export function uid() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export function shortId(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}

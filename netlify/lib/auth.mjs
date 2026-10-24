import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getJSON, setJSON, del, update, K, uid as newUid } from "./db.mjs";
import { defaultProfile, defaultPlan, defaultGame } from "./plan.mjs";

const scryptAsync = promisify(scrypt);
const SESSION_DAYS = 120;

async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const key = await scryptAsync(password, salt, 64);
  return `${salt}:${key.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [salt, hex] = String(stored).split(":");
  if (!salt || !hex) return false;
  const key = await scryptAsync(password, salt, 64);
  const a = Buffer.from(hex, "hex");
  return a.length === key.length && timingSafeEqual(a, key);
}

function validEmail(e) {
  return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 200;
}

async function createSession(uid) {
  const token = randomBytes(32).toString("base64url");
  await setJSON(K.session(token), { uid, created: Date.now() });
  return token;
}

export async function register({ email, password, name }) {
  email = String(email || "").trim().toLowerCase();
  if (!validEmail(email)) throw new Error("Email non valida");
  if (!password || String(password).length < 6) throw new Error("La password deve avere almeno 6 caratteri");
  const existing = await getJSON(K.email(email));
  if (existing) throw new Error("Esiste già un account con questa email");
  const id = newUid();
  await setJSON(K.email(email), { uid: id });
  await setJSON(K.account(id), { uid: id, email, hash: await hashPassword(String(password)), created: Date.now() });
  const profile = defaultProfile();
  profile.name = String(name || "").trim().slice(0, 60);
  profile.email = email;
  await setJSON(K.profile(id), profile);
  await setJSON(K.plan(id), defaultPlan());
  await setJSON(K.game(id), defaultGame());
  await update(K.usersIndex(), [], (list) => (list.includes(id) ? list : [...list, id]));
  return { token: await createSession(id), uid: id };
}

export async function login({ email, password }) {
  email = String(email || "").trim().toLowerCase();
  const ref = await getJSON(K.email(email));
  if (!ref) throw new Error("Email o password sbagliate");
  const acc = await getJSON(K.account(ref.uid));
  if (!acc || !(await verifyPassword(String(password || ""), acc.hash))) throw new Error("Email o password sbagliate");
  return { token: await createSession(ref.uid), uid: ref.uid };
}

export async function logout(req) {
  const token = bearer(req);
  if (token) await del(K.session(token));
}

function bearer(req) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// Ritorna l'uid dell'utente autenticato o null.
export async function userFrom(req) {
  const token = bearer(req);
  if (!token || token.length < 20) return null;
  const s = await getJSON(K.session(token));
  if (!s) return null;
  if (Date.now() - s.created > SESSION_DAYS * 86400000) {
    await del(K.session(token));
    return null;
  }
  return s.uid;
}

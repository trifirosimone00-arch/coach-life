import { createHash } from "node:crypto";
import { env } from "./http.mjs";
import { setJSON, K } from "./db.mjs";

export function workerSecret() {
  const s = env("WORKER_SECRET");
  if (s) return s;
  return createHash("sha256").update("coachlife:" + (env("VAPID_PRIVATE_KEY") || "dev")).digest("hex");
}

// Avvia un lavoro lungo (piano, report) nella funzione in background.
export async function startJob(origin, uid, job, extra = {}) {
  await setJSON(K.job(uid), { job, status: "running", ts: Date.now() });
  const res = await fetch(`${origin}/api/worker`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-worker-secret": workerSecret() },
    body: JSON.stringify({ uid, job, ...extra }),
  });
  if (!res.ok && res.status !== 202) throw new Error("Impossibile avviare il lavoro: " + res.status);
}

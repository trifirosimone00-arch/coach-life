// Lavori lunghi in background: generazione del piano e report.
import { setJSON, K } from "../lib/db.mjs";
import { body } from "../lib/http.mjs";
import { generatePlan, generateReport, generateAdapt } from "../lib/coach.mjs";
import { sendPush } from "../lib/push.mjs";
import { workerSecret } from "../lib/jobs.mjs";

export default async (req) => {
  if (req.headers.get("x-worker-secret") !== workerSecret()) return;
  const b = await body(req);
  const { uid, job } = b;
  if (!uid) return;
  try {
    if (job === "plan") {
      await generatePlan(uid);
      await setJSON(K.job(uid), { job, status: "done", ts: Date.now() });
      await sendPush(uid, { body: "Il tuo piano è pronto. Aprilo e approvalo.", tag: "plan", url: "/" });
    } else if (job === "weekly" || job === "monthly") {
      const r = await generateReport(uid, job);
      await setJSON(K.job(uid), { job, status: "done", ts: Date.now() });
      await sendPush(uid, { body: r.notification || (job === "weekly" ? "Il report della settimana è pronto 📊" : "Il resoconto del mese è pronto 📊"), tag: job, url: "/#progressi" });
    } else if (job === "adapt") {
      const prop = await generateAdapt(uid);
      await setJSON(K.job(uid), { job, status: "done", ts: Date.now() });
      if (prop) await sendPush(uid, { body: "Ho una proposta per migliorare la tua routine. Dai un'occhiata.", tag: "adapt", url: "/" });
    }
  } catch (e) {
    console.error("worker error", job, e);
    await setJSON(K.job(uid), { job, status: "error", error: String(e?.message || e), ts: Date.now() });
  }
};

export const config = { path: "/api/worker", background: true };

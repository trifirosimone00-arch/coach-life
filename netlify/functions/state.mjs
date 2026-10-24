// Restituisce tutto quello che serve all'app per disegnare le schermate.
import { userFrom } from "../lib/auth.mjs";
import { json, fail } from "../lib/http.mjs";
import { snapshot } from "../lib/snapshot.mjs";

export default async (req) => {
  const uid = await userFrom(req);
  if (!uid) return fail("Non autenticato", 401);
  const date = new URL(req.url).searchParams.get("date");
  return json(await snapshot(uid, date));
};

export const config = { path: "/api/state", method: ["GET"] };

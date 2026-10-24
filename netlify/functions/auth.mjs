import { register, login, logout } from "../lib/auth.mjs";
import { json, fail, body } from "../lib/http.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return fail("Metodo non permesso", 405);
  const action = context.params.action;
  const b = await body(req);
  try {
    if (action === "register") return json(await register(b));
    if (action === "login") return json(await login(b));
    if (action === "logout") {
      await logout(req);
      return json({ ok: true });
    }
    return fail("Azione sconosciuta", 404);
  } catch (e) {
    return fail(e.message || "Errore", 400);
  }
};

export const config = { path: "/api/auth/:action" };

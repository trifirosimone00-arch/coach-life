export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function fail(message, status = 400) {
  return json({ error: message }, status);
}

export async function body(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export function env(name, fallback = undefined) {
  try {
    if (typeof Netlify !== "undefined" && Netlify.env) {
      const v = Netlify.env.get(name);
      if (v !== undefined && v !== "") return v;
    }
  } catch {}
  const v = process.env[name];
  return v !== undefined && v !== "" ? v : fallback;
}

export function siteUrl(req) {
  const u = env("URL");
  if (u) return u.replace(/\/$/, "");
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

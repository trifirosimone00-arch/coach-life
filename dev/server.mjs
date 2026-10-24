// Server di sviluppo locale: serve public/ e instrada /api/* alle funzioni Netlify.
// Uso: node dev/server.mjs  (con le librerie vere installate oppure con i mock locali)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8888);
process.env.URL = process.env.URL || `http://localhost:${PORT}`;
process.env.VAPID_PUBLIC_KEY ||= "BDevKeyForLocalTestingOnly";
process.env.VAPID_PRIVATE_KEY ||= "dev";

const fnDir = path.join(root, "netlify/functions");
const routes = [];
let cron = null;
for (const f of fs.readdirSync(fnDir)) {
  const mod = await import(pathToFileURL(path.join(fnDir, f)));
  const cfg = mod.config || {};
  if (cfg.schedule) cron = mod.default;
  for (const p of [].concat(cfg.path || [])) {
    const keys = [];
    const re = new RegExp("^" + p.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
    routes.push({ re, keys, mod, cfg });
  }
}

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, process.env.URL);
    if (url.pathname === "/__cron") {
      await cron?.(new Request(url));
      res.end("ok");
      return;
    }
    const r = routes.find((x) => x.re.test(url.pathname));
    if (r) {
      const m = url.pathname.match(r.re);
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
      try {
        if (r.cfg.background) {
          r.mod.default(request, { params }).catch((e) => console.error("bg", e));
          res.writeHead(202).end();
          return;
        }
        const out = await r.mod.default(request, { params });
        res.writeHead(out?.status || 200, Object.fromEntries(out?.headers || []));
        res.end(out ? Buffer.from(await out.arrayBuffer()) : "");
      } catch (e) {
        console.error(e);
        res.writeHead(500).end(String(e));
      }
      return;
    }
    let p = path.join(root, "public", url.pathname === "/" ? "index.html" : url.pathname);
    if (!p.startsWith(path.join(root, "public")) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, "public/index.html");
    res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
    fs.createReadStream(p).pipe(res);
  })
  .listen(PORT, () => console.log("Coach Life dev su " + process.env.URL));

/* Coach Life — base: stato, API, icone, voce, notifiche, fogli, chat. */
"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const store = {
  get(k, d = null) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

const S = {
  token: store.get("cl_token"),
  data: null,
  tab: "oggi",
  agendaDate: null,
  agendaView: "day",
  chatLocal: [],
  chatBusy: false,
  sheet: null,
  draft: null,
  obIndex: store.get("cl_ob_index", 0),
  obAnswers: store.get("cl_ob_answers", {}),
  learnLang: null,
  authMode: "register",
  voiceCtx: null,
  showAllChat: false,
};

// ---------- Utilità ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function attr(s) {
  return esc(s);
}
function md(text) {
  const lines = esc(text).split("\n");
  let html = "";
  let inList = false;
  for (let raw of lines) {
    let l = raw.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|\s)\*(\S.+?)\*(?=\s|$)/g, "$1<em>$2</em>");
    const li = l.match(/^\s*[-•*]\s+(.*)/);
    if (li) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${li[1]}</li>`;
      continue;
    }
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    const h = l.match(/^#{1,4}\s+(.*)/);
    if (h) html += `<h4>${h[1]}</h4>`;
    else if (l.trim()) html += `<p>${l}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}
function plainForSpeech(text) {
  return String(text || "")
    .replace(/\*\*|__|#+\s|`/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
const fmtEur = (n) => (Number(n) || 0).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " €";
const DOW_SHORT = ["", "lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const DOW_LONG = ["", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
function dowOf(date) {
  const d = new Date(date + "T12:00:00Z").getUTCDay();
  return d === 0 ? 7 : d;
}
function addDays(date, n) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
}
function itDate(date, withDow = true) {
  const [, m, d] = date.split("-").map(Number);
  return `${withDow ? DOW_LONG[dowOf(date)] + " " : ""}${d} ${MONTHS[m - 1]}`;
}
function toMin(h) {
  const m = String(h || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v < 240 ? v + 1440 : v; // dopo mezzanotte = fine serata
}
function nowMinutes() {
  if (!S.data?.now) return 0;
  const m = S.data.now.minutes + Math.floor((Date.now() - S.loadedAt) / 60000);
  return m < 240 ? m + 1440 : m;
}
function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  keys.slice(0, -1).forEach((k, i) => {
    if (o[k] == null) o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[k];
  });
  o[keys[keys.length - 1]] = value;
}
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

// ---------- Icone ----------
const P = {
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  today: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>',
  agenda: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  chart: '<path d="M5 19V11M12 19V5M19 19v-6"/>',
  lang: '<path d="M4 6h9M8.5 4v2M6 6c.5 3 2.5 5.5 5 7M11 6c-.5 3-2.5 5.5-5.5 7.5"/><path d="M13 20l3.5-8 3.5 8M14.2 17.5h4.6"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M8 5.5v13l10-6.5-10-6.5Z"/>',
  snooze: '<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 1.5M5 4 3 6M19 4l2 2"/>',
  skip: '<path d="M6 6l8 6-8 6V6ZM18 6v12"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  flame: '<path d="M12 21c3.5 0 6-2.4 6-5.8 0-3.7-3-5.7-4-9.2-2.3 1.6-3.4 3.9-3.3 6-1-.7-1.7-1.8-1.9-3C7.3 10.3 6 12.4 6 15.2 6 18.6 8.5 21 12 21Z"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  edit: '<path d="M5 19h4L19 9l-4-4L5 15v4Z"/>',
  speaker: '<path d="M5 10v4h3l4 4V6L8 10H5Z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  spark: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5 9 15M15 9l2.5-2.5"/>',
  coach: '<path d="M5 17.5V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9l-4 3.5v-2Z"/>',
};
function ic(name, extra = "") {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${P[name] || ""}</svg>`;
}

// ---------- Toast ----------
let toastT;
function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), ms);
}

// ---------- API ----------
async function api(path, { method = "GET", body, raw, headers = {} } = {}) {
  const opts = { method, headers: { ...headers } };
  if (S.token) opts.headers.authorization = "Bearer " + S.token;
  if (raw) opts.body = raw;
  else if (body !== undefined) {
    opts.headers["content-type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error("Sei offline o il server non risponde.");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (res.status === 401 && S.token) {
    logoutLocal();
    throw new Error("Sessione scaduta, accedi di nuovo.");
  }
  if (!res.ok) throw new Error(data?.error || `Errore ${res.status}`);
  return data;
}

function setData(d) {
  if (!d) return;
  S.data = d;
  S.loadedAt = Date.now();
  if (!S.learnLang && d.plan?.languages?.length) S.learnLang = d.plan.languages[0].code;
  render();
  renderSheet();
  updateBadge();
}

async function refresh() {
  if (!S.token) return render();
  try {
    const d = await api("/api/state" + (S.agendaDate ? "?date=" + S.agendaDate : ""));
    setData(d);
  } catch (e) {
    if (!S.data) {
      S.bootError = e.message;
      render();
    } else toast(e.message);
  }
}

async function act(type, payload = {}, { quiet = false } = {}) {
  try {
    const r = await api("/api/action", { method: "POST", body: { type, ...payload, viewDate: S.agendaDate } });
    if (r.state) setData(r.state);
    return r;
  } catch (e) {
    if (!quiet) toast(e.message);
    throw e;
  }
}

function logoutLocal() {
  S.token = null;
  S.data = null;
  store.del("cl_token");
  closeSheet();
  render();
}

function updateBadge() {
  if (!("setAppBadge" in navigator) || !S.data?.todayItems) return;
  const n = S.data.todayItems.filter((i) => i.kind !== "morning" && !["done", "skipped"].includes(i.state?.status)).length;
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

// ---------- Fogli ----------
function openSheet(name, props = {}) {
  S.sheet = { name, props };
  renderSheet();
}
function closeSheet() {
  if (S.sheet?.onClose) S.sheet.onClose();
  S.sheet = null;
  S.draft = null;
  S.voiceCtx = null;
  stopTimer();
  renderSheet();
}
function renderSheet() {
  const root = $("#sheet-root");
  if (!S.sheet || typeof SHEETS === "undefined" || !SHEETS[S.sheet.name]) {
    root.innerHTML = "";
    document.body.style.overflow = "";
    return;
  }
  const keepScroll = $(".sheet", root)?.scrollTop;
  const def = SHEETS[S.sheet.name];
  const full = def.full ? " full" : def.tall ? " tall" : "";
  root.innerHTML = `<div class="sheet-backdrop" data-act="closeSheet"></div><div class="sheet${full}" role="dialog" aria-modal="true"><div class="sheet-inner">${def.full ? "" : '<div class="grab"></div>'}${def.render(S.sheet.props)}</div></div>`;
  document.body.style.overflow = "hidden";
  const sh = $(".sheet", root);
  if (keepScroll && !S.sheet.resetScroll) sh.scrollTop = keepScroll;
  S.sheet.resetScroll = false;
  def.after?.(S.sheet.props);
  scrollThreads();
}

// ---------- Voce: registrazione ----------
const Voice = {
  rec: null,
  chunks: [],
  stream: null,
  startedAt: 0,
  tapMode: false,
  busy: false,
  async start() {
    if (this.rec || this.busy) return;
    unlockSpeech();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast("Il microfono non è disponibile su questo browser");
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast("Permetti l'uso del microfono per parlare al coach");
      return;
    }
    const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported?.(m));
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(250);
    this.startedAt = Date.now();
    if (!this.pressAt) this.tapMode = true; // rilasciato mentre chiedeva il permesso
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    showRecHint(true);
    $$(".mic").forEach((m) => m.classList.add("rec"));
  },
  async stop(send = true) {
    const rec = this.rec;
    if (!rec) return;
    this.rec = null;
    this.tapMode = false;
    $$(".mic").forEach((m) => m.classList.remove("rec"));
    showRecHint(false);
    const done = new Promise((r) => (rec.onstop = r));
    try {
      rec.stop();
    } catch {}
    await done;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const dur = Date.now() - this.startedAt;
    if (!send) return;
    if (dur < 700) {
      toast("Messaggio troppo corto");
      return;
    }
    const blob = new Blob(this.chunks, { type: rec.mimeType || "audio/webm" });
    this.busy = true;
    S.chatLocal = [{ role: "user", text: "🎙️ …", pending: true }];
    S.chatBusy = true;
    renderChatAreas();
    try {
      const r = await api("/api/transcribe", { method: "POST", raw: blob, headers: { "content-type": blob.type } });
      S.chatLocal = [];
      if (!r.text) throw new Error("Non ho sentito niente, riprova");
      await sendChat(r.text, { voice: true, force: true, ...(S.voiceCtx || {}) });
    } catch (e) {
      S.chatLocal = [];
      S.chatBusy = false;
      renderChatAreas();
      toast(e.message);
    } finally {
      this.busy = false;
    }
  },
};

function showRecHint(on) {
  let h = $("#rec-hint");
  if (!on) return h?.remove();
  if (!h) {
    h = document.createElement("div");
    h.id = "rec-hint";
    h.className = "rec-hint";
    document.body.appendChild(h);
  }
  h.innerHTML = `<i></i>${Voice.tapMode ? "Ti ascolto… tocca di nuovo per inviare" : "Ti ascolto… rilascia per inviare"}`;
}

// Tieni premuto per parlare; un tocco veloce avvia la modalità "tocca e parla".
document.addEventListener("pointerdown", (e) => {
  const mic = e.target.closest(".mic");
  if (!mic) return;
  e.preventDefault();
  if (Voice.rec) {
    Voice.stop(true);
    return;
  }
  Voice.pressAt = Date.now();
  Voice.start();
});
function micRelease() {
  if (!Voice.pressAt) return;
  const held = Date.now() - Voice.pressAt;
  Voice.pressAt = 0;
  if (!Voice.rec) return; // la registrazione sta ancora partendo: ci pensa start()
  if (held < 400) {
    Voice.tapMode = true;
    showRecHint(true);
    return;
  }
  Voice.stop(true);
}
document.addEventListener("pointerup", micRelease);

// Pulsante flottante del coach: tocco = apre la chat, pressione lunga = parla.
let fabTimer = null;
let fabHeld = false;
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest(".fab")) return;
  e.preventDefault();
  if (Voice.rec) {
    Voice.stop(true);
    return;
  }
  fabHeld = false;
  clearTimeout(fabTimer);
  fabTimer = setTimeout(() => {
    fabHeld = true;
    S.voiceCtx = null;
    openSheet("chat");
    Voice.pressAt = Date.now() - 400;
    Voice.start();
  }, 350);
});
document.addEventListener("pointerup", (e) => {
  if (!fabTimer) return;
  clearTimeout(fabTimer);
  fabTimer = null;
  if (!fabHeld && e.target.closest(".fab")) {
    openSheet("chat");
    setTimeout(() => $("#cmp-sheet")?.focus(), 250);
  }
});
document.addEventListener("pointercancel", micRelease);
document.addEventListener("contextmenu", (e) => e.target.closest(".mic") && e.preventDefault());

// ---------- Voce: lettura ad alta voce ----------
let speechUnlocked = false;
function unlockSpeech() {
  if (speechUnlocked || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
    speechUnlocked = true;
  } catch {}
}
function itVoices() {
  if (!("speechSynthesis" in window)) return [];
  return speechSynthesis.getVoices().filter((v) => (v.lang || "").toLowerCase().startsWith("it"));
}
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => S.sheet?.name === "settings" && renderSheet();

function speak(text, lang = "it-IT") {
  if (!("speechSynthesis" in window)) return;
  const set = S.data?.profile?.settings || {};
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(plainForSpeech(text));
  u.lang = lang;
  if (lang.startsWith("it")) {
    const vs = itVoices();
    const v = vs.find((x) => x.name === set.voiceName) || vs.find((x) => /premium|enhanced|neural/i.test(x.name)) || vs[0];
    if (v) u.voice = v;
  } else {
    const v = speechSynthesis.getVoices().find((x) => (x.lang || "").toLowerCase().startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
  }
  u.rate = Number(set.voiceRate) || 1.05;
  speechSynthesis.speak(u);
}

// ---------- Chat ----------
async function sendChat(text, opts = {}) {
  text = String(text || "").trim();
  if (!text && !opts.craving && !opts.start) return;
  if (S.chatBusy && !opts.force) return toast("Aspetta la risposta del coach");
  unlockSpeech();
  S.chatLocal = text ? [{ role: "user", text, voice: opts.voice }] : [];
  S.chatBusy = true;
  renderChatAreas();
  try {
    const r = await api("/api/chat", {
      method: "POST",
      body: { message: text, voice: !!opts.voice, activityId: opts.activityId, craving: !!opts.craving, start: !!opts.start, viewDate: S.agendaDate },
    });
    S.chatLocal = [];
    S.chatBusy = false;
    setData(r.state);
    const mode = S.data?.profile?.settings?.voiceReply || "auto";
    if (mode === "sempre" || (mode === "auto" && opts.voice)) speak(r.reply);
    const types = new Set((r.effects || []).map((e) => e.type));
    if (types.has("task")) toast("Agenda aggiornata");
    else if (types.has("routine")) toast("Routine aggiornata");
    else if (types.has("proposal")) toast("Nuova proposta in home");
    return r;
  } catch (e) {
    S.chatLocal = text ? [{ role: "user", text, failed: true }] : [];
    S.chatBusy = false;
    renderChatAreas();
    toast(e.message);
  }
}

function msgHtml(m) {
  const cls = m.role === "user" ? "user" : m.role === "coach_push" ? "push" : "coach";
  const time = m.ts ? new Date(m.ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
  const body = m.role === "user" ? esc(m.text) : md(m.text);
  const meta = m.failed ? "Non inviato · tocca per riprovare" : m.role === "coach_push" ? `Notifica · ${time}` : time;
  return `<div class="msg ${cls}"${m.failed ? ` data-act="retryChat" data-text="${attr(m.text)}"` : ""}>${m.voice ? "🎙️ " : ""}${body}${meta ? `<span class="meta">${meta}</span>` : ""}</div>`;
}

function threadHtml(limit = 40, filter) {
  let msgs = [...(S.data?.chat || [])];
  if (!filter && S.data?.profile?.onboarded) filter = (m) => m.kind !== "interview";
  if (filter) msgs = msgs.filter(filter);
  const hidden = Math.max(0, msgs.length - limit);
  msgs = msgs.slice(-limit);
  const local = S.chatLocal.map(msgHtml).join("");
  const typing = S.chatBusy ? '<div class="msg coach typing"><span>●</span><span>●</span><span>●</span></div>' : "";
  if (!msgs.length && !local && !typing)
    return `<div class="thread"><div class="msg coach">Scrivimi o tieni premuto il microfono e parlami: cosa devi fare, cosa hai fatto, cosa ti blocca. Ci penso io.</div></div>`;
  return `<div class="thread">${hidden ? `<button class="link small" data-act="moreChat" style="align-self:center">Messaggi precedenti</button>` : ""}${msgs.map(msgHtml).join("")}${local}${typing}</div>`;
}

function renderChatAreas() {
  $$("[data-thread]").forEach((el) => {
    const limit = Number(el.dataset.thread) || 20;
    const filter = el.dataset.thread === "home" || el.dataset.hide === "interview" ? (m) => m.kind !== "interview" : null;
    el.innerHTML = threadHtml(S.showAllChat ? 300 : limit, filter);
  });
  scrollThreads();
}
function scrollThreads() {
  requestAnimationFrame(() => {
    $$("[data-thread]").forEach((el) => {
      if (el.dataset.scroll === "self") el.scrollTop = el.scrollHeight;
    });
    if (S.tab === "oggi" && $("[data-thread='home']") && S.autoScroll) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      S.autoScroll = false;
    }
  });
}

function composerHtml({ id = "main", placeholder = "Scrivi al coach…", noTabs = false } = {}) {
  return `<div class="dock${noTabs ? " no-tabs" : ""}"><div class="dock-inner">
    <div class="composer"><textarea rows="1" id="cmp-${id}" data-composer="${id}" placeholder="${attr(placeholder)}" enterkeyhint="send"></textarea>
    <button class="send hidden" data-act="send" data-cmp="${id}" aria-label="Invia">${ic("send")}</button></div>
    <button class="mic" aria-label="Tieni premuto per parlare al coach">${ic("mic")}</button>
  </div></div>`;
}

document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.matches("[data-composer]")) {
    t.style.height = "auto";
    t.style.height = Math.min(120, t.scrollHeight) + "px";
    const btn = t.parentElement.querySelector(".send");
    btn?.classList.toggle("hidden", !t.value.trim());
    const mic = t.closest(".dock-inner")?.querySelector(".mic");
    mic?.classList.toggle("hidden", !!t.value.trim());
  }
});
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (t.matches?.("[data-composer]") && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submitComposer(t.dataset.composer);
  }
});
function submitComposer(id) {
  const t = $(`#cmp-${id}`);
  if (!t) return;
  const text = t.value.trim();
  if (!text) return;
  t.value = "";
  t.style.height = "auto";
  t.dispatchEvent(new Event("input", { bubbles: true }));
  // fuori dalla home la conversazione si apre in un foglio
  if (id === "main" && S.tab !== "oggi" && !S.sheet) openSheet("chat");
  if (id === "main" && S.tab === "oggi" && S.data?.profile?.onboarded) S.autoScroll = true;
  sendChat(text, S.voiceCtx || {});
}

// ---------- Notifiche push ----------
function urlB64ToUint8(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function enablePush() {
  if (isIOS() && !isStandalone()) return openSheet("install");
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    toast("Questo browser non supporta le notifiche");
    return;
  }
  if (!S.data?.vapidKey) return toast("Notifiche non ancora configurate sul server");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return toast("Notifiche bloccate: attivale dalle impostazioni del telefono");
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(S.data.vapidKey) });
    await api("/api/push", { method: "POST", body: { action: "subscribe", subscription: sub.toJSON() } });
    toast("Notifiche attive");
    refresh();
  } catch (e) {
    toast("Non riesco ad attivare le notifiche: " + e.message);
  }
}

// ---------- Timer (modalità attività) ----------
let timerInt = null;
function startTimer(fromTs) {
  stopTimer();
  const tick = () => {
    const el = $("#timer");
    if (!el) return;
    const s = Math.max(0, Math.floor((Date.now() - fromTs) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    el.textContent = (h ? h + ":" + String(m).padStart(2, "0") : String(m).padStart(2, "0")) + ":" + String(ss).padStart(2, "0");
  };
  tick();
  timerInt = setInterval(tick, 1000);
}
function stopTimer() {
  clearInterval(timerInt);
  timerInt = null;
}

// ---------- Grafici ----------
function barChart(values, { labels = [], limit = null, color = "var(--text)", height = 120, highlightLast = true, fmt = (v) => v } = {}) {
  const n = values.length || 1;
  const vals = values.map((v) => Number(v) || 0);
  const lims = Array.isArray(limit) ? limit : vals.map(() => limit);
  const max = Math.max(1, ...vals, ...lims.filter((x) => x !== null && x !== undefined).map(Number));
  const W = 320, H = height, pad = 16, gap = 4;
  const bw = (W - gap * (n - 1)) / n;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">`;
  vals.forEach((v, i) => {
    const h = (v / max) * (H - pad - 4);
    const x = i * (bw + gap);
    const over = lims[i] !== null && lims[i] !== undefined && v > lims[i];
    const c = over ? "var(--bad)" : i === n - 1 && highlightLast ? "var(--now)" : color;
    s += `<rect x="${x.toFixed(1)}" y="${(H - pad - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, v ? 2 : 0).toFixed(1)}" rx="3" fill="${c}" opacity="${v ? 1 : 0.2}"><title>${labels[i] || ""}: ${fmt(v)}</title></rect>`;
    if (!v) s += `<rect x="${x.toFixed(1)}" y="${H - pad - 2}" width="${bw.toFixed(1)}" height="2" rx="1" fill="var(--s3)"/>`;
    if (labels[i] && (n <= 7 || i % 2 === (n - 1) % 2)) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 3}" text-anchor="middle">${esc(labels[i])}</text>`;
  });
  // linea del limite
  if (lims.some((x) => x !== null && x !== undefined)) {
    let d = "";
    lims.forEach((l, i) => {
      if (l === null || l === undefined) return;
      const y = H - pad - (l / max) * (H - pad - 4);
      const x1 = i * (bw + gap), x2 = x1 + bw;
      d += `M${x1.toFixed(1)} ${y.toFixed(1)}H${x2.toFixed(1)}`;
    });
    s += `<path d="${d}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="3 3" fill="none"/>`;
  }
  return s + "</svg>";
}

function ring(progress, size = 42, label = "") {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress || 0));
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--s3)" stroke-width="4" fill="none"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--text)" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="var(--text)" style="font: 600 15px var(--display)">${label}</text></svg>`;
}

// Chiudi i fogli trascinandoli verso il basso dalla maniglia o dall'intestazione.
let dragY = null;
let dragSheet = null;
document.addEventListener("touchstart", (e) => {
  const handle = e.target.closest(".sheet .grab, .sheet .sheet-head, .sheet .chat-head");
  if (!handle || e.target.closest("button, input, textarea, select")) return;
  dragSheet = handle.closest(".sheet");
  dragY = e.touches[0].clientY;
  dragSheet.style.transition = "none";
}, { passive: true });
document.addEventListener("touchmove", (e) => {
  if (dragY === null || !dragSheet) return;
  const dy = Math.max(0, e.touches[0].clientY - dragY);
  dragSheet.style.transform = `translateY(${dy}px)`;
}, { passive: true });
document.addEventListener("touchend", (e) => {
  if (dragY === null || !dragSheet) return;
  const dy = (e.changedTouches[0]?.clientY || dragY) - dragY;
  const sh = dragSheet;
  dragY = null;
  dragSheet = null;
  sh.style.transition = "transform 0.2s ease";
  if (dy > 90) {
    sh.style.transform = "translateY(100%)";
    setTimeout(closeSheet, 180);
  } else sh.style.transform = "";
});
// Tasto Esc e "indietro" chiudono il foglio aperto
document.addEventListener("keydown", (e) => e.key === "Escape" && S.sheet && closeSheet());

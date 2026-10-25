/* Coach Life — azioni dei pulsanti e avvio. */
"use strict";

const clone = (x) => JSON.parse(JSON.stringify(x ?? null));

async function setStatus(id, date, status, extra = {}) {
  const r = await act("status", { itemId: id, date: date || S.data.today, status, ...extra });
  const res = r.result;
  if (res?.messages?.length) toast(res.messages.join(" · "));
  return r;
}

const ACTIONS = {
  reload: () => location.reload(),
  closeSheet: () => closeSheet(),
  tab(el) {
    S.tab = el.dataset.tab;
    S.agendaDate = null;
    history.replaceState(null, "", S.tab === "oggi" ? "/" : "#" + S.tab);
    window.scrollTo(0, 0);
    if (S.tab === "agenda" && S.data.date !== S.data.today) refresh();
    else render();
  },
  authMode(el) {
    S.authMode = el.dataset.mode;
    render();
  },
  logout: async () => {
    if (!confirmLight("Vuoi uscire da Coach Life su questo dispositivo?")) return;
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {}
    logoutLocal();
  },
  send: (el) => submitComposer(el.dataset.cmp),
  retryChat: (el) => sendChat(el.dataset.text),
  moreChat: () => {
    S.showAllChat = true;
    renderChatAreas();
  },
  openSheet(el) {
    const name = el.dataset.sheet;
    if (name === "taskForm") {
      const t = el.dataset.id ? S.data.plan.tasks.find((x) => x.id === el.dataset.id) : null;
      S.draft = t ? clone(t) : { title: "", date: el.dataset.date || S.data.today, start: "", end: "", category: "commissione", priority: "media", location: "", notes: "" };
    }
    if (name === "routineForm") {
      const a = el.dataset.id ? S.data.plan.routine.find((x) => x.id === el.dataset.id) : null;
      S.draft = a ? clone(a) : { title: "", start: "18:00", end: "19:00", days: [1, 2, 3, 4, 5], category: "altro", nag: true, notes: "" };
    }
    if (name === "settings") S.draft = { name: S.data.profile.name, settings: clone(S.data.profile.settings) };
    openSheet(name, { ...el.dataset });
    if (S.sheet) S.sheet.resetScroll = true;
  },

  // ----- Onboarding -----
  obPick(el) {
    const { q, type, v } = el.dataset;
    if (type === "multi") {
      const cur = new Set(S.obAnswers[q] || []);
      cur.has(v) ? cur.delete(v) : cur.add(v);
      S.obAnswers[q] = [...cur];
    } else S.obAnswers[q] = S.obAnswers[q] === v ? "" : v;
    store.set("cl_ob_answers", S.obAnswers);
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  },
  obPrev() {
    S.obIndex = Math.max(0, S.obIndex - 1);
    store.set("cl_ob_index", S.obIndex);
    render();
    window.scrollTo(0, 0);
  },
  async obNext() {
    const secs = window.ONBOARDING;
    const last = S.obIndex >= secs.length - 1;
    const labeled = {};
    for (const sec of secs)
      for (const q of sec.questions) {
        const v = S.obAnswers[q.id];
        if (v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)) labeled[q.label] = v;
      }
    if (S.obAnswers.nome) labeled.nome = S.obAnswers.nome;
    if (S.obAnswers.tono) labeled.tono = S.obAnswers.tono;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!last) {
      S.obIndex++;
      store.set("cl_ob_index", S.obIndex);
      render();
      window.scrollTo(0, 0);
      act("onboarding.answers", { answers: labeled, tz, noState: true }, { quiet: true }).catch(() => {});
      return;
    }
    const sol = S.obAnswers.solleciti;
    const settings = {
      nagEvery: 5,
      nagMax: sol === "2-3 solleciti" ? 3 : sol === "Un solo promemoria" ? 1 : 12,
      practiceLanguages: S.obAnswers.pratica_lingue !== "No",
    };
    await act("settings", { settings, noState: true }, { quiet: true }).catch(() => {});
    await act("onboarding.answers", { answers: labeled, tz, done: true });
    window.scrollTo(0, 0);
    sendChat("", { start: true });
  },
  async obGenerate(el) {
    if (S._generating) return;
    S._generating = true;
    if (el) el.disabled = true;
    try {
      await act("onboarding.generate");
    } finally {
      S._generating = false;
    }
  },
  async obBackCards() {
    await act("onboarding.back", { step: "cards" });
  },
  async obApprove() {
    await act("onboarding.approve");
    S.tab = "oggi";
    window.scrollTo(0, 0);
    toast("Si parte");
    if (!S.data.pushDevices) setTimeout(() => enablePush(), 600);
  },
  async regenPlan() {
    if (!confirmLight("Rifaccio il piano da capo con le nuove regole (più tempo libero e pause)? Il piano attuale resta finché non approvi il nuovo.")) return;
    await act("onboarding.generate", { regenerate: true });
    window.scrollTo(0, 0);
  },
  async redoInterview() {
    if (!confirmLight("Rifai l'intervista? Il piano attuale resta finché non approvi quello nuovo.")) return;
    await act("onboarding.back", { step: "interview" });
    await refresh();
  },

  // ----- Attività -----
  openItem(el) {
    openSheet("item", { id: el.dataset.id, date: el.dataset.date || S.data.today, end: el.dataset.end === "1" });
  },
  async startItem(el) {
    await setStatus(el.dataset.id, el.dataset.date, "started");
    closeSheet();
    const it = S.data.todayItems.find((i) => i.id === el.dataset.id);
    if (it && (it.workoutId || ["sport", "studio", "lingua", "progetto"].includes(it.category))) openSheet("activity", { id: it.id });
  },
  async snoozeItem(el) {
    await setStatus(el.dataset.id, el.dataset.date, "snoozed", { snoozeMinutes: Number(el.dataset.m) || 15 });
    toast(`Rimandato di ${el.dataset.m || 15} minuti. Poi niente scuse.`);
    closeSheet();
  },
  skipItem(el) {
    openSheet("item", { id: el.dataset.id, date: el.dataset.date || S.data.today, mode: "skip" });
  },
  skipReason(el) {
    $("#skip-reason").value = el.dataset.r;
  },
  async confirmSkip(el) {
    const reason = $("#skip-reason")?.value || "";
    const it = findItem(el.dataset.id, el.dataset.date);
    await setStatus(el.dataset.id, el.dataset.date, "skipped", { reason });
    closeSheet();
    sendChat(`Ho saltato "${it?.title}"${reason ? ": " + reason : ""}. Quando lo recupero?`);
  },
  markDone(el) {
    S.sheet.props.mode = "done";
    renderSheet();
  },
  rate(el) {
    S.sheet.props.rating = Number(el.dataset.n);
    S.sheet.props.note = $("#fb-note")?.value || "";
    renderSheet();
  },
  async confirmDone(el) {
    const note = $("#fb-note")?.value || "";
    const it = findItem(el.dataset.id, el.dataset.date);
    await setStatus(el.dataset.id, el.dataset.date, "done", { rating: S.sheet.props.rating, note });
    closeSheet();
    if (note) sendChat(`Finito "${it?.title}". ${note}`);
  },
  async quickDone(el) {
    const it = findItem(el.dataset.id, el.dataset.date);
    if (it?.state?.status === "done") return setStatus(el.dataset.id, el.dataset.date, "reset");
    if (it?.kind === "checkin") return ACTIONS.checkin();
    openSheet("item", { id: el.dataset.id, date: el.dataset.date, mode: "done" });
  },
  async resetItem(el) {
    await setStatus(el.dataset.id, el.dataset.date, "reset");
    renderSheet();
  },
  activityMode(el) {
    openSheet("activity", { id: el.dataset.id });
  },
  toggleSet(el) {
    const k = el.dataset.e + "-" + el.dataset.s;
    const p = S.sheet.props;
    p.sets = { ...(p.sets || {}), [k]: !p.sets?.[k] };
    if (p.sets[k]) {
      const it = findItem(p.id, S.data.today);
      const w = S.data.plan.workouts.find((x) => x.id === it?.workoutId);
      const ex = w?.exercises[Number(el.dataset.e)];
      const kg = p.weights?.[el.dataset.e] ?? ex?.weight ?? "";
      act("log", { entries: [{ type: "serie", value: Number(String(kg).replace(",", ".")) || null, unit: "kg", note: `${ex?.name}: serie ${Number(el.dataset.s) + 1}, ${ex?.reps} rip.` }], noState: true }, { quiet: true }).catch(() => {});
    }
    renderSheet();
  },
  finishActivity(el) {
    stopTimer();
    openSheet("item", { id: el.dataset.id, date: S.data.today, mode: "done" });
  },
  askAbout(el) {
    const it = findItem(el.dataset.id, S.sheet?.props?.date || S.data.today);
    closeSheet();
    openSheet("chat");
    S.voiceCtx = { activityId: it?.id };
    const t = $("#cmp-sheet");
    if (t) {
      t.value = `Su "${it?.title}": `;
      t.focus();
      t.dispatchEvent(new Event("input", { bubbles: true }));
    }
  },

  // ----- Oggi -----
  async dayOff(el) {
    await act("dayOff", { on: el.dataset.on === "1" });
    if (el.dataset.on === "1") sendChat("Oggi è una giornata no. Alleggeriscimi il piano: cosa tengo e cosa sposto?");
  },
  async logCig() {
    await act("log", { entries: [{ type: "sigaretta", value: 1 }] });
    const sm = S.data.smoking;
    if (sm.limit !== null && sm.today > sm.limit) toast(`Sei a ${sm.today}: sopra il limite di ${sm.limit}.`);
    else if (sm.limit !== null) toast(`${sm.today} su ${sm.limit}. Ne restano ${sm.limit - sm.today}.`);
  },
  craving() {
    act("log", { entries: [{ type: "voglia", value: 1 }], noState: true }, { quiet: true }).catch(() => {});
    openSheet("chat");
    sendChat("", { craving: true });
  },
  async proposal(el) {
    await act("proposal", { id: el.dataset.id, accept: el.dataset.accept === "1" });
    toast(el.dataset.accept === "1" ? "Routine aggiornata" : "Proposta scartata");
  },
  checkin() {
    S.draft = { extraCigarettes: 0 };
    openSheet("checkin");
  },
  async saveCheckin() {
    await act("checkin", { data: S.draft });
    const c = S.draft || {};
    closeSheet();
    sendChat(`Bilancio di oggi: umore ${c.mood || "?"}/5, energia ${c.energy || "?"}/5, voto ${c.score || "?"}/5.${c.good ? " Bene: " + c.good + "." : ""}${c.improve ? " Da migliorare: " + c.improve + "." : ""} Commenta e dimmi il piano per domani.`);
  },
  quickLog(el) {
    const back = el.dataset?.back;
    if (back === "checkin") S._checkinDraft = clone(S.draft);
    S.draft = { type: el.dataset?.type || "spesa", category: !el.dataset?.type || el.dataset.type === "spesa" ? "cibo" : "" };
    openSheet("quickLog", { back });
    S._returnTo = back || null;
  },
  async saveLog() {
    const d = S.draft;
    const e = { type: d.type, value: d.value, category: d.category, note: d.note };
    if (d.type === "sigaretta" || d.type === "acqua" || d.type === "allenamento") e.value = 1;
    if (["studio", "lingua"].includes(d.type)) e.unit = "min";
    if (d.type === "tesi") e.unit = "pagine";
    if (d.type === "progetto") e.unit = "ore";
    if (d.type === "corsa") e.meta = { minutes: d.minutes };
    if (["spesa", "entrata", "risparmio", "sonno", "corsa", "peso", "studio", "tesi", "lingua", "progetto"].includes(d.type) && !(Number(d.value) > 0)) return toast("Inserisci un valore");
    await act("log", { entries: [e] });
    toast("Registrato");
    if (S._returnTo === "checkin") {
      S._returnTo = null;
      const keep = S._checkinDraft || { extraCigarettes: 0 };
      openSheet("checkin");
      S.draft = keep;
      renderSheet();
    } else closeSheet();
  },

  // ----- Agenda -----
  async pickDate(el) {
    S.agendaDate = el.dataset.date;
    await refresh();
  },
  async weekShift(el) {
    S.agendaDate = addDays(S.data.date, Number(el.dataset.n));
    await refresh();
  },
  agendaView(el) {
    S.agendaView = el.dataset.v;
    render();
  },
  async taskDone(el) {
    await act("task.update", { id: el.dataset.id, task: { done: true } });
    toast("Fatto. +1 cosa in meno.");
  },
  async saveTask() {
    const t = S.draft;
    if (!t.title?.trim()) return toast("Scrivi cosa devi fare");
    if (t.id) await act("task.update", { id: t.id, task: t });
    else await act("task.add", { task: t });
    toast(t.date && t.start ? "In agenda: ti avviso io" : "Aggiunto");
    closeSheet();
  },
  async deleteTask(el) {
    await act("task.delete", { id: el.dataset.id });
    closeSheet();
  },
  askTask() {
    const t = S.draft;
    if (!t.title?.trim()) return toast("Scrivi prima cosa devi fare");
    closeSheet();
    openSheet("chat");
    sendChat(`Devo: ${t.title}${t.location ? " (" + t.location + ")" : ""}${t.date ? ", entro il " + t.date : ""}${t.notes ? ". " + t.notes : ""}. Quando è meglio farlo?`);
  },

  // ----- Routine -----
  toggleDay(el) {
    const d = Number(el.dataset.d);
    const days = new Set(S.draft.days || []);
    days.has(d) ? days.delete(d) : days.add(d);
    S.draft.days = [...days].sort();
    renderSheet();
  },
  async saveRoutine() {
    const a = S.draft;
    if (!a.title?.trim()) return toast("Dai un nome all'attività");
    if (!a.days?.length) return toast("Scegli almeno un giorno");
    await act("routine", { ops: [a.id ? { op: "update", id: a.id, activity: a } : { op: "add", activity: a }] });
    toast("Routine aggiornata");
    openSheet("routine");
  },
  async deleteRoutine(el) {
    if (!confirmLight("Eliminare questa attività dalla routine?")) return;
    await act("routine", { ops: [{ op: "delete", id: el.dataset.id }] });
    openSheet("routine");
  },

  // ----- Sezioni del piano -----
  editSection(el) {
    const sec = el.dataset.section;
    const defaults = { smoking: { active: false, steps: [] }, budget: { categories: {}, fixed: [] }, study: { exams: [], thesis: null }, water: { enabled: false, everyHours: 2, from: "09:00", to: "17:30", days: [1, 2, 3, 4, 5] } };
    S.draft = clone(S.data.plan[sec] ?? defaults[sec] ?? []);
    if (sec === "budget") S.draft.categories ||= {};
    openSheet("section", { section: sec });
  },
  draftAdd(el) {
    const path = el.dataset.path;
    const item = TEMPLATES[el.dataset.tpl]();
    if (!path) S.draft.push(item);
    else {
      const arr = getPath(S.draft, path);
      if (Array.isArray(arr)) arr.push(item);
      else setPath(S.draft, path, [item]);
    }
    renderSheet();
  },
  draftDel(el) {
    const path = el.dataset.path;
    const arr = path ? getPath(S.draft, path) : S.draft;
    arr.splice(Number(el.dataset.i), 1);
    renderSheet();
  },
  draftSet(el) {
    let v = el.dataset.v;
    if (el.hasAttribute("data-num")) v = Number(v);
    setPath(S.draft, el.dataset.path, v);
    renderSheet();
  },
  draftInc(el) {
    const cur = Number(getPath(S.draft, el.dataset.path)) || 0;
    setPath(S.draft, el.dataset.path, Math.max(0, cur + Number(el.dataset.n)));
    renderSheet();
  },
  draftSetObj(el) {
    const p = el.dataset.path;
    setPath(S.draft, p, p === "thesis" ? { title: "Tesi", deadline: "", weeklyPages: null, chapters: [] } : { title: "", target: 0, deadline: "" });
    renderSheet();
  },
  addCat(el) {
    S.draft.categories[el.dataset.c] = 0;
    renderSheet();
  },
  delCat(el) {
    delete S.draft.categories[el.dataset.c];
    renderSheet();
  },
  async saveSection(el) {
    await act("planSection", { section: el.dataset.section, data: S.draft });
    toast("Salvato");
    closeSheet();
  },
  async toggleThesis(el) {
    const st = clone(S.data.plan.study);
    const p = st.thesis.chapters[Number(el.dataset.c)].paragraphs[Number(el.dataset.p)];
    p.done = !p.done;
    const ch = st.thesis.chapters[Number(el.dataset.c)];
    ch.done = ch.paragraphs.length > 0 && ch.paragraphs.every((x) => x.done);
    await act("planSection", { section: "study", data: st });
    if (p.done) toast(ch.done ? `Capitolo finito: ${ch.title}` : "Paragrafo fatto");
  },
  async toggleMilestone(el) {
    const goals = clone(S.data.plan.goals);
    const m = goals[Number(el.dataset.g)].milestones[Number(el.dataset.m)];
    m.done = !m.done;
    await act("planSection", { section: "goals", data: goals });
    if (m.done) toast("Tappa raggiunta");
  },

  // ----- Coach, notifiche, impostazioni -----
  enablePush: () => enablePush(),
  async testPush() {
    const r = await api("/api/push", { method: "POST", body: { action: "test" } });
    toast(r.delivered ? "Notifica inviata" : "Nessun dispositivo ha ricevuto la notifica");
  },
  testVoice() {
    S.data.profile.settings = { ...S.data.profile.settings, ...S.draft.settings };
    speak("Ciao, sono il tuo coach. Niente scuse oggi.");
  },
  async saveSettings() {
    await act("settings", { settings: S.draft.settings, name: S.draft.name });
    toast("Salvato");
    closeSheet();
  },
  async forget(el) {
    await act("memory.delete", { id: el.dataset.id });
  },

  // ----- Lingue -----
  learnLang(el) {
    S.learnLang = el.dataset.code;
    render();
  },
  say(el) {
    speak(el.dataset.text, el.dataset.lang || "it-IT");
  },
  async loadPhrases(el) {
    toast("Preparo le frasi…");
    try {
      const r = await api("/api/learn", { method: "POST", body: { kind: "phrases", lang: S.learnLang, refresh: !!el.dataset.refresh } });
      setData(r.state);
    } catch (e) {
      toast(e.message);
    }
  },
  practice(el) {
    openSheet("chat");
    sendChat(`Facciamo 10 minuti di conversazione in ${el.dataset.lang}. Parlami in ${el.dataset.lang} al mio livello e correggimi.`);
  },
  flip() {
    S.sheet.props.flipped = !S.sheet.props.flipped;
    renderSheet();
  },
  async review(el) {
    S.sheet.props.flipped = false;
    const r = await api("/api/learn", { method: "POST", body: { kind: "review", lang: S.learnLang, cardId: el.dataset.id, correct: el.dataset.ok === "1" } });
    setData(r.state);
  },
  async moreCards() {
    S.sheet.props.loading = true;
    renderSheet();
    try {
      const r = await api("/api/learn", { method: "POST", body: { kind: "moreCards", lang: S.learnLang } });
      if (S.sheet) S.sheet.props.loading = false;
      setData(r.state);
    } catch (e) {
      if (S.sheet) S.sheet.props.loading = false;
      renderSheet();
      toast(e.message);
    }
  },
  quizAnswer(el) {
    const p = S.sheet.props;
    const q = S.data.learn[S.learnLang].quiz.questions[p.i || 0];
    p.answer = Number(el.dataset.k);
    if (p.answer === q.answer) p.score = (p.score || 0) + 1;
    renderSheet();
  },
  async quizNext() {
    const p = S.sheet.props;
    p.i = (p.i || 0) + 1;
    p.answer = undefined;
    const total = S.data.learn[S.learnLang].quiz.questions.length;
    renderSheet();
    if (p.i >= total) {
      const r = await api("/api/learn", { method: "POST", body: { kind: "quizResult", lang: S.learnLang, score: p.score || 0 } });
      setData(r.state);
    }
  },
};

function confirmLight(msg) {
  return window.confirm(msg);
}

// Apertura del quiz: genera le domande se servono.
const _openSheet = openSheet;
openSheet = function (name, props = {}) {
  _openSheet(name, props);
  if (name === "quiz") {
    const q = S.data.learn?.[S.learnLang]?.quiz;
    const ws = addDays(S.data.today, 1 - dowOf(S.data.today));
    if (!q || q.week !== ws) {
      S.sheet.props.loading = true;
      renderSheet();
      api("/api/learn", { method: "POST", body: { kind: "quiz", lang: S.learnLang } })
        .then((r) => {
          if (S.sheet?.name === "quiz") S.sheet.props.loading = false;
          setData(r.state);
        })
        .catch((e) => {
          toast(e.message);
          closeSheet();
        });
    }
  }
};

// ---------- Eventi ----------
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  Promise.resolve(fn(el, e)).catch((err) => console.error(err));
});

document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (f.dataset.form !== "auth") return;
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(f));
  const btn = f.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    const r = await api(`/api/auth/${S.authMode === "register" ? "register" : "login"}`, { method: "POST", body: fd });
    S.token = r.token;
    store.set("cl_token", r.token);
    if (S.authMode === "register") {
      S.obAnswers = { nome: fd.name || "" };
      S.obIndex = 0;
      store.set("cl_ob_answers", S.obAnswers);
      store.set("cl_ob_index", 0);
    }
    await refresh();
  } catch (err) {
    toast(err.message);
    btn.disabled = false;
  }
});

// Link dalle notifiche: /?a=ID&d=DATA&end=1
function handleUrl(url = location.href) {
  const u = new URL(url, location.origin);
  const a = u.searchParams.get("a");
  if (u.hash) {
    const t = u.hash.slice(1);
    if (TABS.some((x) => x.id === t)) S.tab = t;
  }
  if (a && S.data?.profile?.onboarded) {
    const date = u.searchParams.get("d") || S.data.today;
    const it = findItem(a, date);
    if (it?.kind === "checkin") ACTIONS.checkin();
    else openSheet("item", { id: a, date, end: u.searchParams.get("end") === "1" });
    history.replaceState(null, "", S.tab === "oggi" ? "/" : "#" + S.tab);
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", async (e) => {
    if (e.data?.type === "push") refresh();
    if (e.data?.type === "open") {
      await refresh();
      handleUrl(e.data.url);
    }
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.token && !Voice.rec && !S.chatBusy) refresh();
});
setInterval(() => {
  if (document.visibilityState === "visible" && S.token && !S.sheet && !S.chatBusy && !Voice.rec && !document.activeElement?.matches("textarea,input")) refresh();
}, 60000);

(async function boot() {
  const h = location.hash.slice(1);
  if (TABS.some((x) => x.id === h)) S.tab = h;
  render();
  if (S.token) {
    await refresh();
    handleUrl();
  }
})();

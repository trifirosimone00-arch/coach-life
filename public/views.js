/* Coach Life — schermate principali. */
"use strict";

const TABS = [
  { id: "oggi", label: "Oggi", icon: "today" },
  { id: "agenda", label: "Agenda", icon: "agenda" },
  { id: "progressi", label: "Progressi", icon: "chart" },
  { id: "lingue", label: "Lingue", icon: "lang" },
  { id: "tu", label: "Tu", icon: "user" },
];
const STATUS_LABEL = { done: "Fatto", skipped: "Saltato", started: "In corso", snoozed: "Rimandato" };

function render() {
  const app = $("#app");
  if (!S.token) {
    app.innerHTML = authView();
    return;
  }
  if (!S.data) {
    app.innerHTML = `<div class="screen plain hero-auth"><div class="spin"></div>${S.bootError ? `<p class="muted" style="text-align:center;margin-top:16px">${esc(S.bootError)}</p><div style="text-align:center;margin-top:12px"><button class="btn" data-act="reload">Riprova</button></div>` : ""}</div>`;
    return;
  }
  const step = S.data.profile.onboardingStep;
  if (!S.data.profile.onboarded) {
    if (step === "cards") app.innerHTML = cardsView();
    else if (step === "interview") app.innerHTML = interviewView();
    else if (step === "generating") app.innerHTML = generatingView();
    else if (step === "review") app.innerHTML = reviewView();
    else app.innerHTML = cardsView();
    afterRender();
    return;
  }
  const views = { oggi: homeView, agenda: agendaView, progressi: progressView, lingue: learnView, tu: meView };
  app.innerHTML = (views[S.tab] || homeView)() + composerHtml() + tabsHtml();
  afterRender();
}

function afterRender() {
  scrollThreads();
  const step = S.data?.profile?.onboardingStep;
  if (step === "generating") schedulePoll();
  if (S.tab === "lingue" && S.data?.profile?.onboarded) autoLoadWord();
}

function tabsHtml() {
  return `<nav class="tabs" aria-label="Sezioni"><div class="tabs-inner">${TABS.map(
    (t) => `<button class="tab${S.tab === t.id ? " on" : ""}" data-act="tab" data-tab="${t.id}" aria-current="${S.tab === t.id ? "page" : "false"}">${ic(t.icon)}<span>${t.label}</span></button>`
  ).join("")}</div></nav>`;
}

// ---------- Accesso ----------
function authView() {
  const reg = S.authMode === "register";
  return `<main class="screen plain hero-auth">
    <div class="brand"><img src="/icons/icon-192.png" alt=""><h2>Coach Life</h2></div>
    <p class="big-claim">Il coach che ti scrive all'orario giusto.</p>
    <p class="muted">Ti conosce, ti organizza la giornata, ti insegue finché non lo fai. E gli parli a voce.</p>
    <form class="stack" style="margin-top:28px" data-form="auth">
      <div class="seg"><button type="button" class="${reg ? "on" : ""}" data-act="authMode" data-mode="register">Crea account</button><button type="button" class="${!reg ? "on" : ""}" data-act="authMode" data-mode="login">Accedi</button></div>
      ${reg ? `<label class="field"><span>Nome</span><input class="input" name="name" autocomplete="given-name" required></label>` : ""}
      <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="${reg ? "new-password" : "current-password"}" minlength="6" required></label>
      <button class="btn primary block" type="submit">${reg ? "Crea account" : "Accedi"}</button>
    </form>
  </main>`;
}

// ---------- Onboarding: schede ----------
function cardsView() {
  const secs = window.ONBOARDING;
  const i = Math.min(S.obIndex, secs.length - 1);
  const sec = secs[i];
  const a = S.obAnswers;
  const q = (x) => {
    const v = a[x.id];
    let input = "";
    if (x.type === "single" || x.type === "multi") {
      input = `<div class="chips">${x.options
        .map((o) => {
          const on = x.type === "multi" ? (v || []).includes(o) : v === o;
          return `<button type="button" class="chip${on ? " on" : ""}" data-act="obPick" data-q="${x.id}" data-type="${x.type}" data-v="${attr(o)}">${esc(o)}</button>`;
        })
        .join("")}</div>`;
    } else if (x.type === "textarea") {
      input = `<textarea class="input" data-ob="${x.id}" placeholder="${attr(x.placeholder || "")}">${esc(v || "")}</textarea>`;
    } else {
      const t = x.type === "number" ? "number" : x.type === "time" ? "time" : x.type === "date" ? "date" : "text";
      input = `<input class="input" type="${t}" ${t === "number" ? 'inputmode="decimal"' : ""} data-ob="${x.id}" value="${attr(v || "")}" placeholder="${attr(x.placeholder || "")}">`;
    }
    return `<div class="ob-q"><div class="q">${esc(x.label)}</div>${input}</div>`;
  };
  return `<main class="screen plain" style="padding-bottom:120px">
    <div class="ob-progress">${secs.map((_, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("")}</div>
    <p class="muted small">${i + 1} di ${secs.length}</p>
    <h1 style="margin-top:4px">${esc(sec.title)}</h1>
    ${sec.intro ? `<p class="muted" style="margin-top:8px">${esc(sec.intro)}</p>` : ""}
    ${sec.questions.map(q).join("")}
  </main>
  <div class="ob-foot"><div class="inner">
    ${i > 0 ? `<button class="btn ghost" data-act="obPrev">Indietro</button>` : ""}
    <button class="btn primary grow" data-act="obNext">${i === secs.length - 1 ? "Ora parliamo" : "Avanti"}</button>
  </div></div>`;
}

// ---------- Onboarding: intervista ----------
function interviewView() {
  return `<main class="screen" style="padding-bottom:calc(var(--dock-h) + var(--safe-b) + 30px)">
    <div class="topbar"><div><h1>Conosciamoci</h1><p class="muted small" style="margin-top:6px">Rispondi scrivendo o tenendo premuto il microfono. Più mi racconti, meglio ti organizzo.</p></div></div>
    <div data-thread="200" data-filter="interview">${threadHtml(200)}</div>
    <div class="card flat" style="margin-top:22px">
      <p class="small muted">Quando il coach ha capito tutto crea il piano da solo. Puoi anche chiudere tu l'intervista.</p>
      <div class="row" style="margin-top:10px"><button class="btn small" data-act="obGenerate">Ho finito, crea il piano</button><button class="btn small ghost" data-act="obBackCards">Rivedi le schede</button></div>
    </div>
  </main>${composerHtml({ id: "main", placeholder: "Rispondi al coach…", noTabs: true })}`;
}

let pollT = null;
function schedulePoll() {
  clearTimeout(pollT);
  pollT = setTimeout(async () => {
    if (S.data?.profile?.onboardingStep !== "generating") return;
    await refresh();
  }, 5000);
}

function generatingView() {
  const err = S.data.job?.status === "error";
  return `<main class="screen plain hero-auth" style="text-align:center">
    ${err ? "" : '<div class="spin"></div>'}
    <h1 style="margin-top:22px">${err ? "Qualcosa è andato storto" : "Sto costruendo la tua vita"}</h1>
    <p class="muted" style="margin-top:10px">${err ? "Il piano non è stato creato. Riprova: le tue risposte sono salve." : "Routine, schede, obiettivi, soldi. Ci vogliono un paio di minuti: puoi chiudere l'app, ti avviso io."}</p>
    ${err ? `<div style="margin-top:18px"><button class="btn primary" data-act="obGenerate">Riprova</button></div>` : ""}
  </main>`;
}

// ---------- Onboarding: revisione del piano ----------
function routineByDay(routine) {
  let html = "";
  for (let d = 1; d <= 7; d++) {
    const list = routine.filter((a) => a.days.includes(d)).sort((a, b) => toMin(a.start) - toMin(b.start));
    if (!list.length) continue;
    html += `<div class="routine-day"><h4>${DOW_LONG[d][0].toUpperCase() + DOW_LONG[d].slice(1)}</h4><ul class="timeline">${list
      .map((a) => `<li class="tl-item"><div class="tl-main"><span class="tl-time">${a.start}</span><span><span class="tl-title">${esc(a.title)}</span>${a.end ? `<span class="tl-sub"> · fino alle ${a.end}</span>` : ""}</span></div></li>`)
      .join("")}</ul></div>`;
  }
  return html || '<p class="muted">Nessuna attività.</p>';
}

function planOverview(plan) {
  const parts = [];
  if (plan.workouts?.length)
    parts.push(`<div class="card"><h3>Schede di allenamento</h3>${plan.workouts.map((w) => `<div style="margin-top:10px"><b>${esc(w.name)}</b> <span class="muted small">${esc(w.focus)}</span><p class="small muted">${w.exercises.map((e) => `${esc(e.name)} ${e.sets}×${esc(e.reps)}`).join(" · ")}</p></div>`).join("")}</div>`);
  if (plan.smoking?.active)
    parts.push(`<div class="card"><h3>Piano sigarette</h3><p class="muted small" style="margin-top:6px">Da ${plan.smoking.baseline} al giorno${plan.smoking.quitDate ? ` a zero entro il ${itDate(plan.smoking.quitDate, false)}` : ""}.</p><div class="chips" style="margin-top:10px">${plan.smoking.steps.map((s) => `<span class="pill">dal ${itDate(s.from, false)}: ${s.limit}</span>`).join("")}</div></div>`);
  const b = plan.budget || {};
  if (Object.keys(b.categories || {}).length || b.fixed?.length || b.savingsGoal)
    parts.push(`<div class="card"><h3>Soldi</h3>${Object.keys(b.categories || {}).length ? `<p class="small muted" style="margin-top:6px">Budget al mese: ${Object.entries(b.categories).map(([k, v]) => `${esc(k)} ${fmtEur(v)}`).join(" · ")}</p>` : ""}${b.fixed?.length ? `<p class="small muted" style="margin-top:6px">Fisse: ${b.fixed.map((f) => `${esc(f.title)} ${fmtEur(f.amount)} il ${f.day}`).join(" · ")}</p>` : ""}${b.savingsGoal ? `<p class="small" style="margin-top:6px">Obiettivo: ${esc(b.savingsGoal.title)} — ${fmtEur(b.savingsGoal.target)}</p>` : ""}</div>`);
  if (plan.study?.thesis || plan.study?.exams?.length)
    parts.push(`<div class="card"><h3>Studio</h3>${(plan.study.exams || []).map((e) => `<p class="small" style="margin-top:6px">${esc(e.name)}${e.date ? " · " + itDate(e.date, false) : ""}</p>`).join("")}${plan.study.thesis ? `<p class="small" style="margin-top:6px">${esc(plan.study.thesis.title)}${plan.study.thesis.deadline ? " · consegna " + itDate(plan.study.thesis.deadline, false) : ""} · ${plan.study.thesis.chapters.length} capitoli</p>` : ""}</div>`);
  if (plan.goals?.length)
    parts.push(`<div class="card"><h3>Obiettivi</h3>${plan.goals.map((g) => `<p style="margin-top:8px"><b>${esc(g.title)}</b>${g.deadline ? ` <span class="muted small">entro ${itDate(g.deadline, false)}</span>` : ""}</p><p class="small muted">${g.milestones.map((m) => esc(m.title)).join(" → ")}</p>`).join("")}</div>`);
  if (plan.languages?.length) parts.push(`<div class="card"><h3>Lingue</h3><p class="small muted" style="margin-top:6px">${plan.languages.map((l) => `${esc(l.name)} (${esc(l.level)})${l.goal ? ": " + esc(l.goal) : ""}`).join("<br>")}</p></div>`);
  return parts.join("");
}

function reviewView() {
  const p = S.data.plan;
  const lastPlanMsg = [...S.data.chat].reverse().find((m) => m.kind === "plan");
  return `<main class="screen">
    <h1>Il tuo piano</h1>
    ${lastPlanMsg ? `<div class="card" style="margin-top:14px"><div class="md">${md(lastPlanMsg.text)}</div></div>` : ""}
    <div class="section"><div class="section-head"><h2>La tua settimana</h2></div><div class="card">${routineByDay(p.routine)}</div></div>
    <div class="section stack">${planOverview(p)}</div>
    <div class="section card flat"><p class="small muted">Vuoi cambiare qualcosa? Dillo al coach qui sotto, a voce o scrivendo, e lo modifica subito.</p></div>
    <div class="section"><div data-thread="6" data-hide="interview">${threadHtml(6, (m) => m.kind !== "interview")}</div></div>
    <div class="section stack"><button class="btn primary block" data-act="obApprove">Approva e inizia</button><button class="btn ghost block" data-act="obGenerate">Rifai il piano da capo</button></div>
  </main>${composerHtml({ placeholder: "Es. sposta la palestra alle 19…" })}`;
}

// ---------- Oggi ----------
function currentItem(items) {
  const m = nowMinutes();
  const open = items.filter((i) => i.kind !== "morning" && !["done", "skipped"].includes(i.state?.status));
  const inProgress = open.find((i) => i.state?.status === "started");
  if (inProgress) return { item: inProgress, when: "now" };
  const nowItem = open.find((i) => {
    const s = toMin(i.start), e = toMin(i.end) ?? s + 30;
    return s !== null && m >= s - 5 && m < e;
  });
  if (nowItem) return { item: nowItem, when: "now" };
  const late = open.find((i) => toMin(i.start) !== null && toMin(i.start) < m && i.state?.status !== "snoozed" && m - toMin(i.start) < 180);
  const next = open.find((i) => toMin(i.start) >= m) || open.find((i) => i.state?.status === "snoozed");
  if (late && (!next || toMin(next.start) - m > 20)) return { item: late, when: "late" };
  return next ? { item: next, when: "next" } : null;
}

function itemRow(it, date) {
  const st = it.state?.status;
  const cur = S._currentId === it.id;
  return `<li class="tl-item${st === "done" ? " done" : ""}${cur ? " current" : ""}">
    <button class="tl-main" data-act="openItem" data-id="${it.id}" data-date="${date}">
      <span class="tl-time">${it.start || "—"}</span>
      <span><span class="tl-title">${esc(it.title)}</span>${st && st !== "done" ? ` <span class="pill ${st === "skipped" ? "bad" : st === "started" ? "now" : ""}">${STATUS_LABEL[st]}</span>` : ""}${it.location ? `<span class="tl-sub"> · ${esc(it.location)}</span>` : ""}</span>
    </button>
    <button class="check ${st === "done" ? "done" : st === "skipped" ? "skipped" : ""}" data-act="quickDone" data-id="${it.id}" data-date="${date}" aria-label="Segna come fatto">${st === "skipped" ? ic("x") : ic("check")}</button>
  </li>`;
}

function homeView() {
  const d = S.data;
  const items = d.todayItems.filter((i) => i.kind !== "morning");
  const cur = currentItem(d.todayItems);
  S._currentId = cur?.item?.id;
  const g = d.game;
  const name = d.profile.name;
  const doneN = items.filter((i) => i.state?.status === "done").length;
  let nowCard = "";
  if (cur) {
    const it = cur.item;
    const st = it.state?.status;
    const label = cur.when === "now" ? (st === "started" ? "In corso" : "Adesso") : cur.when === "late" ? "In ritardo" : st === "snoozed" ? "Rimandata" : "Prossima";
    const actions =
      st === "started"
        ? `<button class="btn now" data-act="activityMode" data-id="${it.id}">${ic("play")}Modalità attività</button><button class="btn" data-act="openItem" data-id="${it.id}" data-date="${d.today}" data-end="1">${ic("check")}Fatto</button><button class="btn" data-act="skipItem" data-id="${it.id}">${ic("skip")}Salta</button>`
        : `<button class="btn ${cur.when === "next" ? "primary" : "now"}" data-act="startItem" data-id="${it.id}">${ic("play")}Inizia</button><button class="btn" data-act="snoozeItem" data-id="${it.id}">${ic("snooze")}15 min</button><button class="btn" data-act="skipItem" data-id="${it.id}">${ic("skip")}Salta</button>`;
    nowCard = `<section class="now-card">
      <div class="label${cur.when === "next" ? " later" : ""}">${label}</div>
      <div class="now-time">${it.start || "--:--"}${it.end ? `<small>– ${it.end}</small>` : ""}</div>
      <button class="now-title" data-act="openItem" data-id="${it.id}" data-date="${d.today}" style="text-align:left">${esc(it.title)}</button>
      ${it.notes ? `<p class="muted small" style="margin-top:4px">${esc(it.notes)}</p>` : ""}
      <div class="now-actions">${actions}</div>
      <div class="dayline" aria-label="${doneN} su ${items.length} fatte">${items.map((i) => `<i class="${i.state?.status === "done" ? "done" : i.state?.status === "skipped" ? "skipped" : i.id === it.id ? "current" : ""}"></i>`).join("")}</div>
    </section>`;
  } else {
    nowCard = `<section class="now-card"><div class="label later">Giornata</div><div class="now-title" style="margin-top:10px">${items.length ? "Hai chiuso tutto per oggi." : "Niente in agenda oggi."}</div><p class="muted small" style="margin-top:6px">${items.length ? `${doneN} su ${items.length} fatte. Serie: ${g.streak} giorni.` : "Dimmi cosa devi fare e lo organizzo io."}</p>
    <div class="dayline">${items.map((i) => `<i class="${i.state?.status === "done" ? "done" : i.state?.status === "skipped" ? "skipped" : ""}"></i>`).join("")}</div></section>`;
  }
  const sm = d.smoking;
  const smoke = d.plan.smoking?.active
    ? `<div class="card row between"><div><div class="num" style="font-size:26px;font-weight:700">${sm.today}<span class="faint" style="font-size:16px"> / ${sm.limit ?? "—"}</span></div><div class="small muted">sigarette oggi${sm.savingsAll ? ` · ${fmtEur(sm.savingsAll.saved)} risparmiati` : ""}</div></div>
       <div class="row"><button class="btn small ghost" data-act="craving">${ic("flame")}Voglia</button><button class="btn small" data-act="logCig">+1</button></div></div>`
    : "";
  const pushBanner =
    !d.pushDevices
      ? `<button class="banner" data-act="enablePush" style="width:100%;text-align:left">${ic("bell")}<span><b>Attiva le notifiche</b><br><span class="small muted">Senza notifiche non posso scriverti all'orario giusto.</span></span></button>`
      : "";
  const props = d.pending.map((p) => `<div class="proposal"><p class="small" style="color:var(--now);font-weight:600">Proposta del coach</p><p style="margin-top:4px">${esc(p.summary)}</p><div class="row" style="margin-top:10px"><button class="btn small primary" data-act="proposal" data-id="${p.id}" data-accept="1">Approva</button><button class="btn small ghost" data-act="proposal" data-id="${p.id}">No grazie</button></div></div>`).join("");
  const checkinDue = d.todayItems.find((i) => i.kind === "checkin" && i.state?.status !== "done" && toMin(i.start) <= nowMinutes());

  return `<main class="screen">
    <header class="topbar">
      <div><p class="date">${itDate(d.today)}</p><h1>${name ? "Ciao " + esc(name) : "Ciao"}</h1></div>
      <button class="level" data-act="tab" data-tab="progressi" aria-label="Livello e punti">${ring(g.progress, 42, g.level)}<span style="text-align:left"><b>${g.points} pt</b><br><span class="tiny muted">serie ${g.streak} ${g.streak === 1 ? "giorno" : "giorni"}</span></span></button>
    </header>
    <div class="stack">
      ${pushBanner}
      ${props}
      ${d.dayOff ? `<div class="banner">${ic("moon")}<span><b>Giornata no attiva</b><br><span class="small muted">Niente solleciti oggi. Fai il minimo, domani si riparte.</span> <button class="link small" data-act="dayOff" data-on="0">Disattiva</button></span></div>` : ""}
      ${nowCard}
      ${checkinDue ? `<button class="btn now block" data-act="checkin">Fai il bilancio della giornata</button>` : ""}
      ${smoke}
      <div class="row" style="gap:8px">
        <button class="btn small grow" data-act="quickLog">${ic("plus")}Registra</button>
        <button class="btn small grow" data-act="openSheet" data-sheet="taskForm">${ic("agenda")}Impegno</button>
        ${d.dayOff ? "" : `<button class="btn small grow" data-act="dayOff" data-on="1">${ic("moon")}Giornata no</button>`}
      </div>
    </div>
    <section class="section">
      <div class="section-head"><h2>Piano di oggi</h2><span class="muted small">${doneN}/${items.length}</span></div>
      <div class="card" style="padding:4px 12px">${items.length ? `<ul class="timeline">${items.map((i) => itemRow(i, d.today)).join("")}</ul>` : `<div class="empty"><p>Nessuna attività oggi.</p></div>`}</div>
    </section>
    <section class="section">
      <div class="section-head"><h2>Coach</h2>${S.data.chat.length > 20 ? `<button class="link" data-act="openSheet" data-sheet="chat">Tutta la chat</button>` : ""}</div>
      <div data-thread="home">${threadHtml(20, (m) => m.kind !== "interview")}</div>
    </section>
  </main>`;
}

// ---------- Agenda ----------
function agendaView() {
  const d = S.data;
  const date = d.date;
  const week = d.week;
  const dayData = week.find((w) => w.date === date) || { items: [] };
  const undated = d.plan.tasks.filter((t) => !t.date && !t.done);
  const dayStrip = `<div class="row between" style="margin-bottom:8px"><button class="icon-btn" data-act="weekShift" data-n="-7" aria-label="Settimana precedente">${ic("back")}</button><span class="muted small">${itDate(week[0].date, false)} – ${itDate(week[6].date, false)}</span><button class="icon-btn" data-act="weekShift" data-n="7" aria-label="Settimana successiva">${ic("chev")}</button></div>
    <div class="days">${week
      .map((w) => `<button class="day-btn${w.date === date ? " on" : ""}${w.date === d.today ? " today" : ""}" data-act="pickDate" data-date="${w.date}"><small>${DOW_SHORT[dowOf(w.date)]}</small><b>${Number(w.date.slice(8))}</b><span class="dots">${w.items.slice(0, 5).map(() => "<i></i>").join("")}</span></button>`)
      .join("")}</div>`;
  const dayList = dayData.items.length
    ? `<div class="card" style="padding:4px 12px"><ul class="timeline">${dayData.items.filter((i) => i.kind !== "morning").map((i) => itemRow(i, date)).join("")}</ul></div>`
    : `<div class="card empty"><h3>Giornata libera</h3><p class="small">Aggiungi un impegno o dillo al coach: “domani devo passare in posta”.</p></div>`;
  const weekGrid = `<div class="week-grid">${week
    .map((w) => `<div class="week-col"><h4 class="${w.date === d.today ? "today" : ""}">${DOW_SHORT[dowOf(w.date)]} ${Number(w.date.slice(8))}</h4>${w.items
      .filter((i) => i.kind !== "morning")
      .map((i) => `<button class="wk-item${i.state?.status === "done" ? " done" : ""}" data-act="openItem" data-id="${i.id}" data-date="${w.date}" style="width:100%;text-align:left"><b>${i.start || ""}</b>${esc(i.title)}</button>`)
      .join("")}</div>`)
    .join("")}</div>`;
  return `<main class="screen">
    <header class="topbar"><div><p class="date">${date === d.today ? "Oggi" : itDate(date)}</p><h1>Agenda</h1></div>
      <div class="seg" style="width:170px"><button class="${S.agendaView === "day" ? "on" : ""}" data-act="agendaView" data-v="day">Giorno</button><button class="${S.agendaView === "week" ? "on" : ""}" data-act="agendaView" data-v="week">Settimana</button></div></header>
    ${dayStrip}
    <div class="section" style="margin-top:16px">${S.agendaView === "week" ? weekGrid : dayList}</div>
    <div class="row" style="margin-top:12px"><button class="btn block" data-act="openSheet" data-sheet="taskForm" data-date="${date}">${ic("plus")}Aggiungi impegno</button></div>
    <section class="section"><div class="section-head"><h2>Da fare</h2><span class="muted small">senza data</span></div>
      ${undated.length ? `<div class="card" style="padding:4px 12px"><ul class="timeline">${undated
        .map((t) => `<li class="tl-item"><button class="tl-main" data-act="openSheet" data-sheet="taskForm" data-id="${t.id}"><span class="tl-time">${t.priority === "alta" ? "!" : "·"}</span><span><span class="tl-title">${esc(t.title)}</span><span class="tl-sub">${t.area ? " · " + esc(t.area) : ""}${t.deadline ? " · entro " + itDate(t.deadline, false) : ""}</span></span></button><button class="check" data-act="taskDone" data-id="${t.id}" aria-label="Fatto">${ic("check")}</button></li>`)
        .join("")}</ul></div>` : `<p class="muted small">Niente in sospeso. Commissioni, task di lavoro, cose di casa: dille al coach e le metto qui o in agenda.</p>`}
    </section>
  </main>`;
}

// ---------- Progressi ----------
function progressView() {
  const d = S.data;
  const s = d.stats14;
  const m = d.statsMonth;
  const p = d.plan;
  const g = d.game;
  const labels = s.days.map((x) => DOW_SHORT[dowOf(x)][0].toUpperCase());
  const sum = (a) => a.reduce((x, y) => x + (Number(y) || 0), 0);
  const last7 = (a) => a.slice(-7);
  const blocks = [];

  blocks.push(`<div class="card"><div class="row between"><div class="level">${ring(g.progress, 56, g.level)}<div><b style="font-size:20px">${esc(g.name)}</b><p class="small muted">${g.points} punti · ${g.next - g.points} al prossimo livello</p></div></div></div>
    <div class="stat-row" style="margin-top:14px"><div class="stat" style="background:var(--s2)"><div class="v">${g.streak}</div><div class="k">serie di giorni</div></div><div class="stat" style="background:var(--s2)"><div class="v">${g.best}</div><div class="k">record</div></div><div class="stat" style="background:var(--s2)"><div class="v">${(g.badges || []).length}</div><div class="k">traguardi</div></div></div>
    ${(g.badges || []).length ? `<div class="chips" style="margin-top:12px">${g.badges.map((b) => `<span class="pill now">${esc(b.title)}</span>`).join("")}</div>` : ""}</div>`);

  const thisWeek = addDays(d.today, 1 - dowOf(d.today));
  const weekChallenges = (p.challenges || []).filter((c) => !c.week || c.week === thisWeek);
  if (weekChallenges.length)
    blocks.push(`<div class="card"><h3>Sfide della settimana</h3>${weekChallenges
      .map((c) => `<div style="margin-top:12px"><div class="row between"><span>${esc(c.title)}</span><span class="small ${c.done ? "" : "muted"}">${c.done ? "Completata" : `${c.progress}/${c.target}`}</span></div><div class="bar ${c.done ? "ok" : "now"}" style="margin-top:6px"><i style="width:${Math.min(100, (c.progress / c.target) * 100)}%"></i></div></div>`)
      .join("")}</div>`);

  if (p.smoking?.active || sum(s.cigarettes))
    blocks.push(`<div class="card"><div class="row between"><h3>Sigarette</h3><span class="small muted">ultimi 14 giorni</span></div>
      ${barChart(s.cigarettes, { labels, limit: s.limits, color: "var(--muted)" })}
      <div class="legend"><span><i style="background:var(--muted)"></i>fumate</span><span><i style="background:var(--muted);height:1px;border-top:1px dashed var(--muted)"></i>limite</span><span><i style="background:var(--bad)"></i>sopra il limite</span></div>
      <div class="stat-row" style="margin-top:12px"><div class="stat" style="background:var(--s2)"><div class="v">${(sum(last7(s.cigarettes)) / 7).toFixed(1)}</div><div class="k">media al giorno</div></div><div class="stat" style="background:var(--s2)"><div class="v">${d.smoking.savingsAll?.notSmoked ?? 0}</div><div class="k">non fumate</div></div><div class="stat" style="background:var(--s2)"><div class="v">${Math.round(d.smoking.savingsAll?.saved ?? 0)}<small>€</small></div><div class="k">risparmiati</div></div></div></div>`);

  blocks.push(`<div class="card"><div class="row between"><h3>Studio e lingue</h3><span class="small muted">minuti al giorno</span></div>${barChart(s.studyMin, { labels })}<p class="small muted">${sum(last7(s.studyMin))} minuti negli ultimi 7 giorni</p></div>`);

  const th = p.study?.thesis;
  if (th) {
    const paras = th.chapters.flatMap((c) => c.paragraphs);
    const doneP = paras.filter((x) => x.done).length;
    const left = th.deadline ? daysBetween(d.today, th.deadline) : null;
    blocks.push(`<div class="card"><div class="row between"><h3>${esc(th.title)}</h3>${left !== null ? `<span class="pill ${left < 14 ? "bad" : "now"}">${left} giorni</span>` : ""}</div>
      <div class="bar ok" style="margin-top:12px"><i style="width:${paras.length ? (doneP / paras.length) * 100 : 0}%"></i></div>
      <p class="small muted" style="margin-top:6px">${doneP}/${paras.length} paragrafi · ${sum(last7(s.thesisPages))}${th.weeklyPages ? "/" + th.weeklyPages : ""} pagine questa settimana</p>
      ${th.chapters.map((c, ci) => `<div style="margin-top:12px"><b>${esc(c.title)}</b>${c.paragraphs.map((x, pi) => `<button class="list-btn" data-act="toggleThesis" data-c="${ci}" data-p="${pi}" style="padding:9px 2px"><span class="${x.done ? "faint" : ""}" style="${x.done ? "text-decoration:line-through" : ""}">${esc(x.title)}</span><span class="check ${x.done ? "done" : ""}" style="width:24px;height:24px">${ic("check")}</span></button>`).join("")}</div>`).join("")}
      <button class="btn small ghost" style="margin-top:10px" data-act="editSection" data-section="study">Modifica tesi ed esami</button></div>`);
  }
  for (const e of p.study?.exams || []) {
    if (!e.date) continue;
    const left = daysBetween(d.today, e.date);
    if (left < 0) continue;
    blocks.push(`<div class="card row between"><div><h3>${esc(e.name)}</h3><p class="small muted">${itDate(e.date)}</p></div><div class="num" style="font-size:34px;font-weight:700">${left}<span class="faint" style="font-size:15px"> gg</span></div></div>`);
  }

  blocks.push(`<div class="card"><h3>Corpo</h3><div class="stat-row" style="margin-top:12px"><div class="stat" style="background:var(--s2)"><div class="v">${sum(last7(s.workouts))}</div><div class="k">allenamenti in 7 gg</div></div><div class="stat" style="background:var(--s2)"><div class="v">${sum(last7(s.runKm)).toFixed(1)}<small>km</small></div><div class="k">di corsa</div></div><div class="stat" style="background:var(--s2)"><div class="v">${s.sleepAvg ?? "–"}<small>h</small></div><div class="k">sonno medio</div></div></div>
    ${s.sleepPerDay.some((x) => x) ? `<p class="small muted" style="margin-top:12px">Sonno</p>${barChart(s.sleepPerDay.map((x) => x || 0), { labels, height: 80, highlightLast: false, color: "var(--muted)" })}` : ""}
    ${s.meals.length ? `<p class="small muted" style="margin-top:8px">Ultimi pasti: ${s.meals.slice(-3).map((x) => `${esc(x.note)} (${x.score ?? "–"}/5)`).join(" · ")}</p>` : ""}</div>`);

  const b = p.budget || {};
  const cats = Object.entries(b.categories || {});
  const sg = b.savingsGoal;
  blocks.push(`<div class="card"><div class="row between"><h3>Soldi di ${MONTHS[Number(d.today.slice(5, 7)) - 1]}</h3><button class="link" data-act="editSection" data-section="budget">Budget</button></div>
    <div class="stat-row" style="margin-top:12px"><div class="stat" style="background:var(--s2)"><div class="v">${Math.round(m.spentTotal)}<small>€</small></div><div class="k">spesi</div></div><div class="stat" style="background:var(--s2)"><div class="v">${Math.round(m.income)}<small>€</small></div><div class="k">entrate</div></div><div class="stat" style="background:var(--s2)"><div class="v">${Math.round(m.saved)}<small>€</small></div><div class="k">messi da parte</div></div></div>
    ${cats.map(([k, v]) => { const sp = m.spentByCat[k] || 0; const r = v ? sp / v : 0; return `<div style="margin-top:12px"><div class="row between small"><span>${esc(k)}</span><span class="${r > 1 ? "" : "muted"}" style="${r > 1 ? "color:var(--bad)" : ""}">${Math.round(sp)} / ${v} €</span></div><div class="bar ${r > 1 ? "bad" : r > 0.8 ? "now" : ""}" style="margin-top:5px"><i style="width:${Math.min(100, r * 100)}%"></i></div></div>`; }).join("")}
    ${sg ? `<div class="divider"></div><div class="row between small"><span>${esc(sg.title)}</span><span class="muted">obiettivo ${fmtEur(sg.target)}${sg.deadline ? " · " + itDate(sg.deadline, false) : ""}</span></div><p class="small muted" style="margin-top:4px">Ogni volta che metti da parte dei soldi, segnalo con il pulsante Risparmio qui sotto.</p>` : ""}
    <div class="row" style="margin-top:12px"><button class="btn small grow" data-act="quickLog" data-type="spesa">Spesa</button><button class="btn small grow" data-act="quickLog" data-type="entrata">Entrata</button><button class="btn small grow" data-act="quickLog" data-type="risparmio">Risparmio</button></div></div>`);

  if (p.goals?.length)
    blocks.push(`<div class="card"><div class="row between"><h3>Obiettivi</h3><button class="link" data-act="editSection" data-section="goals">Modifica</button></div>${p.goals
      .map((gl, gi) => {
        const done = gl.milestones.filter((x) => x.done).length;
        const pct = gl.milestones.length ? Math.round((done / gl.milestones.length) * 100) : 0;
        return `<div style="margin-top:16px"><div class="row between"><b>${esc(gl.title)}</b><span class="num" style="font-size:18px;font-weight:700">${pct}%</span></div><div class="bar ok" style="margin-top:6px"><i style="width:${pct}%"></i></div>${gl.milestones.map((ms, mi) => `<button class="list-btn" data-act="toggleMilestone" data-g="${gi}" data-m="${mi}" style="padding:8px 2px"><span class="small ${ms.done ? "faint" : ""}" style="${ms.done ? "text-decoration:line-through" : ""}">${esc(ms.title)}</span><span class="check ${ms.done ? "done" : ""}" style="width:24px;height:24px">${ic("check")}</span></button>`).join("")}</div>`;
      })
      .join("")}</div>`);

  if (d.reports.length)
    blocks.push(`<div class="card"><h3>Report</h3>${d.reports.map((r, i) => `<button class="list-btn" data-act="openSheet" data-sheet="report" data-i="${i}"><span><b>${esc(r.title)}</b><br><span class="small muted">${r.kind === "monthly" ? "Mese" : "Settimana"} · ${itDate(r.to, false)}</span></span>${ic("chev")}</button>`).join("")}</div>`);
  else blocks.push(`<p class="small muted" style="text-align:center">Il primo report arriva domenica sera.</p>`);

  return `<main class="screen"><header class="topbar"><div><p class="date">${itDate(d.today)}</p><h1>Progressi</h1></div></header><div class="stack">${blocks.join("")}</div></main>`;
}

// ---------- Lingue ----------
function langCode(l) {
  const map = { en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-PT" };
  return map[l] || l;
}
let wordLoading = false;
function autoLoadWord() {
  const code = S.learnLang;
  if (!code || wordLoading) return;
  const L = S.data.learn?.[code];
  if (L?.word?.date === S.data.today) return;
  wordLoading = true;
  api("/api/learn", { method: "POST", body: { kind: "word", lang: code } })
    .then((r) => setData(r.state))
    .catch(() => {})
    .finally(() => (wordLoading = false));
}
function learnView() {
  const d = S.data;
  const langs = d.plan.languages || [];
  if (!langs.length)
    return `<main class="screen"><header class="topbar"><h1>Lingue</h1></header><div class="card empty"><h3>Nessuna lingua nel piano</h3><p class="small">Dì al coach quale lingua vuoi imparare e a che livello sei: “voglio imparare l'inglese, sono A2”.</p></div></main>`;
  const code = S.learnLang || langs[0].code;
  const L = langs.find((l) => l.code === code) || langs[0];
  const data = d.learn?.[code] || {};
  const deck = data.deck || [];
  const due = deck.filter((c) => !c.due || c.due <= d.today);
  const w = data.word?.date === d.today ? data.word : null;
  const quiz = data.quiz;
  const quizDone = quiz?.result && quiz.week === addDays(d.today, 1 - dowOf(d.today));
  return `<main class="screen">
    <header class="topbar"><div><p class="date">${esc(L.level)}${L.goal ? " · " + esc(L.goal) : ""}</p><h1>${esc(L.name)}</h1></div></header>
    ${langs.length > 1 ? `<div class="seg" style="margin-bottom:14px">${langs.map((l) => `<button class="${l.code === code ? "on" : ""}" data-act="learnLang" data-code="${l.code}">${esc(l.name)}</button>`).join("")}</div>` : ""}
    <div class="stack">
      <section class="now-card">
        <div class="label later">Parola del giorno</div>
        ${w ? `<div class="row between" style="margin-top:10px"><div class="now-title" style="font-size:32px">${esc(w.word)}</div><button class="icon-btn" data-act="say" data-text="${attr(w.word + ". " + w.example)}" data-lang="${langCode(code)}" aria-label="Ascolta">${ic("speaker")}</button></div>
          ${w.pronunciation ? `<p class="faint small">${esc(w.pronunciation)}</p>` : ""}<p style="margin-top:6px">${esc(w.translation)}</p>
          <div class="inset" style="margin-top:12px"><p>${esc(w.example)}</p><p class="small muted" style="margin-top:4px">${esc(w.exampleIt)}</p></div>${w.tip ? `<p class="small muted" style="margin-top:10px">${esc(w.tip)}</p>` : ""}`
          : `<div style="padding:18px 0"><div class="spin"></div></div>`}
      </section>
      <div class="stat-row" style="grid-template-columns:1fr 1fr">
        <button class="stat" data-act="openSheet" data-sheet="cards" style="text-align:left"><div class="v">${due.length}</div><div class="k">flashcard da ripassare</div></button>
        <button class="stat" data-act="openSheet" data-sheet="quiz" style="text-align:left"><div class="v">${quizDone ? `${quiz.result.score}<small>/${quiz.result.total}</small>` : "–"}</div><div class="k">${quizDone ? "quiz della settimana" : "fai il quiz settimanale"}</div></button>
      </div>
      <button class="btn block" data-act="practice" data-lang="${esc(L.name)}">${ic("coach")}Fai conversazione con il coach</button>
      <section class="section">
        <div class="section-head"><h2>Frasi utili</h2>${data.phrases ? `<button class="link" data-act="loadPhrases" data-refresh="1">Nuove frasi</button>` : ""}</div>
        ${data.phrases ? data.phrases.groups.map((g) => `<div class="card" style="margin-bottom:10px"><h3>${esc(g.situation)}</h3>${g.phrases.map((ph) => `<button class="list-btn" data-act="say" data-text="${attr(ph.text)}" data-lang="${langCode(code)}"><span><span>${esc(ph.text)}</span><br><span class="small muted">${esc(ph.it)}</span></span>${ic("speaker")}</button>`).join("")}</div>`).join("") : `<button class="btn block ghost" data-act="loadPhrases">Prepara le frasi per le situazioni di tutti i giorni</button>`}
      </section>
    </div>
  </main>`;
}

// ---------- Tu ----------
function meView() {
  const d = S.data;
  const p = d.profile;
  const row = (act, title, sub, extra = "") => `<button class="list-btn" data-act="${act}" ${extra}><span><span>${title}</span>${sub ? `<br><span class="small muted">${sub}</span>` : ""}</span>${ic("chev")}</button>`;
  return `<main class="screen">
    <header class="topbar"><div><p class="date">${esc(p.email)}</p><h1>${esc(p.name || "Tu")}</h1></div></header>
    <div class="stack-l">
      <section><div class="section-head"><h2>Il tuo piano</h2></div><div class="card" style="padding:2px 14px">
        ${row("openSheet", "Routine settimanale", `${d.plan.routine.length} attività`, 'data-sheet="routine"')}
        ${row("editSection", "Schede palestra", `${d.plan.workouts.length} schede`, 'data-section="workouts"')}
        ${row("editSection", "Sigarette", d.plan.smoking?.active ? `limite di oggi: ${d.smoking.limit ?? "—"}` : "non attivo", 'data-section="smoking"')}
        ${row("editSection", "Soldi e budget", "", 'data-section="budget"')}
        ${row("editSection", "Studio, esami e tesi", "", 'data-section="study"')}
        ${row("editSection", "Obiettivi", `${d.plan.goals.length} obiettivi`, 'data-section="goals"')}
        ${row("editSection", "Date importanti", `${d.plan.importantDates.length} date`, 'data-section="importantDates"')}
        ${row("editSection", "Acqua", d.plan.water?.enabled ? `ogni ${d.plan.water.everyHours} ore` : "spento", 'data-section="water"')}
        ${row("editSection", "Lingue", d.plan.languages.map((l) => l.name).join(", "), 'data-section="languages"')}
      </div></section>
      <section><div class="section-head"><h2>Coach</h2></div><div class="card" style="padding:2px 14px">
        ${row("openSheet", "Cosa sa di te", `${d.memory.length} ricordi`, 'data-sheet="memory"')}
        ${row("openSheet", "Impostazioni del coach", "tono, solleciti, voce", 'data-sheet="settings"')}
        ${row("enablePush", "Notifiche", d.pushDevices ? `attive su ${d.pushDevices} ${d.pushDevices === 1 ? "dispositivo" : "dispositivi"}` : "non attive")}
        ${d.pushDevices ? row("testPush", "Manda una notifica di prova", "") : ""}
        ${row("openSheet", "Il profilo che il coach ha di te", "", 'data-sheet="profileSummary"')}
      </div></section>
      <section class="stack"><button class="btn ghost block" data-act="redoInterview">Rifai l'intervista iniziale</button><button class="btn danger block" data-act="logout">Esci</button></section>
    </div>
  </main>`;
}

/* Coach Life — fogli (finestre dal basso) e azioni. */
"use strict";

const CATS = ["sveglia", "lavoro", "sport", "studio", "lingua", "progetto", "casa", "commissione", "sociale", "coppia", "salute", "soldi", "sonno", "checkin", "altro"];
const EXP_CATS = ["cibo", "uscite", "trasporti", "sigarette", "casa", "salute", "svago", "abbigliamento", "altro"];

function findItem(id, date) {
  const d = S.data;
  const day = d.week.find((w) => w.date === date);
  let it = day?.items.find((i) => i.id === id);
  if (!it && date === d.today) it = d.todayItems.find((i) => i.id === id);
  if (!it) {
    // giorno fuori dalla settimana visibile: ricostruisci dal piano
    const r = d.plan.routine.find((a) => a.id === id);
    const t = d.plan.tasks.find((x) => x.id === id);
    if (r) it = { ...r, type: "routine", state: {} };
    if (t) it = { ...t, type: "task", state: {} };
  }
  return it;
}

const head = (title, sub = "") => `<div class="sheet-head"><div><h2>${title}</h2>${sub ? `<p class="small muted" style="margin-top:3px">${sub}</p>` : ""}</div><button class="icon-btn" data-act="closeSheet" aria-label="Chiudi">${ic("x")}</button></div>`;
const bindInput = (path, type = "text", extra = "") => `<input class="input" type="${type}" data-bind="${path}" ${type === "number" ? 'inputmode="decimal" data-num' : ""} value="${attr(getPath(S.draft, path) ?? "")}" ${extra}>`;
const field = (label, inner) => `<label class="field"><span>${label}</span>${inner}</label>`;

const SHEETS = {
  // ----- Chat completa -----
  chat: {
    full: true,
    render() {
      return `${head("Coach", "Scrivi o tieni premuto il microfono")}<div data-thread="300" data-scroll="self" style="flex:1;overflow:auto;padding-bottom:90px">${threadHtml(300)}</div>${composerHtml({ id: "sheet", noTabs: true })}`;
    },
  },

  // ----- Attività -----
  item: {
    render({ id, date, end }) {
      const it = findItem(id, date);
      if (!it) return head("Attività") + '<p class="muted">Non trovata.</p>';
      const st = it.state?.status;
      const isToday = date === S.data.today;
      const editBtn = it.type === "task" ? `<button class="btn small ghost" data-act="openSheet" data-sheet="taskForm" data-id="${it.id}">${ic("edit")}Modifica</button>` : `<button class="btn small ghost" data-act="openSheet" data-sheet="routineForm" data-id="${it.id}">${ic("edit")}Modifica routine</button>`;
      const fb = S.sheet.props.mode === "done" || end;
      const skipMode = S.sheet.props.mode === "skip";
      let body = "";
      if (fb) {
        body = `<div class="stack"><p class="q" style="font-family:var(--display);font-size:20px;font-weight:600">Com'è andata?</p>
          <div class="chips">${[1, 2, 3, 4, 5].map((n) => `<button class="chip${S.sheet.props.rating === n ? " on" : ""}" data-act="rate" data-n="${n}">${["", "Male", "Così così", "Bene", "Molto bene", "Benissimo"][n]}</button>`).join("")}</div>
          <textarea class="input" id="fb-note" placeholder="Note (facoltativo): cosa hai fatto, cosa ti ha bloccato…">${esc(S.sheet.props.note || "")}</textarea>
          <div class="row"><button class="btn primary grow" data-act="confirmDone" data-id="${it.id}" data-date="${date}">Segna come fatto</button><button class="btn" data-act="skipItem" data-id="${it.id}" data-date="${date}">Non l'ho fatto</button></div></div>`;
      } else if (skipMode) {
        body = `<div class="stack"><p>Perché salti? Il coach ti propone quando recuperare.</p>
          <div class="chips">${["Stanco", "Imprevisto", "Lavoro", "Non avevo voglia", "Malato", "Altro"].map((r) => `<button class="chip" data-act="skipReason" data-r="${attr(r)}">${r}</button>`).join("")}</div>
          <input class="input" id="skip-reason" placeholder="Oppure scrivi il motivo">
          <button class="btn danger block" data-act="confirmSkip" data-id="${it.id}" data-date="${date}">Salta (−5 punti)</button></div>`;
      } else {
        body = `<div class="stack">
          ${st !== "started" ? `<button class="btn now block" data-act="startItem" data-id="${it.id}" data-date="${date}">${ic("play")}Inizia adesso</button>` : `<button class="btn now block" data-act="activityMode" data-id="${it.id}">${ic("play")}Modalità attività</button>`}
          <div class="row">${[15, 30, 60].map((m) => `<button class="btn grow" data-act="snoozeItem" data-id="${it.id}" data-date="${date}" data-m="${m}">${ic("snooze")}${m} min</button>`).join("")}</div>
          <div class="row"><button class="btn primary grow" data-act="markDone" data-id="${it.id}">${ic("check")}Fatto</button><button class="btn grow" data-act="skipItem" data-id="${it.id}" data-date="${date}">${ic("skip")}Salta</button></div>
          ${st ? `<button class="link small" data-act="resetItem" data-id="${it.id}" data-date="${date}">Annulla stato (${STATUS_LABEL[st]})</button>` : ""}
        </div>`;
      }
      return `${head(esc(it.title), `${isToday ? "Oggi" : itDate(date)} · ${it.start || ""}${it.end ? "–" + it.end : ""}${it.location ? " · " + esc(it.location) : ""}`)}
        ${it.notes ? `<p class="muted small" style="margin-bottom:14px">${esc(it.notes)}</p>` : ""}
        ${st ? `<p style="margin-bottom:12px"><span class="pill ${st === "done" ? "ok" : st === "skipped" ? "bad" : "now"}">${STATUS_LABEL[st]}${it.state.rating ? " · voto " + it.state.rating + "/5" : ""}</span>${it.state.reason ? ` <span class="small muted">${esc(it.state.reason)}</span>` : ""}</p>` : ""}
        ${body}
        <div class="divider"></div>
        <div class="row between">${editBtn}<button class="btn small ghost" data-act="askAbout" data-id="${it.id}">${ic("coach")}Chiedi al coach</button></div>`;
    },
  },

  // ----- Modalità attività (schermo intero con timer e coach) -----
  activity: {
    full: true,
    render({ id }) {
      const it = findItem(id, S.data.today);
      if (!it) return head("Attività");
      const w = it.workoutId ? S.data.plan.workouts.find((x) => x.id === it.workoutId) : null;
      const sets = S.sheet.props.sets || {};
      const ex = w
        ? `<div class="card" style="margin-top:14px"><h3>${esc(w.name)}</h3>${w.exercises
            .map((e, ei) => `<div class="ex"><div><b>${esc(e.name)}</b><div class="small muted">${e.sets}×${esc(e.reps)}${e.rest ? " · recupero " + esc(e.rest) : ""}${e.notes ? " · " + esc(e.notes) : ""}</div>
              <div class="sets">${Array.from({ length: e.sets }, (_, si) => `<button class="set${sets[ei + "-" + si] ? " on" : ""}" data-act="toggleSet" data-e="${ei}" data-s="${si}">${si + 1}</button>`).join("")}</div></div>
              <input class="input" style="width:84px;min-height:40px;text-align:center" placeholder="kg" value="${attr(S.sheet.props.weights?.[ei] ?? e.weight ?? "")}" data-weight="${ei}" inputmode="decimal"></div>`)
            .join("")}</div>`
        : "";
      return `<div class="sheet-head"><button class="icon-btn" data-act="closeSheet" aria-label="Chiudi">${ic("back")}</button><span class="muted small">Modalità attività</span><span style="width:40px"></span></div>
        <h1 style="text-align:center">${esc(it.title)}</h1>
        <div class="timer" id="timer">00:00</div>
        <p class="muted small" style="text-align:center">${it.start || ""}${it.end ? " – " + it.end : ""}</p>
        ${ex}
        <div class="section" style="padding-bottom:110px"><div class="section-head"><h2>Coach</h2><span class="small muted">chiedigli qualsiasi cosa</span></div><div data-thread="8">${threadHtml(8)}</div>
        <button class="btn primary block" style="margin-top:16px" data-act="finishActivity" data-id="${it.id}">${ic("check")}Ho finito</button></div>
        ${composerHtml({ id: "sheet", noTabs: true, placeholder: "Es. che esercizio faccio adesso?" })}`;
    },
    after({ id }) {
      const it = findItem(id, S.data.today);
      S.voiceCtx = { activityId: id };
      startTimer(it?.state?.startedAt || S.sheet.props.t0 || (S.sheet.props.t0 = Date.now()));
    },
  },

  // ----- Bilancio della sera -----
  checkin: {
    render() {
      const d = S.data;
      const c = S.draft;
      const sm = d.smoking;
      const spent = d.logsToday.filter((l) => l.type === "spesa");
      const scale = (key, labels) => `<div class="chips">${labels.map((l, i) => `<button class="chip${c[key] === i + 1 ? " on" : ""}" data-act="draftSet" data-path="${key}" data-v="${i + 1}" data-num>${l}</button>`).join("")}</div>`;
      return `${head("Bilancio della giornata", "Due minuti, poi stacchi.")}
      <div class="stack-l">
        ${d.plan.smoking?.active ? `<div><p class="q" style="font-weight:600">Sigarette</p><p class="small muted">Registrate oggi: ${sm.today}${sm.limit !== null ? ` (limite ${sm.limit})` : ""}. Se ne mancano, aggiungile.</p><div class="row" style="margin-top:8px"><button class="btn small" data-act="draftInc" data-path="extraCigarettes" data-n="-1">−</button><span class="num" style="font-size:24px;min-width:36px;text-align:center">${c.extraCigarettes || 0}</span><button class="btn small" data-act="draftInc" data-path="extraCigarettes" data-n="1">+</button><span class="small muted">in più</span></div></div>` : ""}
        <div><p class="q" style="font-weight:600">Spese di oggi</p><p class="small muted">${spent.length ? spent.map((l) => `${esc(l.note || l.category)} ${fmtEur(l.value)}`).join(" · ") : "Nessuna spesa registrata."}</p><button class="btn small ghost" style="margin-top:8px" data-act="quickLog" data-type="spesa" data-back="checkin">${ic("plus")}Aggiungi spesa</button></div>
        <div>${field("Ore dormite stanotte", bindInput("sleep", "number", 'step="0.5" placeholder="Es. 7"'))}</div>
        <div><p class="q" style="font-weight:600;margin-bottom:8px">Umore</p>${scale("mood", ["Pessimo", "Giù", "Ok", "Bene", "Top"])}</div>
        <div><p class="q" style="font-weight:600;margin-bottom:8px">Energia</p>${scale("energy", ["Zero", "Poca", "Normale", "Buona", "Tanta"])}</div>
        ${field("Cosa è andato bene oggi?", `<textarea class="input" data-bind="good">${esc(c.good || "")}</textarea>`)}
        ${field("Cosa migliori domani?", `<textarea class="input" data-bind="improve">${esc(c.improve || "")}</textarea>`)}
        <div><p class="q" style="font-weight:600;margin-bottom:8px">Voto alla giornata</p><div class="chips">${[1, 2, 3, 4, 5].map((n) => `<button class="chip${c.score === n ? " on" : ""}" data-act="draftSet" data-path="score" data-v="${n}" data-num>${n}</button>`).join("")}</div></div>
        <button class="btn primary block" data-act="saveCheckin">Chiudi la giornata</button>
      </div>`;
    },
  },

  // ----- Registrazione veloce -----
  quickLog: {
    render() {
      const t = S.draft.type;
      const types = [
        ["sigaretta", "Sigaretta"], ["spesa", "Spesa"], ["entrata", "Entrata"], ["risparmio", "Risparmio"], ["pasto", "Pasto"], ["acqua", "Acqua"],
        ["sonno", "Sonno"], ["corsa", "Corsa"], ["allenamento", "Allenamento"], ["studio", "Studio"], ["tesi", "Tesi"], ["lingua", "Lingua"],
        ["progetto", "Progetto"], ["lavoro", "Task lavoro"], ["peso", "Peso"], ["umore", "Umore"],
      ];
      let f = "";
      const num = (label, ph = "") => field(label, bindInput("value", "number", `placeholder="${ph}"`));
      const note = (label, ph = "") => field(label, bindInput("note", "text", `placeholder="${ph}"`));
      if (t === "spesa") f = num("Quanto (€)", "Es. 12,50") + `<div class="chips">${EXP_CATS.map((c) => `<button class="chip${S.draft.category === c ? " on" : ""}" data-act="draftSet" data-path="category" data-v="${c}">${c}</button>`).join("")}</div>` + note("Cosa", "Es. pranzo");
      else if (t === "entrata") f = num("Quanto (€)") + note("Da dove", "Es. stipendio, progetto");
      else if (t === "risparmio") f = num("Quanto hai messo da parte (€)") + note("Per cosa", "");
      else if (t === "pasto") f = note("Cosa hai mangiato", "Es. pasta al tonno e insalata") + `<p class="small muted">Voto</p><div class="chips">${[1, 2, 3, 4, 5].map((n) => `<button class="chip${S.draft.value === n ? " on" : ""}" data-act="draftSet" data-path="value" data-v="${n}" data-num>${n}</button>`).join("")}</div>`;
      else if (t === "sonno") f = num("Ore dormite", "Es. 7,5");
      else if (t === "corsa") f = num("Chilometri", "Es. 5") + field("Minuti", bindInput("minutes", "number"));
      else if (t === "allenamento") f = note("Cosa hai fatto", "Es. scheda A, petto e tricipiti");
      else if (["studio", "lingua", "progetto"].includes(t)) f = num(t === "progetto" ? "Ore" : "Minuti") + note("Note", "");
      else if (t === "tesi") f = num("Pagine scritte") + note("Su cosa", "Es. paragrafo 2.1");
      else if (t === "lavoro") f = note("Task completato", "");
      else if (t === "peso") f = num("Peso (kg)");
      else if (t === "umore") f = `<div class="chips">${["Pessimo", "Giù", "Ok", "Bene", "Top"].map((l, i) => `<button class="chip${S.draft.value === i + 1 ? " on" : ""}" data-act="draftSet" data-path="value" data-v="${i + 1}" data-num>${l}</button>`).join("")}</div>`;
      else if (t === "sigaretta") f = `<p class="muted">Una sigaretta in più nel conteggio di oggi.</p>`;
      else if (t === "acqua") f = `<p class="muted">Un bicchiere d'acqua.</p>`;
      return `${head("Registra")}
        <div class="chips" style="margin-bottom:16px">${types.map(([k, l]) => `<button class="chip${t === k ? " on" : ""}" data-act="draftSet" data-path="type" data-v="${k}" data-rerender>${l}</button>`).join("")}</div>
        <div class="stack">${f}<button class="btn primary block" data-act="saveLog">Salva</button></div>
        <p class="small muted" style="margin-top:14px">Più veloce: dillo al coach. “Ho speso 8 euro di pranzo e fumato 2 sigarette.”</p>`;
    },
  },

  // ----- Impegno singolo -----
  taskForm: {
    render() {
      const t = S.draft;
      return `${head(t.id ? "Modifica impegno" : "Nuovo impegno", "Ti scrivo all'orario e ti sollecito finché non rispondi.")}
      <div class="stack">
        ${field("Cosa", bindInput("title", "text", 'placeholder="Es. spedire il pacco in posta"'))}
        <div class="form-grid">${field("Giorno", bindInput("date", "date"))}${field("Priorità", `<select class="input" data-bind="priority">${["alta", "media", "bassa"].map((p) => `<option ${t.priority === p ? "selected" : ""}>${p}</option>`).join("")}</select>`)}</div>
        <div class="form-grid">${field("Inizio", bindInput("start", "time"))}${field("Fine", bindInput("end", "time"))}</div>
        ${field("Dove", bindInput("location", "text", 'placeholder="Facoltativo"'))}
        ${field("Area", `<div class="chips">${["commissione", "lavoro", "casa", "coppia", "sociale", "salute", "soldi", "studio"].map((c) => `<button class="chip${t.category === c ? " on" : ""}" data-act="draftSet" data-path="category" data-v="${c}">${c}</button>`).join("")}</div>`)}
        ${field("Note", `<textarea class="input" data-bind="notes">${esc(t.notes || "")}</textarea>`)}
        <p class="small muted">Senza giorno finisce nella lista “Da fare”.</p>
        <button class="btn primary block" data-act="saveTask">${t.id ? "Salva" : "Aggiungi"}</button>
        ${t.id ? `<button class="btn danger block" data-act="deleteTask" data-id="${t.id}">Elimina</button>` : `<button class="btn ghost block" data-act="askTask">${ic("coach")}Decidi tu quando, coach</button>`}
      </div>`;
    },
  },

  // ----- Routine -----
  routine: {
    render() {
      const r = S.data.plan.routine;
      return `${head("Routine settimanale", "Tocca un'attività per modificarla")}
        <div class="stack" style="margin-top:16px">${r.length ? `<div class="card" style="padding:2px 12px">${[...r].sort((a, b) => toMin(a.start) - toMin(b.start)).map((a) => `<button class="list-btn" data-act="openSheet" data-sheet="routineForm" data-id="${a.id}"><span><span>${esc(a.title)}</span><br><span class="small muted">${a.start}${a.end ? "–" + a.end : ""} · ${a.days.map((d) => DOW_SHORT[d]).join(" ")}</span></span>${ic("chev")}</button>`).join("")}</div>` : ""}
        <button class="btn primary block" data-act="openSheet" data-sheet="routineForm">${ic("plus")}Aggiungi attività</button></div>`;
    },
  },
  routineForm: {
    render() {
      const a = S.draft;
      return `${head(a.id ? "Modifica attività" : "Nuova attività")}
      <div class="stack">
        ${field("Nome", bindInput("title", "text", 'placeholder="Es. Palestra"'))}
        <div class="form-grid">${field("Inizio", bindInput("start", "time"))}${field("Fine", bindInput("end", "time"))}</div>
        ${field("Giorni", `<div class="chips">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<button class="chip${(a.days || []).includes(d) ? " on" : ""}" data-act="toggleDay" data-d="${d}">${DOW_SHORT[d]}</button>`).join("")}</div>`)}
        ${field("Categoria", `<select class="input" data-bind="category">${CATS.map((c) => `<option ${a.category === c ? "selected" : ""}>${c}</option>`).join("")}</select>`)}
        ${S.data.plan.workouts.length ? field("Scheda palestra", `<select class="input" data-bind="workoutId"><option value="">Nessuna</option>${S.data.plan.workouts.map((w) => `<option value="${w.id}" ${a.workoutId === w.id ? "selected" : ""}>${esc(w.name)}</option>`).join("")}</select>`) : ""}
        ${field("Note", bindInput("notes"))}
        <label class="row"><input type="checkbox" data-bind="nag" data-bool ${a.nag !== false ? "checked" : ""}> <span>Sollecitami finché non rispondo</span></label>
        <button class="btn primary block" data-act="saveRoutine">${a.id ? "Salva" : "Aggiungi"}</button>
        ${a.id ? `<button class="btn danger block" data-act="deleteRoutine" data-id="${a.id}">Elimina dalla routine</button>` : ""}
      </div>`;
    },
  },

  // ----- Sezioni del piano -----
  section: {
    render({ section }) {
      const R = SECTION_EDITORS[section];
      return `${head(R.title, R.sub || "")}<div class="stack">${R.render()}<button class="btn primary block" data-act="saveSection" data-section="${section}">Salva</button></div>`;
    },
  },

  // ----- Impostazioni -----
  settings: {
    render() {
      const s = S.draft;
      const vs = itVoices();
      const seg = (path, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(getPath(s, path)) === String(v) ? "on" : ""}" data-act="draftSet" data-path="${path}" data-v="${v}" ${typeof v === "number" ? "data-num" : ""}>${l}</button>`).join("")}</div>`;
      return `${head("Impostazioni del coach")}
      <div class="stack-l">
        ${field("Nome", bindInput("name"))}
        <div><p class="small muted" style="margin-bottom:6px">Tono</p>${seg("settings.tone", [["severo", "Severo"], ["amico", "Amico"], ["gentile", "Gentile"], ["ironico", "Ironico"]])}</div>
        <div><p class="small muted" style="margin-bottom:6px">Solleciti se non rispondi</p>${seg("settings.nagEvery", [[5, "ogni 5 min"], [10, "ogni 10"], [15, "ogni 15"]])}<div style="margin-top:8px">${seg("settings.nagMax", [[2, "max 2"], [4, "max 4"], [12, "finché rispondo"]])}</div></div>
        <div><p class="small muted" style="margin-bottom:6px">Risposte a voce</p>${seg("settings.voiceReply", [["auto", "Se parlo io"], ["sempre", "Sempre"], ["mai", "Mai"]])}</div>
        <div>${field("Voce del coach", vs.length ? `<select class="input" data-bind="settings.voiceName"><option value="">Automatica</option>${vs.map((v) => `<option ${s.settings.voiceName === v.name ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select>` : `<p class="small muted">Nessuna voce italiana trovata su questo dispositivo.</p>`)}
          <div class="row" style="margin-top:8px"><span class="small muted">Velocità</span><input type="range" min="0.8" max="1.4" step="0.05" data-bind="settings.voiceRate" data-num value="${s.settings.voiceRate || 1.05}" class="grow"><button class="btn small" data-act="testVoice">${ic("speaker")}Prova</button></div></div>
        <label class="row"><input type="checkbox" data-bind="settings.practiceLanguages" data-bool ${s.settings.practiceLanguages !== false ? "checked" : ""}> <span>Fammi praticare le lingue ogni tanto</span></label>
        <button class="btn primary block" data-act="saveSettings">Salva</button>
      </div>`;
    },
  },

  memory: {
    render() {
      const m = S.data.memory;
      return `${head("Cosa sa di te il coach", "Puoi cancellare quello che vuoi")}
        ${m.length ? `<div class="card" style="padding:2px 12px">${[...m].reverse().map((x) => `<div class="list-btn"><span class="small">${esc(x.text)}</span><button class="icon-btn" data-act="forget" data-id="${x.id}" aria-label="Cancella">${ic("trash")}</button></div>`).join("")}</div>` : `<p class="muted">Ancora niente. Più parli con il coach, più ti conosce.</p>`}`;
    },
  },
  profileSummary: {
    render() {
      return `${head("Il tuo profilo", "Scritto dal coach dopo l'intervista")}<div class="md">${md(S.data.profile.summary || "Ancora vuoto.")}</div>`;
    },
  },
  report: {
    render({ i }) {
      const r = S.data.reports[Number(i)];
      return r ? `${head(esc(r.title), `${itDate(r.from, false)} – ${itDate(r.to, false)}`)}<div class="md">${md(r.text)}</div>` : head("Report");
    },
  },
  install: {
    render() {
      return `${head("Installa Coach Life", "Su iPhone le notifiche funzionano solo dall'app installata")}
        <ol class="stack" style="padding-left:20px;margin:0">
          <li>Apri questa pagina con <b>Safari</b>.</li>
          <li>Tocca il pulsante <b>Condividi</b> (il quadrato con la freccia in su).</li>
          <li>Scegli <b>Aggiungi alla schermata Home</b> e conferma.</li>
          <li>Apri Coach Life dall'icona sulla Home, accedi e tocca <b>Attiva le notifiche</b>.</li>
        </ol>
        <p class="small muted" style="margin-top:16px">Su iPhone le notifiche non hanno pulsanti: toccale e l'app si apre già sull'attività con Inizia, Rimanda e Salta.</p>`;
    },
  },

  // ----- Flashcard -----
  cards: {
    render() {
      const code = S.learnLang;
      const deck = S.data.learn?.[code]?.deck || [];
      const due = deck.filter((c) => !c.due || c.due <= S.data.today);
      const c = due[0];
      const flipped = S.sheet.props.flipped;
      return `${head("Flashcard", `${due.length} da ripassare · ${deck.length} in totale`)}
        ${c ? `<button class="flash" data-act="flip" style="width:100%"><div><div class="front">${esc(flipped ? c.back : c.front)}</div><p class="small muted" style="margin-top:10px">${flipped ? "La sapevi?" : "Tocca per girare"}</p></div></button>
          ${flipped ? `<div class="row" style="margin-top:12px"><button class="btn grow danger" data-act="review" data-id="${c.id}" data-ok="0">Non la sapevo</button><button class="btn grow primary" data-act="review" data-id="${c.id}" data-ok="1">La sapevo</button></div>` : `<div class="row" style="margin-top:12px"><button class="btn grow" data-act="say" data-text="${attr(c.front)}" data-lang="${langCode(code)}">${ic("speaker")}Ascolta</button></div>`}`
          : `<div class="empty"><h3>Tutto ripassato</h3><p class="small">Torna domani, o aggiungi nuove carte.</p></div>`}
        <div class="divider"></div>
        <button class="btn block" data-act="moreCards" ${S.sheet.props.loading ? "disabled" : ""}>${S.sheet.props.loading ? "Preparo le carte…" : "+10 carte nuove"}</button>`;
    },
  },

  // ----- Quiz settimanale -----
  quiz: {
    render() {
      const code = S.learnLang;
      const q = S.data.learn?.[code]?.quiz;
      const pr = S.sheet.props;
      if (!q || pr.loading) return `${head("Quiz della settimana")}<div style="padding:30px 0"><div class="spin"></div><p class="muted small" style="text-align:center;margin-top:12px">Preparo le domande…</p></div>`;
      const i = pr.i || 0;
      if (i >= q.questions.length) {
        const score = pr.score || 0;
        return `${head("Quiz della settimana")}<div class="empty"><div class="num" style="font-size:64px;font-weight:700;color:var(--text)">${score}/${q.questions.length}</div><p>${score >= 8 ? "Ottimo. Il livello si alza." : score >= 5 ? "Bene, ma si può fare di più." : "Va ripassato. Il coach ti aiuta."}</p></div><button class="btn primary block" data-act="closeSheet">Chiudi</button>`;
      }
      const cur = q.questions[i];
      const ans = pr.answer;
      return `${head("Quiz della settimana", `Domanda ${i + 1} di ${q.questions.length}`)}
        <p style="font-family:var(--display);font-size:21px;font-weight:600;line-height:1.25">${esc(cur.q)}</p>
        ${cur.options.map((o, k) => `<button class="quiz-opt${ans !== undefined ? (k === cur.answer ? " right" : k === ans ? " wrong" : "") : ""}" data-act="quizAnswer" data-k="${k}" ${ans !== undefined ? "disabled" : ""}>${esc(o)}</button>`).join("")}
        ${ans !== undefined ? `<p class="small muted" style="margin-top:12px">${esc(cur.explain)}</p><button class="btn primary block" style="margin-top:14px" data-act="quizNext">${i + 1 === q.questions.length ? "Vedi il risultato" : "Avanti"}</button>` : ""}`;
    },
  },
};

// ----- Editor delle sezioni del piano -----
const SECTION_EDITORS = {
  workouts: {
    title: "Schede palestra",
    sub: "Il coach te le ha preparate: cambia quello che vuoi.",
    render() {
      const ws = S.draft || [];
      return ws
        .map((w, wi) => `<div class="card"><div class="row">${bindInput(`${wi}.name`, "text", 'placeholder="Nome scheda"')}<button class="icon-btn" data-act="draftDel" data-path="" data-i="${wi}" aria-label="Elimina scheda">${ic("trash")}</button></div>
          ${field("Obiettivo", bindInput(`${wi}.focus`))}
          ${(w.exercises || []).map((e, ei) => `<div class="inset" style="margin-top:10px"><div class="row">${bindInput(`${wi}.exercises.${ei}.name`, "text", 'placeholder="Esercizio"')}<button class="icon-btn" data-act="draftDel" data-path="${wi}.exercises" data-i="${ei}">${ic("x")}</button></div>
            <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr;margin-top:8px">${field("Serie", bindInput(`${wi}.exercises.${ei}.sets`, "number"))}${field("Ripetizioni", bindInput(`${wi}.exercises.${ei}.reps`))}${field("Kg", bindInput(`${wi}.exercises.${ei}.weight`))}</div></div>`).join("")}
          <button class="btn small ghost" style="margin-top:10px" data-act="draftAdd" data-path="${wi}.exercises" data-tpl="exercise">${ic("plus")}Esercizio</button></div>`)
        .join("") + `<button class="btn block ghost" data-act="draftAdd" data-path="" data-tpl="workout">${ic("plus")}Nuova scheda</button>`;
    },
  },
  smoking: {
    title: "Sigarette",
    render() {
      const s = S.draft;
      return `<label class="row"><input type="checkbox" data-bind="active" data-bool ${s.active ? "checked" : ""}> <span>Piano per smettere attivo</span></label>
        <div class="form-grid">${field("Prima fumavi (al giorno)", bindInput("baseline", "number"))}${field("Prezzo pacchetto €", bindInput("pricePerPack", "number"))}</div>
        <div class="form-grid">${field("Inizio piano", bindInput("startDate", "date"))}${field("Data per smettere", bindInput("quitDate", "date"))}</div>
        <p class="small muted">Tappe: da quel giorno il limite giornaliero è…</p>
        ${(s.steps || []).map((st, i) => `<div class="row">${bindInput(`steps.${i}.from`, "date")}${bindInput(`steps.${i}.limit`, "number", 'style="width:90px"')}<button class="icon-btn" data-act="draftDel" data-path="steps" data-i="${i}">${ic("x")}</button></div>`).join("")}
        <button class="btn small ghost" data-act="draftAdd" data-path="steps" data-tpl="step">${ic("plus")}Tappa</button>
        <div class="banner">${ic("spark")}<span class="small">Smettere è più facile con un aiuto: il medico di base o un centro antifumo. In Italia c'è il Telefono Verde contro il Fumo: 800 554 088 (gratuito).</span></div>`;
    },
  },
  budget: {
    title: "Soldi e budget",
    render() {
      const b = S.draft;
      const cats = Object.keys(b.categories || {});
      return `<div class="form-grid">${field("Giorno dello stipendio", bindInput("payday", "number"))}${field("Entrate al mese €", bindInput("monthlyIncome", "number", 'placeholder="Facoltativo"'))}</div>
        <h3>Budget mensile per categoria</h3>
        ${cats.map((c) => `<div class="row"><span class="grow">${esc(c)}</span>${bindInput(`categories.${c}`, "number", 'style="width:110px"')}<button class="icon-btn" data-act="delCat" data-c="${attr(c)}">${ic("x")}</button></div>`).join("")}
        <div class="chips">${EXP_CATS.filter((c) => !cats.includes(c)).map((c) => `<button class="chip" data-act="addCat" data-c="${c}">+ ${c}</button>`).join("")}</div>
        <h3>Spese fisse e risparmi automatici</h3>
        ${(b.fixed || []).map((f, i) => `<div class="inset"><div class="row">${bindInput(`fixed.${i}.title`, "text", 'placeholder="Es. rata corso"')}<button class="icon-btn" data-act="draftDel" data-path="fixed" data-i="${i}">${ic("x")}</button></div><div class="form-grid" style="margin-top:8px">${field("€", bindInput(`fixed.${i}.amount`, "number"))}${field("Giorno", bindInput(`fixed.${i}.day`, "number"))}</div><label class="row small" style="margin-top:8px"><input type="checkbox" data-bind="fixed.${i}.saving" data-bool ${f.saving ? "checked" : ""}> È un risparmio da mettere da parte</label></div>`).join("")}
        <button class="btn small ghost" data-act="draftAdd" data-path="fixed" data-tpl="fixed">${ic("plus")}Spesa fissa</button>
        <h3>Obiettivo di risparmio</h3>
        ${b.savingsGoal ? `${field("Per cosa", bindInput("savingsGoal.title"))}<div class="form-grid">${field("Quanto €", bindInput("savingsGoal.target", "number"))}${field("Entro", bindInput("savingsGoal.deadline", "date"))}</div>` : `<button class="btn small ghost" data-act="draftSetObj" data-path="savingsGoal">${ic("plus")}Aggiungi obiettivo</button>`}`;
    },
  },
  study: {
    title: "Studio, esami e tesi",
    render() {
      const s = S.draft;
      const th = s.thesis;
      return `<h3>Esami</h3>
        ${(s.exams || []).map((e, i) => `<div class="inset"><div class="row">${bindInput(`exams.${i}.name`, "text", 'placeholder="Esame"')}<button class="icon-btn" data-act="draftDel" data-path="exams" data-i="${i}">${ic("x")}</button></div><div style="margin-top:8px">${field("Data", bindInput(`exams.${i}.date`, "date"))}</div></div>`).join("")}
        <button class="btn small ghost" data-act="draftAdd" data-path="exams" data-tpl="exam">${ic("plus")}Esame</button>
        <h3>Tesi</h3>
        ${th ? `${field("Titolo o argomento", bindInput("thesis.title"))}<div class="form-grid">${field("Consegna", bindInput("thesis.deadline", "date"))}${field("Pagine a settimana", bindInput("thesis.weeklyPages", "number"))}</div>
          ${(th.chapters || []).map((c, ci) => `<div class="card flat"><div class="row">${bindInput(`thesis.chapters.${ci}.title`, "text", 'placeholder="Capitolo"')}<button class="icon-btn" data-act="draftDel" data-path="thesis.chapters" data-i="${ci}">${ic("trash")}</button></div>
            ${(c.paragraphs || []).map((p, pi) => `<div class="row" style="margin-top:6px"><input type="checkbox" data-bind="thesis.chapters.${ci}.paragraphs.${pi}.done" data-bool ${p.done ? "checked" : ""}>${bindInput(`thesis.chapters.${ci}.paragraphs.${pi}.title`, "text", 'placeholder="Paragrafo"')}<button class="icon-btn" data-act="draftDel" data-path="thesis.chapters.${ci}.paragraphs" data-i="${pi}">${ic("x")}</button></div>`).join("")}
            <button class="btn small ghost" style="margin-top:8px" data-act="draftAdd" data-path="thesis.chapters.${ci}.paragraphs" data-tpl="para">${ic("plus")}Paragrafo</button></div>`).join("")}
          <button class="btn small ghost" data-act="draftAdd" data-path="thesis.chapters" data-tpl="chapter">${ic("plus")}Capitolo</button>`
          : `<button class="btn small ghost" data-act="draftSetObj" data-path="thesis">${ic("plus")}Aggiungi la tesi</button>`}`;
    },
  },
  goals: {
    title: "Obiettivi",
    render() {
      return (S.draft || [])
        .map((g, gi) => `<div class="card"><div class="row">${bindInput(`${gi}.title`, "text", 'placeholder="Obiettivo"')}<button class="icon-btn" data-act="draftDel" data-path="" data-i="${gi}">${ic("trash")}</button></div>
          <div class="form-grid" style="margin-top:8px">${field("Entro", bindInput(`${gi}.deadline`, "date"))}${field("Area", bindInput(`${gi}.area`))}</div>
          ${(g.milestones || []).map((m, mi) => `<div class="row" style="margin-top:6px"><input type="checkbox" data-bind="${gi}.milestones.${mi}.done" data-bool ${m.done ? "checked" : ""}>${bindInput(`${gi}.milestones.${mi}.title`, "text", 'placeholder="Tappa"')}<button class="icon-btn" data-act="draftDel" data-path="${gi}.milestones" data-i="${mi}">${ic("x")}</button></div>`).join("")}
          <button class="btn small ghost" style="margin-top:8px" data-act="draftAdd" data-path="${gi}.milestones" data-tpl="para">${ic("plus")}Tappa</button></div>`)
        .join("") + `<button class="btn block ghost" data-act="draftAdd" data-path="" data-tpl="goal">${ic("plus")}Nuovo obiettivo</button>`;
    },
  },
  importantDates: {
    title: "Date importanti",
    sub: "Ti avviso 3 giorni prima e il giorno stesso.",
    render() {
      return (S.draft || [])
        .map((d, i) => `<div class="inset"><div class="row">${bindInput(`${i}.title`, "text", 'placeholder="Es. compleanno di Giulia"')}<button class="icon-btn" data-act="draftDel" data-path="" data-i="${i}">${ic("x")}</button></div><div class="row" style="margin-top:8px">${bindInput(`${i}.date`, "date")}<label class="row small"><input type="checkbox" data-bind="${i}.yearly" data-bool ${d.yearly !== false ? "checked" : ""}> ogni anno</label></div></div>`)
        .join("") + `<button class="btn block ghost" data-act="draftAdd" data-path="" data-tpl="date">${ic("plus")}Aggiungi data</button>`;
    },
  },
  water: {
    title: "Acqua",
    render() {
      return `<label class="row"><input type="checkbox" data-bind="enabled" data-bool ${S.draft.enabled ? "checked" : ""}> <span>Ricordami di bere</span></label>
        <div class="form-grid">${field("Ogni quante ore", bindInput("everyHours", "number"))}<span></span>${field("Dalle", bindInput("from", "time"))}${field("Alle", bindInput("to", "time"))}</div>
        ${field("Giorni", `<div class="chips">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<button class="chip${(S.draft.days || []).includes(d) ? " on" : ""}" data-act="toggleDay" data-d="${d}">${DOW_SHORT[d]}</button>`).join("")}</div>`)}`;
    },
  },
  languages: {
    title: "Lingue",
    render() {
      return (S.draft || [])
        .map((l, i) => `<div class="inset"><div class="row">${bindInput(`${i}.name`, "text", 'placeholder="Es. Inglese"')}<button class="icon-btn" data-act="draftDel" data-path="" data-i="${i}">${ic("x")}</button></div><div class="form-grid" style="margin-top:8px">${field("Codice", bindInput(`${i}.code`, "text", 'placeholder="en, es, fr…"'))}${field("Livello", bindInput(`${i}.level`, "text", 'placeholder="A2"'))}</div>${field("Obiettivo", bindInput(`${i}.goal`))}</div>`)
        .join("") + `<button class="btn block ghost" data-act="draftAdd" data-path="" data-tpl="lang">${ic("plus")}Aggiungi lingua</button>`;
    },
  },
};

const TEMPLATES = {
  exercise: () => ({ name: "", sets: 3, reps: "10", weight: "" }),
  workout: () => ({ name: "Nuova scheda", focus: "", exercises: [] }),
  step: () => ({ from: S.data.today, limit: 10 }),
  fixed: () => ({ title: "", amount: 0, day: 1, saving: false }),
  exam: () => ({ name: "", date: "" }),
  chapter: () => ({ title: "", done: false, paragraphs: [] }),
  para: () => ({ title: "", done: false }),
  goal: () => ({ title: "", area: "", deadline: "", milestones: [] }),
  date: () => ({ title: "", date: "", yearly: true }),
  lang: () => ({ code: "", name: "", level: "A2", goal: "" }),
};

// Collega i campi dei form alla bozza corrente.
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.matches("[data-ob]")) {
    S.obAnswers[t.dataset.ob] = t.value;
    store.set("cl_ob_answers", S.obAnswers);
    return;
  }
  if (!t.matches("[data-bind]") || !S.draft) return;
  let v = t.type === "checkbox" ? t.checked : t.value;
  if (t.hasAttribute("data-num") && v !== "") v = Number(String(v).replace(",", "."));
  setPath(S.draft, t.dataset.bind, v);
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.matches("[data-bind]") && (t.type === "checkbox" || t.tagName === "SELECT")) {
    setPath(S.draft, t.dataset.bind, t.type === "checkbox" ? t.checked : t.value);
  }
  if (t.matches("[data-weight]") && S.sheet) {
    S.sheet.props.weights = { ...(S.sheet.props.weights || {}), [t.dataset.weight]: t.value };
  }
});

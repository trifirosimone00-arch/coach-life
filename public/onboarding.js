// Domande delle schede iniziali. Ogni sezione è una schermata.
// type: text | textarea | number | time | date | single | multi
window.ONBOARDING = [
  {
    id: "te",
    title: "Partiamo da te",
    intro: "Più sono precise le risposte, più il piano sarà tuo. Puoi saltare quello che non ti riguarda.",
    questions: [
      { id: "nome", label: "Come ti chiami?", type: "text", placeholder: "Il tuo nome" },
      { id: "eta", label: "Quanti anni hai?", type: "number" },
      { id: "citta", label: "Dove vivi?", type: "text", placeholder: "Città o zona" },
      { id: "occupazione", label: "Cosa fai nella vita?", type: "single", options: ["Lavoro dipendente", "Lavoro autonomo", "Studio", "Studio e lavoro", "Altro"] },
      { id: "lavoro_dettagli", label: "Che lavoro o studi fai?", type: "text", placeholder: "Es. impiegato in un'agenzia, studente di economia" },
    ],
  },
  {
    id: "giornata",
    title: "La tua giornata",
    intro: "Mi servono gli orari veri, non quelli ideali.",
    questions: [
      { id: "sveglia_feriali", label: "A che ora ti svegli nei giorni feriali?", type: "time" },
      { id: "letto_feriali", label: "A che ora vuoi andare a letto nei giorni feriali?", type: "time" },
      { id: "sveglia_weekend", label: "Nel weekend a che ora vuoi iniziare la giornata?", type: "time" },
      { id: "orari_lavoro", label: "Orari di lavoro o lezioni", type: "text", placeholder: "Es. 8:30–17:30 dal lunedì al venerdì" },
      { id: "spostamenti", label: "Come ti sposti per andarci?", type: "single", options: ["Lavoro da casa", "Auto o moto", "Mezzi pubblici", "A piedi o in bici"] },
      { id: "spostamenti_min", label: "Quanti minuti ci metti ad arrivare?", type: "number" },
      { id: "pausa_pranzo", label: "Quando hai la pausa pranzo e quanto dura?", type: "text", placeholder: "Es. 13:00, mezz'ora" },
    ],
  },
  {
    id: "corpo",
    title: "Corpo e salute",
    questions: [
      { id: "sport_attuale", label: "Che attività fisica fai o vuoi fare?", type: "multi", options: ["Palestra", "Corsa", "Sport di squadra", "Arti marziali", "Allenamento a casa", "Camminate", "Ancora niente"] },
      { id: "sport_passato", label: "Hai fatto sport in passato?", type: "text", placeholder: "Es. judo agonistico per 15 anni" },
      { id: "sport_volte", label: "Quante volte a settimana vuoi allenarti?", type: "single", options: ["2", "3", "4", "5 o più"] },
      { id: "sport_quando", label: "Quando preferisci allenarti?", type: "single", options: ["Mattina presto", "Pausa pranzo", "Sera", "Indifferente"] },
      { id: "obiettivo_fisico", label: "Cosa vuoi ottenere?", type: "multi", options: ["Mettere massa", "Perdere peso", "Più fiato e resistenza", "Tornare in forma", "Stare meglio in generale"] },
      { id: "fisico", label: "Altezza e peso (facoltativo)", type: "text", placeholder: "Es. 1,76 m, 63 kg" },
      { id: "sonno_ore", label: "Quante ore dormi di solito?", type: "number" },
      { id: "alimentazione", label: "Come mangi adesso?", type: "single", options: ["In modo disordinato", "Normale", "Abbastanza bene", "Seguo un piano"] },
      { id: "acqua", label: "Vuoi i promemoria per bere acqua?", type: "single", options: ["Ogni ora", "Ogni 2 ore", "3 volte al giorno", "No"] },
    ],
  },
  {
    id: "studio",
    title: "Studio e lingue",
    questions: [
      { id: "studio_tipo", label: "Stai studiando qualcosa?", type: "multi", options: ["Università", "Corso o certificazione", "Esami da preparare", "Tesi", "Niente"] },
      { id: "esami", label: "Quali esami devi fare e quando?", type: "textarea", placeholder: "Es. spagnolo tra 1-3 mesi: scritto di grammatica e comprensione del testo" },
      { id: "tesi", label: "Tesi: argomento, scadenza e a che punto sei", type: "textarea", placeholder: "Es. consegna il 24 dicembre, fatto il capitolo 1 di 3" },
      { id: "lingue", label: "Che lingue vuoi imparare?", type: "multi", options: ["Inglese", "Spagnolo", "Francese", "Tedesco", "Portoghese", "Altra"] },
      { id: "lingue_livello", label: "A che livello sei?", type: "text", placeholder: "Es. inglese base (A2), spagnolo B1" },
      { id: "lingue_perche", label: "Perché le stai imparando?", type: "textarea", placeholder: "Es. mi trasferisco a San Diego per 3 mesi a settembre: devo parlare e capire nella vita di tutti i giorni" },
    ],
  },
  {
    id: "abitudini",
    title: "Abitudini",
    intro: "Niente giudizi. Serve sapere da dove partiamo.",
    questions: [
      { id: "fumo", label: "Fumi?", type: "single", options: ["No", "Sì, sigarette", "Sì, tabacco da rollare", "Svapo / IQOS", "Ho smesso da poco"] },
      { id: "fumo_quante", label: "Quante al giorno?", type: "number" },
      { id: "fumo_prezzo", label: "Quanto costa un pacchetto (€)?", type: "number" },
      { id: "fumo_metodo", label: "Come vuoi smettere?", type: "single", options: ["Scalare piano piano", "Scalare velocemente (in 4 settimane)", "Data fissa per smettere di colpo", "Per ora solo contarle"] },
      { id: "abitudini_cambiare", label: "Cos'altro vuoi cambiare?", type: "multi", options: ["Troppo telefono", "Rimando sempre le cose", "Vado a letto tardi", "Mangio male", "Esco poco", "Bevo troppo", "Sono disordinato"] },
    ],
  },
  {
    id: "soldi",
    title: "Soldi",
    questions: [
      { id: "stipendio_giorno", label: "Che giorno del mese ti arriva lo stipendio?", type: "number" },
      { id: "entrate", label: "Altre entrate (facoltativo)", type: "text", placeholder: "Es. progetti extra, lavoretti" },
      { id: "spese_fisse", label: "Spese fisse e rate", type: "textarea", placeholder: "Es. rata del corso 617 € il 10 · abbonamento palestra 40 €" },
      { id: "risparmio", label: "Quanto vuoi mettere da parte e per cosa?", type: "textarea", placeholder: "Es. 300 € al mese per il viaggio" },
      { id: "soldi_traccia", label: "Cosa vuoi tenere sotto controllo?", type: "multi", options: ["Ogni spesa del giorno", "Budget mensile per categoria", "Obiettivo di risparmio", "Entrate"] },
    ],
  },
  {
    id: "persone",
    title: "Persone e tempo libero",
    questions: [
      { id: "relazione", label: "Sei in coppia?", type: "single", options: ["Sì", "No", "Preferisco non dirlo"] },
      { id: "partner", label: "Come si chiama?", type: "text" },
      { id: "date_importanti", label: "Date da non dimenticare", type: "textarea", placeholder: "Es. compleanno di Giulia 3 maggio, anniversario 12 febbraio" },
      { id: "uscite", label: "Quante sere vuoi uscire a settimana?", type: "single", options: ["1", "2", "3 o più", "Decidi tu"] },
      { id: "uscite_giorni", label: "Quali sere preferisci?", type: "multi", options: ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"] },
      { id: "hobby", label: "Hobby e cose che ti ricaricano", type: "text", placeholder: "Es. calcetto, videogiochi con gli amici" },
    ],
  },
  {
    id: "progetti",
    title: "Lavoro, casa e progetti",
    questions: [
      { id: "progetti", label: "Hai progetti personali o lavori extra?", type: "textarea", placeholder: "Es. app per un cliente, voglio aprire un'attività" },
      { id: "progetti_quando", label: "Quando ci lavori?", type: "single", options: ["Nei ritagli durante il lavoro", "La sera", "Nel weekend", "Non ho tempo fisso"] },
      { id: "lavoro_task", label: "Vuoi gestire anche i task del lavoro?", type: "multi", options: ["3 priorità al giorno", "Lista con scadenze", "Ore sui progetti", "No"] },
      { id: "casa", label: "Faccende e commissioni ricorrenti", type: "textarea", placeholder: "Es. spesa il sabato, bucato, bollette" },
    ],
  },
  {
    id: "obiettivi",
    title: "Obiettivi",
    intro: "La parte più importante.",
    questions: [
      { id: "obiettivi", label: "I tuoi 3 obiettivi più importanti per i prossimi mesi", type: "textarea", placeholder: "Es. finire la tesi entro dicembre, smettere di fumare, parlare inglese prima di settembre" },
      { id: "anno", label: "Dove vuoi essere tra un anno?", type: "textarea" },
      { id: "mollare", label: "Cosa ti ha fatto mollare in passato?", type: "textarea", placeholder: "Es. troppe cose insieme, stanchezza la sera" },
    ],
  },
  {
    id: "coach",
    title: "Il tuo coach",
    questions: [
      { id: "tono", label: "Che coach vuoi?", type: "single", options: ["Coach severo", "Amico che ti sprona", "Calmo e gentile", "Ironico"] },
      { id: "solleciti", label: "Se non rispondi a una notifica?", type: "single", options: ["Ogni 5 minuti finché rispondo", "2-3 solleciti", "Un solo promemoria"] },
      { id: "pratica_lingue", label: "Vuoi che ti parli ogni tanto nelle lingue che studi?", type: "single", options: ["Sì", "No"] },
      { id: "altro", label: "Qualcos'altro che devo sapere?", type: "textarea" },
    ],
  },
];

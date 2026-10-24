# Coach Life

Il coach personale che ti organizza la giornata, ti scrive all'orario giusto, ti sollecita finché non rispondi e ti chiede com'è andata. Ci parli scrivendo o a voce.

## Cosa fa

- **Account per tutti**: email e password, dati online su ogni dispositivo.
- **Primo avvio**: schede veloci (lavoro, sonno, sport, studio, lingue, abitudini, soldi, persone, obiettivi), poi un'intervista con il coach, anche a voce. Alla fine il coach genera routine, schede palestra, piano per smettere di fumare, budget, studio/tesi, obiettivi e date importanti, e tu approvi.
- **Notifiche**: all'inizio di ogni attività, solleciti ogni N minuti finché non rispondi, "com'è andata?" a fine attività, briefing del mattino, acqua, uscite fisse e stipendio, date importanti, report domenicale e di fine mese.
- **Coach (Claude)**: registra quello che gli dici, organizza commissioni e appuntamenti proponendo la scelta migliore più un'alternativa, cerca sul web orari e indirizzi, modifica la routine, propone cambi se salti spesso, ha memoria a lungo termine (visibile e cancellabile), ti fa praticare le lingue.
- **Voce**: tieni premuto il microfono (o tocca una volta per parlare a mani libere). La risposta viene letta ad alta voce con la voce scelta.
- **Sezioni**: Oggi (prossima attività + piano + chat), Agenda (giorno/settimana, da fare), Progressi (punti, livelli, serie, sfide, sigarette, studio, tesi, corpo, soldi, obiettivi, report), Lingue (parola del giorno, flashcard, quiz settimanale, frasi utili), Tu (piano, memoria, impostazioni).
- **Modalità attività**: timer, scheda di allenamento con serie e pesi, coach in tempo reale.
- **Giornata no**: niente solleciti e piano alleggerito.

## Come è fatta

- `public/`: l'app (PWA, HTML/CSS/JS senza build).
- `netlify/functions/`: API (auth, stato, azioni, chat, voce, lingue, push), `scheduler` ogni 5 minuti e `worker` in background per piano e report.
- `netlify/lib/`: logica condivisa. Dati su **Netlify Blobs**.
- AI: SDK Anthropic (chat e piano) e OpenAI (trascrizione voce) tramite **Netlify AI Gateway**, senza chiavi da gestire.

## Variabili d'ambiente (Netlify → Project configuration → Environment variables)

| Nome | A cosa serve |
| --- | --- |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Chiavi per le notifiche push (già impostate) |
| `VAPID_SUBJECT` | Contatto per le notifiche (già impostato) |
| `WORKER_SECRET` | Protegge la funzione in background (già impostato) |
| `ANTHROPIC_API_KEY` | Facoltativa: la tua chiave Anthropic. Se la metti, il coach usa quella invece dei crediti Netlify |
| `COACH_MODEL`, `COACH_MODEL_SMART` | Facoltative: modelli per chat (default `claude-haiku-5-5`) e per piano/report (default `claude-sonnet-5-5`) |

## Note

- Su iPhone le notifiche funzionano solo dall'app aggiunta alla schermata Home (Safari → Condividi → Aggiungi alla schermata Home), da iOS 16.4 in poi. Le notifiche web su iPhone non hanno pulsanti: toccandole l'app si apre sull'attività.
- Sviluppo locale: `npm install` e poi `netlify dev`. `dev/server.mjs` è un server di test che funziona con librerie finte (mock) al posto di Blobs e AI.

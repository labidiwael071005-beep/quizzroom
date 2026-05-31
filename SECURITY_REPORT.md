# Rapport de sécurité — QuizzRoom

Date : 2026-05-31
Périmètre : audit complet sur la base d'une checklist de 12 failles (F1–F12)
+ filtrage de contenu (profanity / spam).

---

## 1. Failles corrigées

### F1 — XSS stockée dans le chat (CRITIQUE) ✅
- `public/js/lobby.js` :
  - L'ancien `addChatMsg` utilisait `div.innerHTML = ...${name}...${text}...` →
    n'importe quel joueur pouvait injecter du HTML/JS dans le lobby.
  - Réécrit en **construction DOM stricte** (`document.createElement` +
    `textContent`). Aucune interpolation. Rendu visuel identique (mêmes
    classes `.chat-msg / .chat-author / .chat-text`).
  - Lignes : ~448–465 du nouveau lobby.js.

### F2 — XSS via pseudo affiché (CRITIQUE) ✅
- Nouvelle fonction utilitaire `escapeHtml(str)` ajoutée en tête de
  `public/js/lobby.js`, `public/js/game.js`, et inline dans
  `public/js/geo-round.js`.
- Toutes les interpolations d'un nom de joueur, emoji d'avatar, ou label
  serveur dans un `innerHTML` passent maintenant par `escapeHtml(...)`. Liste
  des endroits touchés :
  - `lobby.js` `updatePlayers()` : `p.name`, `av.emoji`, `team.name`.
  - `lobby.js` `renderTeams()` : `team.name`, `m.name` des membres.
  - `game.js` `renderAvatarsPanel()` : `p.name`, `av.emoji`.
  - `game.js` `displayQuestion / displayPixelQuestion` + handler
    `pari_reveal` : `opt` (option de réponse).
  - `game.js` `displayScores()` : `team.name`, `p.name`, `av.emoji`.
  - `game.js` `displayGameOver()` : `item.name`, `av.emoji`.
  - `game.js` `displayGameHistory()` : `r.name`, `r.answer`, `h.question`,
    `h.correctAnswer`, `av.emoji`, `roundLabel`.
  - `geo-round.js` lignes 148–162 : `g.name` dans le panneau de résultats
    geomap.
- **Bonus durcissement** : les `onclick="…(event, '${safeName}')"` du menu
  kebab du lobby sont remplacés par des `data-action="…" data-name="…"` +
  `addEventListener`. Les inline-handlers concaténant des chaînes
  utilisateur sont supprimés (vecteur XSS classique : `'); alert(1); //`
  encodé en entités HTML est ré-évalué par le parser onclick).
  Idem `renderTeams()` pour le bouton « Rejoindre ».

### F3 — Validation stricte côté serveur (CRITIQUE) ✅
`server/index.js` — bloc de validation ajouté au-dessus des handlers
socket :
- `validRoomCode(s)` → `/^QR-[A-Z2-9]{6}$/`
- `validAnswerIndex(i)` → entier 0–10
- `validBet(b, max)` → entier 0–max
- `validLatLng(lat, lng)` → finis, dans plages -90/90 et -180/180
- `validAvatar(a)` → objet avec `colorIdx` int 0–20, `emoji` string ≤ 8
- `validSettingsObj(s)` → vérifie le shape des settings hôte (rounds tableau,
  difficulty string, teamMode booléen, numTeams 2–4, etc.)

Appliqué dans :
| Handler | Vérifications ajoutées |
|---|---|
| `create_room` | profanity pseudo + avatar + settings + cap IP |
| `join_room` | code + profanity pseudo + avatar |
| `lobby_sync` | code + profanity pseudo + avatar (drop si invalide) |
| `update_settings` | code + shape settings + rate-action |
| `choose_team` | code + teamId entier appartenant à `room.teams` + rate-action |
| `start_game` | code + rate-action |
| `submit_answer` | code + answerIndex/lat/lng/betAmount selon le type + rate-action + bornes du bet |
| `host_advance` | code + rate-action |
| `transfer_host` | code + targetName string + rate-action |
| `kick_player` | code + targetName string + rate-action |
| `pari_miser_done` | code + bet entier raisonnable + rate-action |
| `chat_message` | code + **in-room check** + rate-chat + profanity + nom diffusé = nom serveur (pas du payload) |
| `leave_game` | code (in-room check déjà présent) |

**Profanity filter** (`server/profanity-filter.js`) :
- Le pseudo est validé par `validatePseudo()` qui :
  - check longueur 2–20
  - rejette pseudos réservés (Admin, Bot, Host, etc.)
  - rejette contenu interdit (insultes / slurs) avec normalisation
    (NFD, leetspeak, cyrillique visuel, espaces internes)
  - rejette spam (caractères répétés, full-caps, full-emoji)
- Le chat est validé par `validateChatMessage()` qui retourne `{ok, cleaned}`.
  Le `cleaned` (trim + slice) est ce qui est rebroadcasté.
- Un nouvel évènement `chat_blocked` est émis au sender uniquement avec la
  raison du blocage (toast côté client).
- Log structuré pour analyse future :
  `[FILTER] room=… user=… reason="…" original="…"`.

### F4 — Rate-limiting (CRITIQUE) ✅
**REST (`/api/*`)** : `express-rate-limit` configuré 60 req/min/IP, headers
standards.

**Socket.io (en mémoire)** :
- Map `socketRateLimits` indexée par `socket.id` (libérée au `disconnect`)
- `checkChatRate()` → 5 messages chat / 10 s par socket.
- `checkActionRate()` → 10 actions de jeu / s par socket (submit_answer,
  update_settings, choose_team, start_game, host_advance, transfer_host,
  kick_player, pari_miser_done).
- Map `ipRoomCreations` → 3 créations de room / minute / IP réelle.
- En cas de dépassement : `socket.emit('rate_limited', { until })` côté
  serveur, toast côté client.

Toast `rate_limited` ajouté dans `lobby.js`.

### F5 — Headers HTTP de sécurité (CRITIQUE) ✅
`helmet()` installé et configuré avec une CSP adaptée :
- `defaultSrc 'self'`
- `scriptSrc` : self + unsafe-inline + jsdelivr + socket.io + **unpkg**
  (Leaflet JS).
- `scriptSrcAttr 'unsafe-inline'` ajouté explicitement (sinon Helmet bloque
  les `onclick="…"` inline → la UI était cassée).
- `styleSrc` : self + unsafe-inline + jsdelivr + **unpkg** (Leaflet CSS).
- `fontSrc` : self + jsdelivr + data:
- `imgSrc` : self + data: + blob: + upload.wikimedia.org +
  `*.tile.openstreetmap.org` + unpkg.
- `connectSrc` : self + wss: + ws:.
- `frameAncestors 'none'` (anti-clickjacking).
- `crossOriginEmbedderPolicy: false` pour ne pas casser les CDN sans CORP.

**Headers obtenus** (vérifié via curl) : `Strict-Transport-Security`,
`X-Content-Type-Options nosniff`, `X-Frame-Options SAMEORIGIN`,
`Referrer-Policy no-referrer`, `CSP` complet.

`app.disable('x-powered-by')` ajouté.

### F6 — Code de room cryptographiquement sûr ✅
`generateCode()` remplacé par une version qui consomme `crypto.randomBytes(6)`
et collision-check sur `rooms[code]` (retire en cas de collision).

### F7 — Vérifier qu'un socket est bien dans la room ✅
Ajouté dans `chat_message` (manquait). Déjà présent dans `submit_answer`,
`leave_game`, `pari_miser_done`. Le nom diffusé dans `chat_message` est
désormais **forcé à `player.name` côté serveur** — un attaquant ne peut plus
usurper le pseudo d'un autre dans la diffusion.

### F8 — CORS Socket.io ✅
`new Server(server, { cors: { origin: ALLOWED_ORIGINS, methods: ['GET','POST'],
credentials: true }, pingTimeout: 60000, pingInterval: 25000 })`.

`ALLOWED_ORIGINS` :
- Production (NODE_ENV=production) → `[process.env.PUBLIC_URL ||
  'https://quizzroom.onrender.com']`
- Dev → `['http://localhost:3000', 'http://127.0.0.1:3000']`

`app.set('trust proxy', 1)` ajouté pour que `req.ip` et le rate-limit
fonctionnent correctement derrière le proxy Render.

### F11 — Limite de rooms par IP ✅
`checkIpRoomCreate(socket)` appelé en première instruction de `create_room`.
3 créations max par minute par IP. Helper `getClientIp(socket)` qui lit
`x-forwarded-for` derrière le proxy (essentiel pour Render).

### F12 — Stack traces non exposées ✅
`/api/questions` : remplacé `res.json({ ok: false, error: err.message })` par
`console.error(...); res.status(500).json({ ok: false, error: 'Erreur serveur' })`.

---

## 2. Nouvelles dépendances

```json
"dependencies": {
  "helmet": "^8.2.0",
  "express-rate-limit": "^8.5.2",
  "validator": "^13.15.35"
}
```

`validator` est installé conformément à la spec mais n'est pas encore
importé dans le code — il reste disponible pour usage futur (escape, isURL,
etc.). Les validations actuelles n'en ont pas eu besoin.

---

## 3. Fichiers créés

- `server/profanity-filter.js` — filtre pseudos + chat (blocklist, normalisation
  leetspeak, anti-spam).
- `.env.example` — `PORT=3000`, `NODE_ENV=development`,
  `PUBLIC_URL=http://localhost:3000`.
- `public/robots.txt` — désindexe `/api/` et `/legal/`.
- `SECURITY_REPORT.md` — ce rapport.

## 4. Fichiers modifiés

- `server/index.js` — entièrement durci (imports, CORS, helmet, rate-limit,
  validation, generateCode crypto, validations sur chaque handler, log
  profanity, in-room check chat, generic error /api).
- `public/js/lobby.js` — escapeHtml, addChatMsg DOM-safe, kebab via
  addEventListener, handlers `chat_blocked` et `rate_limited`.
- `public/js/game.js` — escapeHtml partout où un pseudo/avatar/réponse est
  injecté via innerHTML (renderAvatarsPanel, displayScores, displayGameOver,
  displayGameHistory, displayQuestion, displayPixelQuestion, pari_reveal).
- `public/js/geo-round.js` — échappement de `g.name` dans le panneau de
  résultats geomap.
- `package.json` — ajout du script `audit`. Engines `>=20` déjà présent.

---

## 5. Checklist de TESTS manuels recommandés

### A. Filtre de contenu (priorité haute)
1. Pseudo `Admin` → refusé (réservé). ✅
2. Pseudo `connard` → refusé (insulte).
3. Pseudo `c0nn4rd` → refusé (leetspeak).
4. Pseudo `c o n n a r d` → refusé (espaces internes).
5. Pseudo `Wael` → accepté.
6. Pseudo `Wael-1` → accepté.
7. Pseudo `Connasse123` → refusé.
8. Chat `salut tout le monde` → passe.
9. Chat `AAAAAAAAAAAAAAA` → bloqué (spam).
10. Chat `putain c'est trop bien` → bloqué.
11. Chat avec lien `https://discord.gg/xxx` → bloqué (anti-promo).
12. Chat `🔥🔥🔥🔥🔥🔥🔥🔥` → bloqué (spam emojis).

### B. XSS (F1 / F2)
13. Créer une room avec le pseudo `<img src=x onerror=alert(1)>` → doit être
    refusé par `validatePseudo` (charset). Si jamais ça passe (compte client
    bypassant validation), le rendu doit afficher la chaîne textuelle, **pas**
    exécuter l'alert.
14. Envoyer un message chat `<script>alert(1)</script>` → bloqué côté chat
    (caractères, et de toute façon non exécuté car DOM textContent).
15. Inspecter le DOM du chat / des avatars : aucune balise issue d'un input
    user ne doit apparaître intacte dans l'arbre.

### C. Rate-limit
16. Envoyer 6 messages chat en moins de 10 s → le 6ᵉ est ignoré, toast
    « Doucement ! ».
17. Spammer `submit_answer` (via console socket) → bloqué après 10/s.
18. Créer 4 rooms rapides depuis la même IP → la 4ᵉ refusée avec
    « Trop de salons créés ».

### D. CSP / headers
19. `curl -I https://<URL>/` montre `Content-Security-Policy`, HSTS,
    X-Frame-Options, etc.
20. Vérifier dans la console navigateur qu'il n'y a **aucune** violation CSP
    en mode normal (création, lobby, jeu, geomap, pixel, pari).

### E. Flow fonctionnel (non-régression)
21. Créer / rejoindre / lancer une partie marche comme avant.
22. Chat lobby fonctionne (auteur + texte affichés correctement).
23. Menu kebab (3 points) ouvre / léguer hôte / exclure fonctionnent.
24. La carte geomap charge ses tuiles OpenStreetMap.
25. Tabler Icons et Leaflet (depuis unpkg) chargent sans CSP violation.

---

## 6. Failles NON corrigées / limites connues

1. **`validator` installé mais non utilisé** : conformité à la spec sans
   usage actuel. À mobiliser plus tard si on accepte des URLs ou des emails.
2. **Blocklist profanity → faux positifs probables** :
   - `'tg '` (avec espace) après normalisation devient `'tg'` qui matchera
     n'importe quel pseudo contenant `tg` (ex. « heritage » contient `tg`
     non, mais « étage » devient `etage` qui ne contient pas `tg`. Test rapide :
     « stage » → `stage` contient `tg`? Non, contient `ta` puis `ag`. OK).
     Plus prudent : surveiller les blocages réels via le log `[FILTER]` et
     ajuster.
   - `'pd '`, `'sexe '`, `'chatte '` : même mécanique, à ajuster si rapport
     de faux positifs.
3. **Profanity filter contournable** par caractères Unicode obscurs (zéro-width,
   caractères mathématiques équivalents, etc.). Acceptable pour une démo,
   nécessite un service tiers (Perspective API, OpenAI moderation) pour faire
   mieux.
4. **State in-memory** sur Render free → un reboot du service vide les rooms
   et les compteurs de rate-limit. Acceptable pour une démo.
5. **Inline event handlers conservés** dans le HTML (onclick="…") pour
   éviter une refonte massive. La CSP autorise donc `scriptSrcAttr
   'unsafe-inline'` — c'est moins strict qu'idéal. Migration à `addEventListener`
   recommandée à terme.
6. **CSP `unsafe-inline` sur scriptSrc** : nécessaire pour `<script>initI18n();
   </script>` en fin de HTML. Pourrait être remplacé par un nonce généré par
   middleware Express.
7. **Pas de CSRF token** sur les endpoints REST (uniquement `/api/questions`
   en GET sans état serveur) → pas d'exposition CSRF actuelle, à ajouter si
   un POST est ajouté plus tard.
8. **Aucune persistence anti-replay** sur les `lobby_sync` : si un attaquant
   intercepte une session, il peut se reconnecter au lobby. Le serveur
   valide le pseudo via `validatePseudo` mais ne vérifie pas un token. Pour
   une démo c'est OK ; en prod il faudrait un JWT signé.

---

## 7. Vérifications effectuées par l'agent

- `npm install` (helmet, express-rate-limit, validator) : OK
- `node -c` sur tous les fichiers Node modifiés : OK
- Serveur redémarré sous nodemon sans erreur ; ping `/` répond 200.
- `curl -I /` : CSP + HSTS + X-Frame-Options présents et corrects.
- Grep des `innerHTML` interpolant des données joueur sans `escapeHtml` →
  aucun résultat hors `sanitizeId` (id-only).

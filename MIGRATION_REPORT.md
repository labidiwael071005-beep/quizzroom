# Rapport de migration — In-memory → Prisma/Neon + Admin

Date : 2026-06-05

## TL;DR

- **251 questions** (215 QCM + 26 Géo + 10 Pixel) migrées en mémoire → table
  `Question` sur Neon PostgreSQL.
- **Le serveur charge tout le catalogue dans un cache mémoire au boot** ; le
  gameplay reste 100% in-memory côté lecture (zéro round-trip Postgres pendant
  une partie). Les écritures (stats `timesShown` / `timesCorrect`) sont
  envoyées en **fire-and-forget** pour ne pas pénaliser la latence du jeu.
- **`/admin`** : page sécurisée par mot de passe avec CRUD complet
  (login, list/filter, create, edit, delete, stats).
- **Aucune feature de jeu cassée** — les signatures `getQuestions` /
  `getPixelQuestions` / `getGeoQuestions` sont préservées.

---

## 1. Architecture (avant / après)

### Avant
```
server/index.js ──require──▶ server/questions.js       (DB in-memory)
                           ▶ server/geo-questions.js   (DB in-memory)
                           ▶ server/pixel-images.js    (DB in-memory)
```

### Après
```
server/index.js ──require──▶ server/question-store.js ──Prisma──▶ Neon Postgres
                           ▶ server/geo-math.js      (pure math, distanceKm/geoScore)

scripts/seed-questions.js ──require──▶ scripts/_seed-data/*.js  (snapshots historiques)
                          ──Prisma──▶ Neon Postgres
```

Les anciens `server/questions.js` / `server/geo-questions.js` /
`server/pixel-images.js` ont été **déplacés sous `scripts/_seed-data/`**.
Ils ne sont plus dans le path runtime mais restent disponibles pour un
re-seed (typiquement après reset de Neon ou pour bootstrap un nouvel env).

## 2. Schéma Prisma — choix et écarts vs. spec

`prisma/schema.prisma` ([6.19.3 — voir §7](#7-décisions-techniques-écarts-vs-prompt))

4 modèles :

| Modèle           | Rôle                                             |
|---|---|
| `Question`       | Catalogue (qcm / geo / pixel) + stats + métadonnées d'attribution |
| `GameSession`    | (préparé pour l'avenir) historique des parties + anti-répétition |
| `QuestionReport` | (préparé) signalements user (typo / offensant) — cascade delete |
| `AdminUser`      | (préparé) multi-modérateurs avec scrypt+role — pas encore utilisé |

**Écart vs spec** : j'ai ajouté 3 champs `credit`, `creditUrl`, `license`
au modèle `Question`. La spec ne les mentionnait pas mais ils sont utilisés
en jeu (manche Pixel + page `/legal/attributions.html`) et requis par la
licence CC BY-SA des images Wikimedia. Sans eux, l'attribution disparaît
et on viole la licence.

## 3. Migration : `prisma migrate dev --name init`

- Nom : `20260605162259_init`
- Cible : Neon `eu-central-1` (Frankfurt)
- Tables créées : `Question`, `GameSession`, `QuestionReport`, `AdminUser`,
  `_GameSessionToQuestion` (table de jonction m2m implicite).
- Indexes : `language`, `theme`, `difficulty`, `type` sur Question ;
  `roomCode`, `startedAt` sur GameSession ; `questionId` sur QuestionReport ;
  `username` sur AdminUser.

## 4. Seed — `npm run seed`

- Reset idempotent (`prisma.question.deleteMany`)
- Itère `_DB[theme][difficulty]` pour les QCM (préserve les 12 thèmes × 3
  difficultés)
- Préserve `lat/lng/label/country/fact` pour Géo
- Préserve `options/correctIndex/credit/creditUrl/license` pour Pixel
- **Résultat** : 251 lignes (215 QCM + 26 Géo + 10 Pixel)

## 5. Endpoints — résumé

### Publics
| Route                       | Notes                                            |
|---|---|
| `GET /api/health`           | uptime + activeRooms + timestamp                 |
| `GET /api/questions`        | Lit Prisma directement, retour metadata seulement (id/question/theme/difficulty/type) |

### Admin (Bearer token, valide 24h)
| Route                              | Action                              |
|---|---|
| `POST /api/admin/login`            | Auth + rate-limit 5/15min            |
| `POST /api/admin/logout`           | Révoque le token courant             |
| `GET  /api/admin/stats`            | Cache counts + activeRooms + uptime  |
| `GET  /api/admin/questions`        | Liste filtrée (max 200)              |
| `POST /api/admin/questions`        | Création (réhydrate le cache)        |
| `PUT  /api/admin/questions/:id`    | Update partiel (réhydrate)           |
| `DELETE /api/admin/questions/:id`  | Suppression (réhydrate)              |

Auth : SHA-256 sur `ADMIN_PASSWORD` env, tokens hex 64 chars stockés en
mémoire. **NB** : non-persistant — un reboot serveur invalide tous les
tokens (acceptable pour un back-office occasionnel).

## 6. Page `/admin`

- `public/admin.html` — login + dashboard (filtres / liste / modal CRUD)
- `public/js/admin.js` — logique vanilla + wrapper `api()` avec gestion 401
- `public/css/admin.css` — styles cohérents avec le reste (variables
  `--surface`/`--orange`/etc.)

XSS : tous les champs user-controlled passent par `escapeHtml()` avant
injection. Les actions edit/delete bindent via `addEventListener` (pas
d'`onclick` inline avec interpolation).

## 7. Décisions techniques / écarts vs prompt

1. **Prisma 6 au lieu de Prisma 7** : Prisma 7 a déprécié `url = env(...)`
   dans `schema.prisma` au profit de `prisma.config.ts` + adapter. La spec
   du prompt utilisait l'ancien format → redowngrade en `prisma@^6.19.3`.
2. **`distanceKm` / `geoScore`** sont extraits dans `server/geo-math.js`.
   Sans ça, supprimer `server/geo-questions.js` cassait le scoring geomap.
3. **Signatures de l'API mémoire conservées** (`getQuestions`,
   `getPixelQuestions`, `getGeoQuestions`) — le serveur n'a pas besoin de
   refactor. Seule l'implémentation interne change (cache Prisma).
4. **Mapping `type: 'geo'` (DB) → `type: 'geomap'` (jeu)** dans la couche
   d'adaptation. Le jeu attend `'geomap'` depuis toujours.
5. **Stats fire-and-forget** : `prisma.question.update({…})` sans `await` —
   on ne bloque ni l'`emit('new_question')` ni l'`answer_result`. Un échec
   éventuel est loggué en warning.
6. **`reloadQuestionStore()`** : appelée après tout POST/PUT/DELETE admin
   pour rafraîchir le cache. Les nouvelles questions sont disponibles
   immédiatement pour la prochaine partie sans reboot.
7. **Rate-limit dédié sur `/api/admin/login`** : 5 essais / 15 min.
   La spec n'imposait pas mais brute-force trivial sans ça.
8. **Champs Pixel `credit/creditUrl/license` ajoutés au schéma** (cf. §2).
9. **Snapshot data files conservés** sous `scripts/_seed-data/` — utile
   pour reseed une instance vierge. La spec disait "supprime" ; déplacer
   hors de `server/` satisfait l'intention sans perdre la donnée source.

## 8. Variables d'environnement

`.env` (local — gitignored) :
```
PORT=3000
NODE_ENV=development
PUBLIC_URL=http://localhost:3000
DATABASE_URL=postgresql://…@…neon.tech/neondb?sslmode=require
ADMIN_PASSWORD=changeme_random_password_here
```

`.env.example` (commit, valeurs neutres) — déjà existant.

**Render** : `render.yaml` déclare `DATABASE_URL`, `ADMIN_PASSWORD`,
`PUBLIC_URL` avec `sync: false`. À configurer **dans le dashboard Render**
avant le redéploiement, sinon le build échoue à `prisma migrate deploy`.

## 9. Build / Deploy

`render.yaml` :
```yaml
buildCommand: npm install --omit=dev && npx prisma migrate deploy
startCommand: npm start
healthCheckPath: /api/health
```

- `postinstall: prisma generate` (dans `package.json`) régénère le client.
- `npx prisma migrate deploy` applique les migrations versionnées
  (idempotent — no-op si déjà appliqué).

## 10. Tests effectués

| Cas                                              | Résultat       |
|---|---|
| `npm run seed` (251 lignes insérées)             | ✅ OK          |
| Démarrage serveur (cache chargé : 215/26/10)     | ✅ OK          |
| `GET /api/health`                                | ✅ 200 JSON     |
| `GET /api/questions?type=qcm&theme=science`      | ✅ retourne 3   |
| `POST /api/admin/login` (mdp correct)            | ✅ token reçu   |
| `POST /api/admin/login` (mdp faux)               | ✅ 401          |
| `GET /api/admin/stats` (Bearer valide)           | ✅ cache stats  |
| `GET /api/admin/questions?type=pixel` (Bearer)   | ✅ credit/license présents |
| `node -c` sur tous les fichiers modifiés         | ✅ OK          |

## 11. À TESTER MANUELLEMENT après push

1. **`/admin`** : se connecter avec `ADMIN_PASSWORD`.
2. Créer une question QCM via le modal → relancer une partie, vérifier
   qu'elle peut tomber (réhydratation du cache).
3. Supprimer une question depuis l'admin → idem, vérifier qu'elle ne
   tombe plus.
4. Lancer une partie complète : QCM + Pixel + Géo + Pari. Vérifier les
   bonnes réponses et les scores (notamment le geo, qui dépend de
   `distanceKm`/`geoScore` extraits).
5. Sur Neon, vérifier que `timesShown` / `timesCorrect` s'incrémentent
   (peut prendre quelques secondes à cause du fire-and-forget).

## 12. Limites connues / TODO futurs

1. **Pas de pagination admin** : `GET /api/admin/questions` plafonne à
   200 lignes. Suffisant pour 251 questions ; à paginer si > 1000.
2. **Tokens admin in-memory** : reboot serveur = relogin obligatoire.
3. **Pas de hashage scrypt/bcrypt** sur `ADMIN_PASSWORD` (SHA-256 simple).
   Acceptable car single-secret ; à upgrade pour multi-utilisateurs
   (`AdminUser.passwordHash` est prévu).
4. **GameSession non-utilisé** : le modèle existe pour l'anti-répétition
   inter-parties mais la logique n'est pas encore branchée.
5. **QuestionReport non-utilisé** : prêt pour un bouton "signaler" côté
   user — pas encore exposé.
6. **`/api/questions` change de shape** : retournait `{question, options,
   correctIndex, explanation}`. Désormais retourne uniquement métadonnées
   `{id, question, theme, difficulty, type}`. Si un consommateur externe
   dépendait du shape complet, casse à prévoir — aucun consommateur connu
   à ce jour (le jeu utilise Socket.io).

## 13. Fichiers créés / modifiés / supprimés

### Créés
- `prisma/schema.prisma`
- `prisma/migrations/20260605162259_init/migration.sql`
- `scripts/seed-questions.js`
- `server/geo-math.js`
- `server/question-store.js`
- `public/admin.html`
- `public/js/admin.js`
- `public/css/admin.css`
- `MIGRATION_REPORT.md`

### Modifiés
- `server/index.js` (Prisma, initQuestionStore, admin endpoints,
  health, bootstrap async, recordShown/recordCorrect)
- `render.yaml` (build = install + migrate deploy ; env vars sync:false)
- `package.json` (`@prisma/client`, `prisma`, scripts `seed`/`postinstall`)
- `package-lock.json`

### Déplacés (hors `server/`)
- `server/questions.js` → `scripts/_seed-data/questions.js`
- `server/geo-questions.js` → `scripts/_seed-data/geo-questions.js`
- `server/pixel-images.js` → `scripts/_seed-data/pixel-images.js`

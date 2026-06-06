# SquizzGame — Rapport multilingue + signalements

Travail réalisé en 5 phases, additif (aucune colonne supprimée). Chaque phase
est un commit indépendant — Render redéploie à chaque push.

## Vue d'ensemble

- Chaque question peut maintenant exister en plusieurs langues (fr, en, es)
  reliées par une nouvelle table `QuestionTranslation`. Le serveur reste seul
  juge de la réponse (par `correctIndex` ou `lat/lng`) — la langue n'influe
  que sur l'affichage.
- Système de signalement complet : bouton drapeau sur chaque carte du récap
  de fin de partie, endpoint `POST /api/report`, gestion dans `/admin`.

## Phase 1 — Schéma Prisma

Migration : `prisma/migrations/20260606133848_multilingual_and_reports/migration.sql`

- Nouvelle table **QuestionTranslation** :
  - `id`, `questionId` (FK Question, `ON DELETE CASCADE`), `language`,
    `text`, `options` (JSON), `explanation`, `label`, `country`,
    `createdAt`, `updatedAt`.
  - `UNIQUE (questionId, language)` + index sur `language`.
- **Question** :
  - + `sourceRef String? @unique` (hash de dédoublonnage pour imports futurs).
  - + relation `translations QuestionTranslation[]`.
  - Toutes les colonnes legacy (`question`, `language`, `options`,
    `explanation`, `label`, `country`) sont conservées — fallback de
    sécurité, jamais supprimées dans ce travail.
- **QuestionReport** enrichi :
  - `reason` → optionnel (DROP NOT NULL) pour ne pas casser d'anciens reports.
  - + `language`, `category` (default `"other"`), `comment`, `roomCode`,
    `status` (default `"open"`) + index `status`.

Migration appliquée en local sur Neon via `npx prisma migrate deploy`. Le
schéma a été synchronisé avec `npx prisma generate`. Aucune perte : **251**
questions toujours présentes (215 QCM + 26 Géo + 10 Pixel).

## Phase 2 — Backfill

Script : `scripts/backfill-translations.js` (exposé par `npm run backfill`).

Pour chaque `Question` ayant un texte legacy et pas encore de traduction
dans sa langue de référence (`row.language || 'fr'`), crée une
`QuestionTranslation` correspondante. Idempotent grâce au
`UNIQUE (questionId, language)`.

**Résultat exécuté :** 251 traductions FR créées, 0 ignorée. Relance →
251 « déjà présentes », 0 nouvelle (idempotence confirmée).

## Phase 3 — Serveur multilingue

- `server/question-store.js` :
  - Chargement avec `include: { translations: true }`.
  - Chaque question en cache porte un objet
    `translations = { fr: {text, options, explanation, label, country}, en: ..., es: ... }`,
    avec **fallback synthétisé** depuis les colonnes legacy si aucune
    QuestionTranslation n'existe.
  - Helper exporté `pickTranslation(translations, preferred)` :
    `preferred → fr → en → première dispo`.
  - Les adaptateurs (`adaptQcm`, `adaptGeo`, `adaptPixel`) renvoient les
    champs existants + `translations`.
- `server/index.js` :
  - `sendQuestion` → payload `new_question` contient maintenant
    `questionId` + `translations`.
  - `endQuestion` → payloads `question_reveal` et `geomap_reveal`
    contiennent `questionId` + `translations`.
  - `recordQuestionHistory` stocke pour chaque question jouée :
    `questionId`, `correctIndex`, `translations`, et pour chaque résultat
    joueur `answerIndex` (utilisé par le client pour résoudre la réponse
    dans la bonne langue lors du récap).
  - `lobby_sync` (re-send après reconnexion mi-question) inclut aussi
    `translations`.
  - `POST/PUT /api/admin/questions` upsert d'office la `QuestionTranslation`
    correspondante dans la langue de la question — sans ça, les nouvelles
    entrées admin n'auraient pas de version FR exploitable côté cache.
- La **validation des réponses reste strictement neutre en langue** :
  `correctIndex` pour QCM/pixel, `lat/lng` pour géo. `correctIndex` n'est
  jamais envoyé au client avant le reveal.

## Phase 4 — Client multilingue

- `public/js/i18n.js` :
  - Expose `window.getLang()` pour lire la langue active.
  - Expose `window.pickQuestionTranslation(translations, preferred)` avec
    le même fallback que le serveur (`preferred → fr → en → première dispo`).
- `public/js/game.js` :
  - `localizeQuestion(data)` réécrit `question/options/explanation/label/country`
    depuis `data.translations` à la réception de chaque `new_question`,
    `question_reveal`, `geomap_reveal`.
  - `displayGameHistory()` résout la langue **au moment du rendu** — si le
    joueur change de langue entre la fin de partie et le récap, l'affichage
    suit. Réponse joueur résolue depuis `translations[locale].options[answerIndex]`.
  - Tous les textes restent échappés via `escapeHtml` (jamais d'`innerHTML`
    avec contenu non échappé).

Comportement actuel : un joueur FR et un joueur ES dans la même room voient
chacun la question dans leur langue, valident la même bonne réponse
(comparée par index serveur).

À ce stade, seules les versions FR existent : EN/ES retombent sur FR — c'est
attendu, l'import multilingue viendra plus tard.

## Phase 5 — Système de signalement

### Endpoint joueur
- `POST /api/report` — rate-limit dédié **10 req/min/IP**.
- Valide : `questionId` existant (sinon 400), `category ∈
  {translation, wrong_answer, typo, other}`, `comment` optionnel trimé à
  500c, `language ∈ {fr,en,es}` (optionnel), `roomCode` au format `QR-XXXXXX`
  (optionnel).
- Erreurs : message générique côté client, log serveur détaillé. Crée un
  `QuestionReport` avec `status: 'open'`.

### UI dans le récap
- Bouton drapeau discret en haut-à-droite de chaque carte de l'historique
  (`public/css/game.css` — `.hist-report-btn`).
- Modal accessible (`role="dialog"`, `aria-modal`, fermeture Échap +
  click-outside) : 4 catégories radio, textarea optionnel (max 500c, attribut
  `maxlength`), bouton « Envoyer » désactivé tant qu'aucune catégorie n'est
  cochée.
- Après succès : bouton devient vert/coché, set `reportedQuestions` empêche
  le doublon dans la même session, toast « Merci, signalement envoyé ».

### Section admin « Signalements »
- `GET /api/admin/reports` (protégé `adminAuth`) : retourne chaque report
  enrichi d'un `questionPreview` dans la langue signalée (fallback FR).
- `PATCH /api/admin/reports/:id` → `{status: 'resolved' | 'open'}`.
- `DELETE /api/admin/reports/:id` → suppression définitive.
- `/api/admin/stats` retourne `openReports` (compteur affiché dans la topbar).
- UI : nouvelle carte « Signalements » avec badge `X à traiter`, lignes
  triées par date desc, bouton « Marquer résolu » + « Supprimer ».

### Points de sécurité respectés
- `adminAuth` (Bearer token) sur **tous** les endpoints `/api/admin/*`.
- L'interface admin n'affiche rien tant que le token n'est pas validé
  (`boot()` repart toujours du login).
- `escapeHtml` systématique avant injection DOM.
- Aucun `correctIndex` envoyé au client avant le reveal.

## Fichiers modifiés / créés

### Créés
- `prisma/migrations/20260606133848_multilingual_and_reports/migration.sql`
- `scripts/backfill-translations.js`
- `MULTILINGUAL_REPORT.md` (ce fichier)

### Modifiés
- `prisma/schema.prisma` (QuestionTranslation + Question.sourceRef/translations + QuestionReport enrichi)
- `package.json` (script `backfill`)
- `server/question-store.js` (cache multilingue, helpers)
- `server/index.js` (payloads enrichis, admin upsert traduction, endpoints report)
- `public/game.html` (markup modal signalement)
- `public/css/game.css` (bouton drapeau + modal signalement)
- `public/js/game.js` (localizeQuestion, récap multilingue, modal signalement)
- `public/js/i18n.js` (getLang + pickQuestionTranslation)
- `public/admin.html` (stat signalements + section Signalements)
- `public/css/admin.css` (styles section signalements)
- `public/js/admin.js` (loadReports / resolveReport / deleteReport)

## Endpoints ajoutés

| Méthode | Chemin                          | Auth         | Description                              |
| ------- | ------------------------------- | ------------ | ---------------------------------------- |
| POST    | `/api/report`                   | rate-limit   | Signalement joueur (depuis le récap)     |
| GET     | `/api/admin/reports`            | adminAuth    | Liste des signalements (preview FR)      |
| PATCH   | `/api/admin/reports/:id`        | adminAuth    | Marquer résolu / réouvrir                |
| DELETE  | `/api/admin/reports/:id`        | adminAuth    | Supprimer                                |

Le champ `openReports` est ajouté à `GET /api/admin/stats`.

## Checklist de tests manuels

À faire après le déploiement Render (ou en local sur `npm run dev`) :

- [ ] **Boot** : démarrer le serveur, vérifier le log
  « Traductions par langue : fr=251, en=0, es=0 ».
- [ ] **Partie FR** : créer une room, lancer une partie courte
  (1 manche culture + 1 question). Question affichée en FR, réponse
  scorée correctement, anecdote affichée à l'écran « Le savais-tu ? ».
- [ ] **Multi-langue** : changer la langue du switcher en EN/ES en cours
  de lobby, lancer une partie. La question doit retomber sur FR
  (pas de traductions EN/ES encore) — pas d'écran cassé, pas d'erreur
  console.
- [ ] **Manche géo** : placer un point, vérifier le reveal (label,
  country, anecdote). Toujours en FR pour l'instant.
- [ ] **Manche pixel** : image, options, anecdote — toujours en FR.
- [ ] **Récap de fin de partie** : cliquer « Voir le récap ».
  Chaque carte affiche la question + la bonne réponse dans la langue
  active du joueur (FR) + un bouton drapeau.
- [ ] **Signaler une question** depuis le récap :
  - Clic drapeau → modal s'ouvre.
  - Choisir une catégorie, optionnellement un commentaire, Envoyer.
  - Toast « Merci, signalement envoyé », bouton remplacé par check vert.
  - Re-cliquer la même question : aucun nouveau modal (idempotence
    côté client).
- [ ] **Rate-limit** : envoyer >10 signalements en <1 min → 4XX avec
  message générique.
- [ ] **Admin** :
  - Aller sur `/admin`, mot de passe via `ADMIN_PASSWORD`.
  - Vérifier la statbar : `signalements: N` avec N > 0.
  - Section « Signalements » : voir le report avec catégorie +
    extrait de la question + (langue/room si fournis) + commentaire.
  - Bouton « Marquer résolu » → carte grisée, compteur `N-1`.
  - Bouton « Supprimer » → confirm, disparaît.
  - Logout, retour login → aucun élément du dashboard ne doit
    s'afficher avant la connexion (test régression sécurité).
- [ ] **Régression** : créer/éditer une question via `/admin` →
  la nouvelle question doit immédiatement être tirée dans une partie
  ET affichée en FR sans crash (la traduction FR a été upsertée).

## Notes pour la suite

- **EN / ES** : prêts à recevoir un import. Il suffira d'insérer dans
  `QuestionTranslation` avec `language: 'en' | 'es'` — l'ordre des
  `options` doit correspondre à `Question.correctIndex` (qui reste la
  source de vérité).
- **Nettoyage des colonnes legacy** (`Question.question`,
  `Question.options`, …) : volontairement non fait dans ce travail. À
  programmer une fois toutes les traductions importées et validées en
  production.
- **Admin multilingue (édition par langue)** : la page `/admin` continue
  d'éditer la version legacy/FR — pas de UI par-langue ici, comme demandé.

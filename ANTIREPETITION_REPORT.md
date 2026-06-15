# SquizzGame — Anti-répétition des questions (niveau 1 : par PARTIE)

Garantit qu'**aucune question n'est servie deux fois dans la même partie**
(toutes manches confondues : culture/qcm, pixel, géo, pari), avec un **fallback**
propre quand le réservoir filtré est épuisé, et une **traçabilité** en base.

## Fichiers modifiés
- `server/question-store.js` — tirage avec exclusion + fallback (`pickDistinct`).
- `server/index.js` — mémoire `room.servedQuestionIds`, accumulation au
  chargement, fin de pile propre, persistance `GameSession`.
- `public/js/game.js` — toast discret `round_exhausted`.
- `public/locales/{fr,en,es}.json` — clé `game.round.exhausted` (206 clés,
  jeux identiques).
- **Schéma Prisma : inchangé (aucune migration).**

## Architecture (rappel) et choix
Le serveur **pré-charge** les questions de chaque manche par lots
(`loadRoundQuestions` au `start_game`), puis `advance()` raccourcit
naturellement une manche selon `round.questions.length`. L'anti-répétition est
donc implémentée au **niveau du chargement** (équivalent au tirage
question-par-question décrit dans la mission, mais adapté à l'archi existante —
moins invasif, zéro risque sur le gameflow).

## Logique du fallback (strict → élargi → vide)
`pickDistinct(pools, count, exclude)` tire jusqu'à `count` questions
**distinctes**, en excluant `exclude` (ids déjà servis) **et** les déjà choisies,
en parcourant les pools par priorité. Pour les **QCM** :
1. **strict** : `thèmes sélectionnés + difficulté` − déjà servies ;
2. **difficulté relâchée** : `thèmes` (toute difficulté) − déjà servies ;
3. **thèmes relâchés** : tout le type QCM − déjà servies.

Pour **pixel** et **géo** (pas de filtre thème/difficulté) : un seul pool, hors
exclusions. Si après fallback il reste **moins que `count`** → la manche est
**raccourcie** ; s'il reste **0** → la manche est **sautée**. **Jamais** de
doublon.

## Mémoire en partie (autorité)
- `room.servedQuestionIds = new Set()` — créé à la room, **vidé à chaque
  relance** (`start_game`, qui démarre un nouveau cycle de manches).
- `loadRoundQuestions(plan, difficulty, served, code)` charge les manches l'une
  après l'autre en **excluant** `served` puis en y **ajoutant** les ids choisis
  → aucune répétition **entre manches**, y compris quand deux manches partagent
  le type QCM (**culture + pari** sont tous deux des QCM).
- `sendQuestion` (re)marque l'id comme servi **avant** l'émission (anti-race) et
  l'empile dans `room.servedOrder` (ordre réel → GameSession).

## Fond de pile propre (Phase 2)
- Manche **vide** → `startRound` la saute via `finishExhaustedRound`
  (`round_exhausted` + manche suivante / `doGameOver`).
- Manche **raccourcie** → `advance` émet `round_exhausted` à sa fin.
- Garde anti-crash dans `sendQuestion` si jamais un index n'a pas de question.
- Client : toast discret `game.round.exhausted` (n'empêche pas la suite).
- Si **toutes** les manches restantes sont vides → fin via le flux normal
  `doGameOver` (pas d'écran d'erreur, pas de crash).

## Persistance GameSession (Phase 3)
- **Choix roomCode :** `roomCode` est `@unique` au schéma. Pour avoir **une
  GameSession par partie** (une room peut enchaîner plusieurs parties), on
  **suffixe d'un timestamp** : `roomCode = "<code>-<ms>"`. → **aucune migration
  nécessaire** (alternative documentée par la mission), et `update where roomCode`
  reste possible (clé unique).
- Création à la 1ère question (`ensureGameSession`) avec `playerNames`,
  `settings`, `questionIds:[…]`. `questionIds` ré-écrit avec le **cumul** à chaque
  question (pas de read-modify-write → pas de race). `endedAt` posé à
  `doGameOver`.
- **100 % fire-and-forget** : opérations Prisma chaînées sur `room.gsReady`,
  chacune en `try/catch` qui se contente de logguer → ne bloque **jamais** le
  jeu. L'autorité reste le `Set` en mémoire.
- Vérifié sur Neon : create / update / read / delete OK.

## Confirmation
**Aucune répétition possible dans une partie** : chaque id servi est réservé
dans `room.servedQuestionIds` avant émission, et le chargement de chaque manche
exclut cet ensemble cumulé. Le tirage ne renvoie **jamais** une question déjà
servie ; en cas de réservoir vide il renvoie moins (ou rien) plutôt qu'un
doublon. Logs serveur : `[anti-rep] … réservoir épuisé, servedIds=N`.

## Tests fonctionnels (à exécuter)
1. **Partie longue, filtres restreints** : 1 seul thème + 1 difficulté, demander
   beaucoup de questions (ex. culture=20 + pari=20). → Vérifier : aucune
   répétition ; le fallback élargit (logs `réservoir épuisé`) ; la manche
   s'arrête tôt avec le toast « Plus de questions disponibles pour cette manche ».
2. **Multi-manches** : culture + pixel + géo (+ pari) dans la même partie. →
   Aucun id n'apparaît 2 fois, toutes manches confondues (culture & pari = QCM
   partagent le pool : vérifier qu'ils ne se chevauchent pas).
3. **Reconnexion en cours de partie** : un joueur recharge `game.html` → la
   partie continue, la question courante est renvoyée depuis le lot déjà chargé
   (pas de nouveau tirage) → toujours sans répétition.
4. **Base (Neon)** : après une partie, `SELECT roomCode, jsonb_array_length(
   "questionIds"), "endedAt" FROM "GameSession" ORDER BY "startedAt" DESC LIMIT 1;`
   → `questionIds` peuplé (= nb de questions réellement servies), `endedAt` non nul.
   Vérifier qu'une 2ᵉ partie dans la même room crée une **2ᵉ** ligne
   (`<code>-<ms>` différent).

## Niveau 2 (plus tard)
Ce niveau 1 est **par partie** (mémoire éphémère + GameSession). Le **niveau 2**
(anti-répétition **par joueur** sur N jours) nécessitera l'**OAuth** pour un
`userId` stable, et une table dédiée **`PlayerQuestionHistory`**
(`userId`, `questionId`, `servedAt`) consultée au tirage pour exclure les
questions déjà vues par CE joueur récemment.

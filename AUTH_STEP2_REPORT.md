# SquizzGame — OAuth Google étape 2/2 : intégrer l'identité au jeu

Cette étape fait vivre l'identité Google **dans** le jeu : pré-remplissage
pseudo + badge vérifié, liaison des résultats de partie au compte, leaderboard
(vérifiés/tous), et page `/profil`. La connexion reste **OPTIONNELLE** — un
joueur anonyme joue exactement comme avant (création, jonction, jeu, chat).

> ⚠️ Découverte importante : le brief supposait un leaderboard existant
> (`GamePlayerResult`, `/api/leaderboard`, `leaderboard.js`, Top 10 accueil).
> **Rien de tout cela n'existait** dans le code. Sur validation, le leaderboard
> a été **construit de zéro** dans cette étape (table + endpoint + widget).
>
> On NE touche PAS encore aux succès/achievements : page `/profil` prête avec une
> zone « Succès — Bientôt » réservée pour l'étape suivante.

## Migration `user_game_link` & nouveaux champs
- `GamePlayerResult` (**nouvelle table**) : `id, pseudo, pseudoKey, score, won,
  roomCode, createdAt, userId?` (`userId` → `User`, `onDelete: SetNull`).
  Index sur `userId`, `pseudoKey`, `createdAt`.
- `User` : `+ gamesPlayed, gamesWon, totalScore` (Int @default 0) + relation
  `results GamePlayerResult[]`.

⚠️ **Note migration (à retenir)** : `connect-pg-simple` crée sa table `session`
au runtime, hors historique Prisma → `prisma migrate dev` détectait une
**dérive** et voulait **reset la base de prod**. Contournement appliqué : la
migration a été écrite à la main (SQL identique à la sortie Prisma) puis
appliquée avec **`prisma migrate deploy`** (qui ne fait ni shadow DB ni reset).
À refaire pareil pour les prochaines migrations tant que `session` reste hors
schéma.

## Comment Socket.io partage la session avec Express (RAPPEL IMPORTANT)
Le middleware de session est désormais **nommé** (`sessionMiddleware`) et branché
sur **les deux** piles :
```js
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

io.engine.use(sessionMiddleware);   // ← partage avec Socket.io
io.engine.use(passport.initialize());
io.engine.use(passport.session());
```
Dans un handler socket : `const user = socket.request.user || null;`. C'est le
mécanisme à réutiliser pour toute future feature temps-réel liée au compte.

## Sécurité : `userId` vient de la session, JAMAIS du client
- À `create_room` / `join_room` / `lobby_sync`, le serveur lit `socketUser(socket)`
  (= `socket.request.user`) et fixe `player.userId` / `gName` / `gAvatar`. Le
  client **ne peut pas** revendiquer un `userId` (aucun champ client lu pour ça).
- Le pseudo/avatar **visibles** restent ceux envoyés par le client (override par
  partie). Fallback : si le client n'envoie pas de pseudo et qu'un compte est
  présent → `displayName`.
- **Aucune fuite** vers les autres joueurs : `publicPlayer()` retire
  `userId/gName/gAvatar` et n'expose qu'un booléen **`verified`**. Email et
  identifiant Google ne quittent jamais le serveur côté room. (Vérifié : payload
  socket `room_created` ne contient ni `userId` ni `email`.)

## Lobby (UI)
- **Accueil** : pseudo pré-rempli depuis `displayName` (modifiable) + badge
  « compte vérifié » (bouclier doré) près du champ.
- **Liste des joueurs** : mini-bouclier doré sur les joueurs `verified` (jamais
  email/identifiant).
- **CTA anonyme** (au-dessus du chat) : « Connecte-toi pour garder tes stats »
  → `/auth/google?returnTo=<lobby>` (retour au salon après OAuth, la room est
  retrouvée via `sessionStorage` et le joueur passe « vérifié »).
- Avatar : le système en jeu reste **emoji/couleur** (inchangé, non cassé). La
  photo Google est utilisée là où on contrôle un `<img>` : leaderboard + profil.

## Fin de partie : résultats + agrégats (`doGameOver`)
`recordGameResults(room, code)` (fire-and-forget, try/catch) :
- **Ne fait rien si < 2 joueurs** (parties solo non comptées).
- Crée un `GamePlayerResult` par joueur (`userId` = autorité serveur, null si
  anonyme). `won` = meilleur score (solo) / équipe gagnante (mode équipe ; pas de
  victoire en cas d'égalité).
- Pour chaque joueur **connecté**, incrémente `gamesPlayed`, `gamesWon` (si
  gagné), `totalScore` — le tout dans **une `$transaction`** (createMany + updates).

## Leaderboard
**`GET /api/leaderboard?period=week|month&scope=verified|all`** (public ;
défaut `period=week`, `scope=verified` ; fenêtres 7 / 30 jours ; Top 10 victoires) :
- `verified` : uniquement les résultats `userId != null`, regroupés par `userId`,
  `displayName`/`avatarUrl` à jour depuis `User`.
- `all` : regroupés par `pseudoKey` (anonymes inclus) ; `verified=true` pour une
  entrée seulement si **tous** ses résultats pointent vers **un seul** `userId`
  non nul.
- Réponse : `{ ok, period, scope, leaderboard:[{ rank, pseudo, avatarUrl?, wins, verified }] }`.

**UI accueil** (`leaderboard.js` + widget) : sélecteurs **Vérifiés/Tous** et
**Semaine/Mois**, médailles 🥇🥈🥉, mini-bouclier doré sur les entrées vérifiées,
avatar Google (`<img referrerpolicy="no-referrer">`), style scoreboard or/bleu.

## Page `/profil` + endpoint
- **`GET /profil`** : sert `public/profil.html`. Non connecté → état « Connecte-toi
  pour voir ton profil » + bouton Google (pas de redirection forcée).
- **`GET /api/me/profile`** (auth **session** Google, **pas** l'adminAuth) :
  ```
  { ok, user:{ id, displayName, avatarUrl, email, createdAt, preferredLocale },
    stats:{ gamesPlayed, gamesWon, totalScore, winRate, avgScore },
    recent:[ { roomCode, score, won, createdAt } ] (10 dernières) }
  ```
  `winRate` et `avgScore` calculés serveur.
- **UI** : carte d'identité (avatar, nom, « Membre depuis … », langue préférée),
  4 KPI, table des 10 dernières parties (date / salon / score / ✓✗), bouton
  « Se déconnecter », zone « Succès — Bientôt » (réservée). Lien « Mon profil »
  sur l'accueil (carte connectée) et le lobby (en-tête), visibles si connecté.

## `preferredLocale` (langue préférée)
- **`POST /api/me/locale { locale }`** (auth requise ; valide `fr|en|es` → 400
  sinon) met à jour `User.preferredLocale`.
- `i18n.js` : `setLang(lang, persist=true)` — un changement de langue par un
  connecté **persiste** (fire-and-forget ; 401 ignoré pour les anonymes).
- À l'ouverture de l'accueil pour un connecté, si `preferredLocale` diffère de la
  langue courante → `setLang(pl, false)` (appliqué **silencieusement**, sans
  re-persister). N'affecte pas le comportement local des anonymes.

## Variables d'env (inchangées depuis l'étape 1)
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `DATABASE_URL`,
`NODE_ENV=production` (cookies `secure`), `PUBLIC_URL`. CSP `img-src` autorise
déjà `*.googleusercontent.com` (avatars).

## Checklist de test
### Vérifié automatiquement (local)
- [x] Session partagée Socket.io : handshake avec session forgée → `create_room`
      renvoie `verified:true`, **sans** `userId`/`email`/`gName`/`gAvatar`.
- [x] Anonyme : `create_room` → `verified:false`, jeu inchangé.
- [x] Fin de partie : `GamePlayerResult` écrits + agrégats `User` incrémentés
      (gamesPlayed/Won/totalScore) en transaction (parties solo ignorées).
- [x] `GET /api/leaderboard` : `scope=verified` (comptes uniquement) ;
      `scope=all` (mix avec flag `verified` + avatar/displayName à jour).
- [x] `GET /api/me/profile` : anon → **401** ; connecté → user + stats
      (winRate/avgScore) + 10 dernières parties.
- [x] `POST /api/me/locale` : anon → 401 ; locale invalide → 400 ; valide → 200
      et `preferredLocale` persisté.
- [x] Aucune route `/api/admin/*` impactée (adminAuth indépendant).

### À valider manuellement (navigateur + compte Google réel)
- [ ] Connecté en lobby : pseudo + avatar pré-remplis, badge vérifié visible aux
      autres joueurs.
- [ ] Anonyme + connecté dans la même room : tout fonctionne, badges corrects.
- [ ] Partie réelle ≥ 2 joueurs (1 connecté) → `GamePlayerResult.userId` rempli +
      stats agrégées sur `User` ; visible dans le leaderboard et `/profil`.
- [ ] Leaderboard accueil : bascule Vérifiés/Tous + Semaine/Mois, médailles,
      avatars Google.
- [ ] `/profil` : KPI + 10 dernières parties cohérents.
- [ ] Changement de langue connecté → persisté ; rechargement sur autre appareil
      applique `preferredLocale`.

> Le tour complet OAuth nécessite une interaction navigateur + compte Google ;
> les tests automatiques ci-dessus ont utilisé une **session forgée signée**
> (insérée dans la table `session` + cookie signé `SESSION_SECRET`) pour valider
> de bout en bout le chemin session → `req.user` → `player.userId` sans dépendre
> de Google. Chromium headless n'est pas lançable dans ce conteneur
> (`libnspr4.so` manquant) → l'UI est validée par le markup servi + les endpoints.

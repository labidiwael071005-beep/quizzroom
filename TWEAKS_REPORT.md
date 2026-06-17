# SquizzGame — Lot d'ajustements (pseudos libres, signalement joueur, codes sans préfixe)

Trois ajustements, sans casser multijoueur / multilingue / OAuth / anti-répétition /
signalement de questions / admin.

## 1. Pseudos d'anonymes — règle d'unicité relâchée
**Constat** : il n'existait en réalité **aucune** vérification d'unicité d'un
pseudo anonyme contre `User.pseudoKey` dans le chemin Socket.io
(`create_room` / `join_room` / `lobby_sync`) — seuls s'appliquaient longueur,
regex, profanité (`validatePseudo`) et **unicité dans la room**
(`room.players.find(p => p.name === name)`). Donc un anonyme pouvait déjà
reprendre le pseudo d'un compte certifié ; rien à retirer.

**Garde-fous conservés** (anonymes) : longueur 2–20 (via `validatePseudo`),
caractères/profanité/spam, **unicité dans la room** (refus « Ce pseudo est déjà
pris. » si collision dans la même room).

**Comptes connectés — inchangé** : pseudo figé par le compte, `@unique` sur
`User.pseudoKey`. Si un compte tente un pseudo déjà pris par **un autre compte**,
les endpoints renvoient désormais **409** avec la clé i18n **`pseudo.taken`**
(« Ce pseudo est déjà utilisé par un autre compte ») — `GET /api/me/pseudo/available`
(reason `pseudo.taken`) et `POST /api/me/pseudo` (409). `pseudo.err.taken` (in-room)
reste distinct.

Fichiers : `server/index.js` (endpoints pseudo), `public/locales/*` (`pseudo.taken`).

## 2. Signalement de joueur
**Modèle** `PlayerReport` (migration `player_reports`) : `reportedUserId?` +
`reportedPseudo`, `reporterUserId?` + `reporterPseudo`, `category`
(pseudo/chat/behavior/other), `comment?` (≤500, filtré), `roomCode?`,
`status` (open/resolved), `createdAt`. Relations inverses `User.reportsAgainst`
et `User.reportsMade`.

**Endpoint** : événement **Socket.io `report_player`** (choisi car la présence
dans la room est validée via `socket.id`, impossible proprement en REST pur).
Body `{ code, targetName, category, comment }`. Validations serveur :
- code valide + reporter présent dans la room (sinon ignoré),
- cible = **autre** joueur de la même room (jamais soi),
- `category ∈ {pseudo,chat,behavior,other}` (défaut `other`),
- `comment` trim ≤ 500 ; s'il contient des termes filtrés (`containsProfanity`)
  → remplacé par `[commentaire filtré]` (on ne stocke pas le contenu injurieux),
- résolution serveur des pseudos/userId affichés (cible **et** auteur),
- rate-limit via `checkActionRate` + **cooldown 5 min côté UI** par cible.
Réponse : `player_report_ack { ok }`. Aucune info renvoyée aux autres joueurs ni
au joueur signalé.

**UI** (`public/js/report-player.js`, partagé lobby + jeu) :
- Menu 3 points (lobby) : visible sur **tout autre joueur** ; « 🚩 Signaler »
  pour tous (sous « Léguer »/« Exclure » pour l'hôte, seule entrée sinon).
- En partie : petit bouton ⋮ en coin d'avatar (autres joueurs) → même modale.
- Modale chunky `.panel` : catégorie (radios) + commentaire optionnel (≤500) +
  Envoyer / Annuler. Toast `report.player.sent`. Entrée désactivée 5 min après
  envoi (anti-spam local).

**Admin** : sous-onglet **« Signalements de joueurs »** dans l'onglet
Signalements (à côté de « Questions »), avec badge d'ouverts.
- `GET /api/admin/player-reports?status=&category=` (adminAuth) — liste triée
  desc + `openCount`.
- `PATCH /api/admin/player-reports/:id` → `status: 'resolved'`.
- `DELETE /api/admin/player-reports/:id`.
- Tableau (date, signalé + badge certifié, signalé par, catégorie, commentaire,
  statut, Résoudre / Supprimer) + filtres catégorie & statut.

i18n : `report.player.{menu,title,cat.*,commentPlaceholder,send,sent}` en fr/en/es.

## 3. Codes de salon sans préfixe « QR- »
- **Génération** : `generateCode()` renvoie **6 caractères** de l'alphabet sûr
  (`A-Z` sans I/O + `2-9`), sans préfixe ; unicité vérifiée en mémoire.
- **Validation serveur** : `validRoomCode` = `^[A-Z2-9]{6}$` (strict, 6 exacts).
  `join_room` normalise l'entrée (`trim().toUpperCase()`) avant validation. Le
  préfixe « QR- » n'est **plus accepté** (rejet « Code invalide. »).
- **UI** : champ code accueil `maxlength=6`, `pattern="[A-Za-z2-9]{6}"`,
  placeholder `home.codePlaceholder` (« Code à 6 caractères »), normalisation
  live (uppercase + alphabet sûr, **plus de strip/prepend `QR-`**). Lobby :
  chip code 6 caractères (placeholder `······`), Copier copie 6 caractères.
- **Nettoyage** : plus aucune occurrence **fonctionnelle** de `QR-`/`QR_` dans le
  code actif (seuls subsistent 2 commentaires explicatifs). Les anciens rapports
  historiques gardent leurs mentions.

> Note : le corps du brief demandait de **rejeter** strictement « QR- » alors que
> la checklist initiale suggérait de l'accepter (collé). Choix retenu (validé) :
> **rejet strict** — d'où la correction du point 4 ci-dessous.

## Checklist de test
### Vérifié automatiquement (local)
- [x] Un **anonyme** crée/rejoint avec le pseudo d'un compte certifié → accepté
      (badge vérifié = false), sans erreur d'unicité.
- [x] Deux **comptes** ne peuvent pas partager un pseudo → `POST /api/me/pseudo`
      renvoie **409 `pseudo.taken`**.
- [x] `report_player` : auto-signalement **ignoré** ; signalement d'un autre →
      `PlayerReport` créé (pseudos/catégorie/commentaire corrects), visible dans
      `/admin`, **résoluble** (PATCH 200) et **supprimable** (DELETE 200).
- [x] Code généré = `XXXXXX` (6 chars, ex. `9NZ3AT`), sans préfixe ; rejoint en
      **minuscules** → normalisé/accepté ; **`QR-XXXXXX` → rejeté** « Code invalide. ».

### À valider manuellement (navigateur)
- [ ] Menu 3 points : « Signaler » présent sur les autres joueurs en **lobby**
      ET **en partie** ; absent sur soi ; cooldown 5 min après envoi.
- [ ] Toast « Signalement envoyé, merci » ; rien d'affiché aux autres joueurs.
- [ ] `/admin` → sous-onglet « Signalements de joueurs » : filtres, Résoudre,
      Supprimer.
- [ ] Accueil : champ code à 6 caractères (placeholder localisé), saisie forcée
      en majuscules ; un code `7F3K2A` s'affiche/rejoint tel quel.

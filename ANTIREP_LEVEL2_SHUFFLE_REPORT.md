# SquizzGame — Anti-répétition niveau 2 (par joueur) + mélange des réponses

Deux features serveur, sans casser le multijoueur / multilingue / validation /
signalement / manches géo & pari, et sans jamais fuiter la bonne réponse au
client avant le reveal.

## 1. Mélange des réponses (qcm / pixel / pari)
Les options sont mélangées **par joueur, à chaque émission**. Tout est calculé
**côté serveur** ; le client continue de travailler avec l'index du tableau
qu'il affiche.

**Où est stocké le mapping** : sur la room,
```
room.optionOrders[playerName][qKey] = { permutation, displayedCorrectIndex }
```
- Clé par **nom de joueur** (unique et stable dans une room) → robuste aux
  reconnexions (le même joueur retrouve son ordre).
- `permutation` = permutation aléatoire (Fisher-Yates) des indices [0..3].
- `displayedCorrectIndex = permutation.indexOf(correctIndex)` (position de la
  bonne réponse dans le nouvel ordre).
- `qKey = q.id || 'idx-'+index`.
- Purgé à `start_game` et à `doGameOver`.

**Émission** (`sendQuestion`) : au lieu d'un `io.to(code).emit`, on boucle sur
`room.players` et on émet à chaque socket un payload dont `options` **et**
`translations[lang].options` (toutes langues) sont réordonnés avec **la même
permutation** (donc l'ordre reste cohérent quelle que soit la langue affichée).
Le géo n'est pas mélangé ; le pari est traité comme un qcm. `displayedCorrectIndex`
n'est **jamais** envoyé.

**Validation** (`submit_answer`) : l'`answerIndex` reçu correspond à l'ordre vu
par le joueur. On le compare au `displayedCorrectIndex` mémorisé pour ce joueur
(fallback `q.correctIndex` si aucun mapping — reconnexion marginale).
`answer_result.correctIndex` renvoyé = `displayedCorrectIndex` (le client
surligne au bon endroit).

**Reveal** (`endQuestion` → `question_reveal`) : émis **par joueur**, avec
`correctIndex = displayedCorrectIndex` du joueur **et** ses `translations`
mélangées → chacun voit le surlignage vert à sa position, même si deux joueurs
ont des ordres différents. (`correctAnswer` texte reste correct car le client le
résout via `translations[correctIndex]`.)

**Récap de fin de partie** : `room.history` est partagé et rendu en ordre
**canonique**. On reconvertit donc l'`answerIndex` (ordre mélangé) de chaque
joueur en index **canonique** via sa permutation (`permutation[display]`) avant
de le stocker — sinon le récap afficherait la mauvaise réponse pour les joueurs
mélangés.

**Reconnexion en pleine question** (`lobby_sync`) : on ré-émet `new_question`
via le même helper → réutilise la permutation déjà mémorisée (même ordre) ;
sinon en génère une (cas marginal). Validation et reveal fonctionnent sans crash.

## 2. Anti-répétition niveau 2 — `UserQuestionHistory`
```prisma
model UserQuestionHistory {
  id String @id @default(cuid())
  userId String; user User @relation(... onDelete: Cascade)
  questionId String; question Question @relation(... onDelete: Cascade)
  seenAt DateTime @default(now())
  @@unique([userId, questionId])
  @@index([userId, seenAt])
}
```
Relations inverses ajoutées sur `User.questionHistory` et `Question.userHistory`.
Migration : `user_question_history` (écrite à la main + `prisma migrate deploy`
— `migrate dev` voudrait reset la prod à cause de la table `session` de
connect-pg-simple, hors historique Prisma).

## 3. Pioche enrichie (sans casser le niveau 1)
- **`HISTORY_WINDOW_DAYS = 14`** (constante en haut de `server/question-store.js`,
  point de contrôle unique, ajustable).
- **Début de partie** (`start_game`) : `loadPlayerExclusions(room)` charge, pour
  chaque joueur **connecté**, ses `questionId` vus depuis < 14 j →
  `room.playerExclusions = Map<userId, Set<questionId>>` (anonymes : aucun).
- **Pioche** : `softExclude = ⋃ playerExclusions[userId]` des connectés présents,
  passé aux tirages. `pickDistinct(pools, count, hardExclude, softExclude)` à
  **deux passes** :
  1. **Passe 1** (historique respecté) parcourt les pools de priorité :
     1. strict (thèmes + difficulté) + historique
     2. élargi difficulté + historique
     3. élargi thèmes + historique
  2. **Passe 2** (historique **relâché**, en DERNIER recours) :
     4. strict **sans** historique
     5. élargi **sans** historique
  3. sinon → moins de questions (manche raccourcie, comme niveau 1).
  → **`servedQuestionIds` (niveau 1) n'est JAMAIS relâché** (hardExclude), même
  pendant la passe 2. Un log info `[anti-rep L2] historique relâché : +N …`
  est émis quand on retombe sur des questions déjà vues.
- **À chaque question servie** (`recordSeenForConnected` dans `sendQuestion`) :
  `userQuestionHistory.upsert` (create / `seenAt=now`) pour chaque joueur
  **connecté**, en fire-and-forget. Le cache `playerExclusions` est aussi mis à
  jour en mémoire pour les manches suivantes de la même partie.
- **Connexion en cours de partie** (`lobby_sync`, `room.started`) :
  `loadOnePlayerExclusion` recharge ses exclusions (tolérant : si la requête
  échoue, on continue sans).
- **Anonymes** : `recordSeenForConnected` ignore `!p.userId` → **aucun
  historique** généré ; l'anti-répétition niveau 1 (par partie) continue de
  fonctionner pour eux.

## 4. Admin
- `GET /api/admin/stats/overview` renvoie `totals.historyTotal`
  (`userQuestionHistory.count()`) et `totals.historyCoverage` (nombre de
  questions **distinctes** vues par ≥ 1 joueur connecté).
- Dashboard `/admin` : carte KPI **« Historique total »** + sous-texte
  **« N questions vues (couverture) »**.

## Checklist de test
### Vérifié automatiquement (local)
- [x] **Mélange** : 2 joueurs, même question → **ordres d'options différents**,
      même jeu d'options ; chacun voit la **même bonne réponse** révélée à SA
      position ; `answer_result`/`question_reveal` cohérents par joueur ; la
      traduction FR résout la bonne réponse à l'index propre.
- [x] **Pioche** : soft-exclude (historique) respecté quand le pool suffit ;
      **niveau 1 (served) jamais resservi même en relâchant** l'historique ;
      relâche en dernier recours avec log ; `upsert` idempotent (1 ligne).
- [x] **Historique** : une partie d'un compte connecté crée des lignes
      `UserQuestionHistory` (seenAt récent) ; une 2ᵉ partie évite les questions
      déjà servies.
- [x] **Admin** : `stats/overview` expose `historyTotal` + `historyCoverage`.

### À valider manuellement (navigateur + comptes Google)
1. 2 joueurs : même question, ordres différents, bonne réponse révélée au bon
   endroit pour chacun.
2. Compte connecté : 10 Q Culture G / Facile, rejouer aussitôt → zéro répétition
   tant que le pool non-vu n'est pas épuisé.
3. Base : lignes `UserQuestionHistory` pour ce userId, `seenAt` récent.
4. Anonyme : aucune ligne d'historique ; niveau 1 (par partie) OK.
5. Pool restreint (≤ 5 questions possibles) : la manche se raccourcit proprement,
   pas de répétition.
6. Reconnexion en pleine question : validation + reveal ne crashent pas, ordre
   cohérent.

## Notes pour plus tard
- `HISTORY_WINDOW_DAYS` (14 j) pourrait être exposé côté admin (réglage global) —
  un seul endroit à changer aujourd'hui.
- Possible ajout d'un « Réinitialiser mon historique » dans `/profil`
  (`deleteMany({ where:{ userId } })`) si demandé.

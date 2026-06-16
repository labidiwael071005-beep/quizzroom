# SquizzGame — Lot de finitions UX

Six finitions UX au-dessus de l'OAuth Google existant (User, sessions, /api/me,
GamePlayerResult, /profil, leaderboard). Mode anonyme, multijoueur, multilingue
et sécurité (identité via session, jamais `userId` du client) préservés.

## Phase 1 — Sélection d'avatar compacte
L'avatar (couleur + emoji) est choisi sur le **panneau d'accueil** (`index.html`,
`#create-avatar-picker`). Avant : grilles couleur + emoji affichées en entier.
Maintenant : seul l'avatar courant + un petit bouton **« + »** doré (à côté du
champ pseudo) ouvrent une **pop-up** (overlay assombri + carte `.panel`) avec
aperçu live, grilles couleur/emoji, **Annuler / Valider**. Fermeture sur
Annuler / Échap / clic extérieur ; **focus piégé** ; application au clic sur
Valider seulement. Les payloads avatar envoyés au serveur (create/join) sont
inchangés.
- Fichiers : `public/js/avatar.js` (compact + pop-up `openAvatarModal`),
  `public/index.html` (ligne identité avatar+pseudo, label « Ton avatar »
  supprimé), `public/css/home.css` (compact, bouton, grilles partagées panneau/
  pop-up), i18n `lobby.editAvatar`, `avatar.color/emoji/cancel/validate`.

## Phase 2 — Récap de fin de partie scrollable
Bug : `#screen-history` (écran récap) héritait de `.game-screen`
`align-items:center` → quand la liste dépasse la hauteur, le **haut** était
centré hors cadre et **inatteignable** au scroll. Corrigé en alignant ce seul
écran en haut + scroll fluide.
- Fichier : `public/css/game.css` — `#screen-history { align-items:flex-start;
  overscroll-behavior:contain; -webkit-overflow-scrolling:touch; }` +
  `.history-wrap { margin:0 auto; padding:8px 0 28px; }`. Cards, animation et
  boutons de signalement inchangés.

## Phase 3 — Profil : bandeau « Connecte-toi » retiré pour les connectés
La page `/profil` montrait déjà le bon état, mais le bandeau est désormais
**retiré du DOM** (pas seulement masqué) quand l'utilisateur est connecté —
aucun doublon possible. Les anonymes gardent l'invitation pleine page.
- Fichier : `public/js/profil.js` (`loggedOut.remove()` si connecté).

## Phase 4 — Pseudo unique pour les comptes connectés
**Modèle** : `User.pseudo @unique` + `User.pseudoKey @unique` (pseudo normalisé
trim+lower). Migration `user_pseudo` (appliquée via `migrate deploy`, cf. note).

**Endpoints** :
- `GET /api/me/pseudo/available?p=<pseudo>` (auth) → `{ available, reason? }`.
- `POST /api/me/pseudo { pseudo }` (auth) → `{ ok, user }` ou `400 { reason }`.

Validation (serveur, miroir client) : longueur **3–16**, charset
`^[a-zA-Z0-9._-]+$` (sans espace), **profanité** (`isReservedPseudo` +
`containsProfanity`), **unicité** par `pseudoKey` (insensible à la casse,
exclut soi-même). Les `reason` sont des **clés i18n** (`pseudo.err.*`).

**Flow 1ère connexion** : `/api/me` renvoie `user.pseudo` (null si non défini).
Quand `authenticated && pseudo==null`, le client ouvre un **écran obligatoire
« Choisis ton pseudo »** (modal non fermable, `js/pseudo.js` → `PseudoUI.openGate`)
avec contrôle de dispo **débouncé ~300 ms**. Tant que le pseudo n'est pas défini,
impossible de créer/rejoindre (overlay) ni de voir le profil normal (gate aussi
sur `/profil`).

**`/profil`** : pseudo **en grand**, nom Google en sous-texte
(« Compte Google : … »), section **« Modifier mon pseudo »** (input + dispo live
+ Enregistrer), info « Ton pseudo est unique… ».

**Accueil (connecté)** : pseudo **pré-rempli et verrouillé** (lecture seule) +
lien « Modifier dans mon profil ».

**Serveur / Socket.io** : à `create_room` / `join_room` / `lobby_sync`, si le
socket est authentifié **et** a un pseudo, le `displayName` de room est **forcé**
à `user.pseudo` — le client ne peut PAS l'override (vérifié : un client envoyant
`HackerName` apparaît quand même sous son pseudo). Les anonymes tapent librement
leur pseudo (filtre profanité) ; un anonyme peut prendre le même libellé qu'un
compte, la différenciation reste le **badge vérifié**.
- Fichiers : `prisma/schema.prisma`, migration `…_user_pseudo`, `server/index.js`
  (import profanité, `validatePseudoChoice`, 2 endpoints, `/api/me` + `/api/me/
  profile` enrichis, forçage pseudo dans les 3 handlers socket), `public/js/
  pseudo.js` (nouveau), `index.html`/`home.css`, `profil.html`/`profil.js`/
  `profil.css`, `style.css` (gate + `.home-input` partagé), i18n `pseudo.*` +
  `profile.pseudo.*` + `profile.googleAccount`.

## Phase 5 — Leaderboard réservé aux comptes connectés
Suppression du sélecteur **Vérifiés / Tous**. `GET /api/leaderboard` ignore
`scope` (force `verified`), classe par `userId`, affiche **`User.pseudo`**
(fallback `displayName`) + avatar Google. Top 10, fenêtres **Semaine / Mois**
conservées. Pied de carte **« Seuls les comptes connectés apparaissent ici. »**
(`leaderboard.verifiedOnly`). Badge vérifié conservé comme accent.
- Fichiers : `server/index.js` (endpoint simplifié), `public/index.html`
  (toggle retiré + pied), `public/js/leaderboard.js` (plus de `scope`),
  `public/css/home.css` (`.lb-footer`), i18n.

## Phase 6 — Menu déroulant utilisateur (accueil + lobby)
Connecté : **cercle photo** (36px, bordure dorée, `referrerpolicy="no-referrer"`,
`alt=pseudo`) en **haut à droite, à gauche du sélecteur de langue**. Clic →
**popover** `.panel` : en-tête (avatar + pseudo + « Compte Google »), lien
**Mon profil** → `/profil`, **Se déconnecter** → `POST /auth/logout` + reload.
Ferme au clic extérieur / Échap / clic sur le lien. Les boutons « Mon profil » /
« Se déconnecter » du **panneau central** sont retirés pour les connectés ; les
**anonymes** gardent « Se connecter avec Google » au centre. Même menu sur le
lobby.
- Fichiers : `public/js/usermenu.js` (nouveau, partagé), `index.html` (topbar +
  `initAuth` réécrit), `lobby.html` + `public/js/lobby.js`, `public/css/
  style.css` (`.user-menu`/`.um-*`), i18n `auth.myProfile`.

---

## ⚠️ Note migration (rappel)
`connect-pg-simple` crée sa table `session` au runtime → `prisma migrate dev`
détecte une dérive et veut **reset la base de prod**. Migration `user_pseudo`
donc écrite à la main + appliquée avec **`prisma migrate deploy`** (pas de reset).

## Nouvelles routes / endpoints
| Méthode | Route | Auth | Rôle |
|--------|-------|------|------|
| GET  | `/api/me/pseudo/available?p=` | session | Dispo + validation pseudo |
| POST | `/api/me/pseudo` | session | Définir / modifier le pseudo |
| GET  | `/api/leaderboard?period=week\|month` | public | Top 10 comptes connectés (scope retiré) |

(`/api/me` et `/api/me/profile` renvoient désormais `pseudo`.)

## Checklist de test
### Vérifié automatiquement (local, session forgée signée)
- [x] `POST /api/me/pseudo` : longueur/charset/profanité → `reason` ; unicité
      insensible à la casse ; ré-vérif de son propre pseudo OK ; 2ᵉ compte sur le
      même `pseudoKey` → `400 pseudo.err.taken`.
- [x] Socket : un connecté avec pseudo voit son `playerName` **forcé** au pseudo
      (client envoyant un autre nom ignoré), `verified:true`, sans fuite.
- [x] `/api/leaderboard?scope=all` → renvoie quand même `scope:verified`, classé
      par compte avec `pseudo`/avatar.
- [x] `/api/me/profile` → inclut `pseudo` + `displayName` (nom Google).
- [x] Pages servies : accueil (avatar compact, `pseudo.js`, `usermenu.js`,
      `user-menu`, leaderboard sans toggle + pied), `/profil` (section pseudo,
      « Compte Google »), `/lobby` (`user-menu`). JSON locales valides.

### À valider manuellement (navigateur + compte Google)
- [ ] Accueil : avatar compact → pop-up couleur/emoji ; anciennes grilles parties.
- [ ] Partie > 10 questions → récap : on défile bien jusqu'en haut.
- [ ] `/profil` connecté : aucun bandeau « Connecte-toi » ; anonyme → invitation.
- [ ] 1ère connexion : écran « Choisis ton pseudo » obligatoire (dispo live,
      unicité, i18n) ; impossible de créer/rejoindre avant.
- [ ] En partie (connecté) : on apparaît sous le **pseudo** (jamais le nom
      Google), modifiable dans `/profil` ; un anonyme peut taper le même libellé
      (différencié par le badge vérifié).
- [ ] Leaderboard : uniquement les comptes, plus de toggle, pied affiché.
- [ ] Accueil + lobby (connecté) : cercle photo haut-droite → menu (Mon profil /
      Déconnexion) ; anonyme : bouton « Se connecter avec Google » au centre.

> Le rendu navigateur (pop-ups, menu, gate) est validé par le markup servi + les
> endpoints : Chromium headless n'est pas lançable dans ce conteneur
> (`libnspr4.so` manquant).

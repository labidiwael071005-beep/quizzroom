# SquizzGame — Fix blocage de pseudo + badge vérifié « ampoule »

## Problème 1 — Le bloc qui bloquait
`server/index.js`, handler `socket.on('join_room', …)`, ≈ ligne 1915 :
```js
const name = String(playerName).trim();
if (room.players.find(p => p.name === name))
  return socket.emit('join_error', 'Ce pseudo est déjà pris.');
```
Ce test refusait **toute** collision de nom dans la room, y compris un anonyme
voulant le même pseudo qu'un compte certifié.

## Approche retenue (validée) : nom interne unique + libellé d'affichage
Plutôt que d'autoriser deux `p.name` identiques (ce qui casserait le moteur, qui
indexe par nom : `room.answers[name]`, `optionOrders[name]`, `pariMiserDone[name]`,
ids DOM des avatars en jeu `sanitizeId(name)`, statuts, couronne, kick/léguer/
signaler…), on garde :
- **`p.name`** = identité **interne UNIQUE** dans la room (moteur, couronne, ids
  DOM, actions). **Zéro re-key** → aucun risque sur le scoring/jeu.
- **`p.label`** = **pseudo affiché** (peut être partagé entre un anonyme et un
  certifié). Distinction visuelle = l'ampoule.

### Règle d'unicité par catégorie (join_room)
```js
const iAmVerified = !!(gu && gu.id);
const label = String(playerName).trim();
if (room.players.find(p => (p.label || p.name) === label && !!p.userId === iAmVerified))
  return socket.emit('join_error', 'Ce pseudo est déjà pris dans cette room.');
const name = uniqueRoomName(room, label); // suffixe « #2 », « #3 »… si besoin
```
- **anon vs anon** même libellé → ❌ refusé.
- **vérifié vs vérifié** même libellé → ❌ refusé (déjà impossible via `@unique`
  sur `User.pseudoKey`, gardé par sécurité).
- **anon + vérifié** même libellé → ✅ accepté ; le 2ᵉ obtient un `name` interne
  suffixé, `label` = pseudo partagé.

Exemples (vérifiés automatiquement) :
- Vérifié « Wael » (host) + anon « Wael » → acceptés : `name` = `Wael` / `Wael#2`,
  `label` = `Wael` / `Wael`, `verified` = true / false. ✅
- 2ᵉ anon « Wael » → refusé. ✅
- 2 certifiés « Wael » → impossible (DB) ; code défensif OK.

### Audit de l'identification interne
- **Émetteur d'un événement** : toujours `room.players.find(p => p.id === socket.id)`
  (submit_answer, chat, pari, report…) — inchangé, sûr.
- **`lobby_sync`** (reconnexion) : un **vérifié** est désormais retrouvé par
  **`userId`** (stable même si deux joueurs partagent le libellé) ; un **anonyme**
  par son **nom interne** (unique). Émet `self_name` pour que le client mémorise
  son nom interne.
- **kick / léguer / signaler** : ciblent par `targetName` = **nom interne**
  (unique, envoyé en `data-name`) → aucune ambiguïté même avec deux libellés
  identiques. Inchangés.
- **`room.hostName`** reste le **nom interne** de l'hôte (matching couronne
  `p.name === hostName`). Les messages humains (chat, système, kick, transfert,
  départ) et les pseudos stockés dans `PlayerReport` utilisent désormais
  **`label`**.
- **Client** : `app.js` mémorise le `selfName` renvoyé par
  `room_created`/`room_joined` ; `lobby.js` écoute `self_name`. L'identité client
  (`isMe`, ids DOM, lobby_sync, cibles d'action) reste le **nom interne** ;
  l'**affichage** (liste lobby, avatars jeu, scores, classement, récap, chat,
  messages système) utilise **`label`**.

## Problème 2 — Badge vérifié = ampoule lumineuse
Le bouclier doré (`ti-shield-check` / `.player-verified` / `.verified-badge`) est
remplacé par une **petite ampoule** en **haut-droite du cercle de l'avatar**.

CSS (dans `public/css/theme.css`, donc disponible partout) :
```css
.avatar-wrap{ position:relative; display:inline-block; }
.avatar-bulb{
  position:absolute; top:-2px; right:-2px; width:11px; height:11px; border-radius:50%;
  background:radial-gradient(circle at 35% 35%, #fff5c2 0%, #ffe07a 45%, #d4a017 100%);
  box-shadow:0 0 6px rgba(255,224,122,.9), 0 0 14px rgba(255,200,80,.55);
  z-index:3; pointer-events:none; animation:bulb-pulse 1.6s ease-in-out infinite;
}
.avatar-bulb--lg{ width:15px; height:15px; top:-3px; right:-3px; }   /* profil / jeu */
@keyframes bulb-pulse{ 0%,100%{transform:scale(1);opacity:1;} 50%{transform:scale(1.1);opacity:.85;} }
@media (prefers-reduced-motion: reduce){ .avatar-bulb{ animation:none; } }
```
- Pas de glyphe : juste la lumière + halo (glow → lisible sur fond clair/sombre).
- **Accessibilité** : `title="Compte vérifié"` (clé i18n `lobby.verifiedAccount`)
  + texte `.sr-only` pour les lecteurs d'écran ; animation coupée si
  `prefers-reduced-motion`.
- Appliquée : **liste joueurs lobby**, **barre d'avatars en jeu** (`--lg`),
  **avatar /profil** (`--lg`), **avatar compact accueil** (ajouté par `initAuth`
  quand connecté). La sémantique `verified` reste dans les données joueur.
- Conservés (non-avatar) : icône du CTA « Connecte-toi » du lobby, accent du
  leaderboard, indicateurs « certifié » de `/admin`.

## Checklist de test
### Vérifié automatiquement (local)
- [x] Anonyme reprend le pseudo d'un certifié → **accepté** (noms internes
      `Wael`/`Wael#2`, libellés `Wael`/`Wael`, un seul `verified`).
- [x] Deux anonymes même pseudo → **refusé** (« déjà pris dans cette room »).
- [x] Signaler (menu 3 points) cible par **nom interne** → le bon joueur est
      signalé même avec deux « Wael » (reportedPseudo = libellé, reportedUserId
      du certifié renseigné).
- [x] Markup ampoule servi (theme.css, lobby/jeu/profil/accueil) ; plus de
      bouclier d'avatar ; pages se chargent sans erreur JS (syntaxe OK).

### À valider manuellement (navigateur)
- [ ] Ampoule visible en haut-droite de l'avatar dans **lobby**, **en jeu**,
      **/profil**, **accueil** (connecté) ; halo lisible clair/sombre ; pulse
      subtile (absente si reduced-motion).
- [ ] Anonyme « Wael » dans la room d'un certifié « Wael » : **seul le certifié**
      a l'ampoule ; distinction immédiate.
- [ ] Exclure / léguer / signaler fonctionnent même avec deux joueurs « Wael ».
- [ ] Aucune régression : OAuth, signalements, leaderboard, `/admin`,
      reconnexion (le joueur retrouve son slot, scores intacts).

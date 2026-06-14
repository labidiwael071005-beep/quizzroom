# Refonte visuelle SquizzGame — Étape 1/3 : design system + accueil

Nouvelle identité « plateau de jeu télévisé » façon Gartic Phone : fond **bleu
royal**, **rideaux rouges + liseré or** (signature), accents **or** + boutons
**bleus**, typo **Fredoka** (ronde, chunky), boutons à ombre pleine décalée.
Cette étape pose le **design system** réutilisable et refait la **page
d'accueil**. Lobby & jeu suivront (étapes 2 & 3).

## Fichiers créés / modifiés

| Fichier | Action |
|---------|--------|
| `public/fonts/fredoka-400/500/600/700.woff2` + `Fredoka-OFL.txt` | **créés** — police auto-hébergée (SIL OFL). |
| `public/css/theme.css` | **réécrit** — tokens d'identité + composants chunky + bloc COMPAT (lobby/game). |
| `public/css/home.css` | **créé** — layout de la scène d'accueil. |
| `public/index.html` | **refondu** — scène plateau TV (hooks JS & data-i18n conservés). |
| `public/js/app.js` | **modifié (2 points)** — create & join partagent pseudo+avatar. |
| `public/locales/{fr,en,es}.json` | **+2 clés** (`home.slogan`, `home.or`), jeux de clés identiques (203). |

> CSP : `style-src 'self'` et `font-src 'self'` déjà autorisés (Helmet) — aucune
> modification. Vérifié : page, `theme.css`, `home.css`, `.woff2`, `locales`
> répondent **200**.

## Tokens du thème (`theme.css :root`)

```
Fond     : --bg-1 #3566e6 · --bg-2 #1c43a8 · --bg-3 #112a72 · --floor #0f2156
Boutons  : --accent #2a5fe0 · --accent-dark #1b3f9e
Or       : --gold #ffcf4d · --gold-dark #c79318 · --logo-gold #ffe07a · --logo-shadow #b8451c
Rouge    : --red-1 #b81616 · --red-2 #e8261c · --red-3 #ff4332
Panneau  : --panel #fff8ec · --panel-border #ead7b0 · --ink #3a2a1d · --ink-soft #9a7a52
Bon/rayon: --correct #3ec46d · --correct-dark #2da257 · --radius 16 · --radius-lg 20
Police   : Fredoka (400/500/600/700)
```
Composants réutilisables : `.stage-bg`, `.btn` + `.btn--primary/--gold/--ghost`
(+ `--lg`, `--block`), `.panel`, `.curtain` (`.l`/`.r`/`.open`), `.spot`.
Un **bloc COMPAT** redéfinit les variables encore consommées par
`style/lobby/game/admin.css` (pages non refondues) → rien n'est cassé en
attendant les étapes 2 & 3 (leur décor `theme.js` est conservé).

## Hooks JS & i18n préservés sur l'accueil (vérifié)

- `id="create-name"` (pseudo, partagé) ✔  · `id="create-avatar-picker"` ✔
- `id="join-code"` (+ normalisation live `normalizeCodeInput`) ✔
- `id="lang-switcher"` (rendu par `renderLangSwitcher`, `setLang`) ✔
- `id="toast"` (`showToast`) ✔
- `onclick="createRoom()"` ✔ · `onclick="joinRoom()"` ✔
- avatar via `buildAvatarPicker('create-avatar-picker')` / `getAvatar(...)` ✔
- Tous les textes via `data-i18n` / `data-i18n-placeholder` (clés existantes +
  `home.slogan`, `home.or`).

**Changement app.js (contenu) :** `joinRoom()` et `room_joined` lisent désormais
le pseudo `#create-name` et l'avatar `create-avatar-picker` (partagés avec la
création) au lieu des anciens `#join-name` / `join-avatar-picker` (qui vivaient
dans une modale supprimée). Un fallback `|| #join-name` est conservé par
sécurité. Aucun autre fichier ne référençait ces ids (vérifié par recherche).
`createRoom()`, la normalisation du code, les events socket : inchangés.

## Structure de la scène (`index.html`)

`.home-stage.stage-bg` (cadre TV doré, arrondi, plein écran) →
2 `.spot` (dérive ~7–8 s) · `.home-topbar` (#lang-switcher) ·
`.home-content` (logo or `SquizzGame` + flottement 4 s, slogan, `.panel` :
pseudo + avatar + bouton **Créer une partie** bleu, « ou », champ **code** +
bouton **Rejoindre** or) · `.home-floor` (sol perspective, liseré or) ·
liens légaux · 2 `.curtain` (l/r) qui s'ouvrent au chargement.

## Checklist de test

- [ ] **Accueil** : au chargement, les **rideaux rouges s'écartent** (~0,9 s)
      puis ne bloquent rien (pointer-events:none).
- [ ] **Logo** doré `SquizzGame` (flottement léger), slogan visible, pas
      d'ampoules.
- [ ] **Langue FR/EN/ES** : les pastilles en haut à droite changent toute la
      page (slogan, libellés, placeholders) ; active = dorée.
- [ ] **Créer une partie** : saisir un pseudo + choisir un avatar → bouton bleu
      → lobby (toast « partie créée », redirection).
- [ ] **Rejoindre** : pseudo + code (maj/normalisation auto) → bouton or →
      lobby. Sans pseudo/sans code → toast d'erreur traduit.
- [ ] **Mobile ≤ 380px** : logo plus petit, panneau pleine largeur, champ code
      + bouton empilés, rien ne déborde, tout cliquable.
- [ ] **prefers-reduced-motion** : rideaux déjà ouverts, pas de flottement/dérive.
- [ ] **Reste du site intact** : `/lobby.html`, `/game.html`, `/admin`, pages
      légales se chargent et fonctionnent comme avant (refonte à venir).
- [ ] Police **Fredoka** chargée (pas de dépendance Google Fonts), aucun blocage
      CSP.

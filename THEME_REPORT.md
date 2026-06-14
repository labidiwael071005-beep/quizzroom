# Rapport — Refonte visuelle « plateau de jeu télévisé »

Re-skin **purement visuel** de SquizzGame : velours rouge, or, spotlights,
ampoules de marquee, fond de théâtre sombre, titres en serif dorée. Aucune
logique JS, aucun `id`/classe ciblé par le JS, aucun `data-i18n` modifié — tout
est additif ou limité aux valeurs CSS.

## Fichiers créés

| Fichier | Rôle |
|---------|------|
| `public/css/theme.css` | Source unique des design tokens + décor de scène + rideaux + base typographique. Chargé **avant** les autres CSS sur toutes les pages. |
| `public/js/theme.js` | Injecteur additif du décor (spotlights/marquee) et des rideaux d'ouverture. Ne touche à aucune logique de jeu. |
| `public/fonts/cinzel-400.woff2`, `cinzel-700.woff2`, `Cinzel-OFL.txt` | Police d'affichage **Cinzel** (SIL OFL 1.1) auto-hébergée (titres). |

## Fichiers modifiés

- **HTML** (`index`, `lobby`, `game`, `admin`, 4 pages légales) : ajout du
  `<link rel="stylesheet" href="…/theme.css">` **avant** les autres CSS, et du
  `<script defer src="…/theme.js">` (sauf admin). **Purement additif** (15
  insertions, 0 suppression ; nombre de `data-i18n` inchangé).
- **`public/css/style.css`** : `:root` ne redéclare plus les tokens (centralisés
  dans theme.css) ; re-skin des boutons (or/velours, contraste, focus), nav,
  modal, toast, bannière cookies, cartes, inputs, sélecteur de langue.
- **`public/css/game.css`** : section « THEATRE POLISH » en fin de fichier — HUD
  scoreboard, carte de question (cadre doré/velours), options A/B/C/D, chiffres
  dorés, bouton hôte, modal de signalement.
- **`public/css/lobby.css`** : section « THEATRE POLISH » — cartes, code
  d'invitation doré, pickers/équipes dorés, chat.

> CSP : `style-src 'self'` et `font-src 'self'` étaient **déjà** autorisés par
> Helmet (`server/index.js`) — aucune modification nécessaire. Vérifié : la
> page, `theme.css`, `theme.js` et les `.woff2` répondent **200** sans blocage.

## Variables du thème (`theme.css :root`)

```
Fond théâtre : --stage-bg #0c0709 ; --stage-bg-2 #160d11
Velours      : --velvet #7a0b16 ; --velvet-deep #4a070e ; --velvet-light #a51c28
Or           : --gold #d4af37 ; --gold-light #f4e3a1 ; --gold-dark #9a7d23
Spotlight    : --spot rgba(255,246,224,0.16)
Texte        : --text #f6ecd6 (crème) ; --text-dim #c9bda3
Glow/ombres  : --glow-gold, --glow-gold-strong, --shadow-soft, --shadow-deep
Dégradés     : --gold-grad, --velvet-grad
Polices      : --font-display 'Cinzel' (titres) ; --font (sans-serif, corps)
```

L'ancienne palette est **remappée** vers le thème pour re-skinner tout
l'existant sans renommer une seule classe : `--orange → or`, `--purple →
velours`, `--bg → fond scène`, `--surface`/`--border`/`--text*` → tons chauds.

## Où se trouvent les éléments de décor

- **Fond + vignettage** : calque `.theatre-decor` (fixe, `z-index:-1`,
  `pointer-events:none`) injecté par `theme.js` en 1ᵉʳ enfant du `<body>`.
- **Spotlights** : `.theatre-spot--1/2` — grands halos `radial-gradient` en
  `mix-blend-mode:screen`, dérive lente via `transform` (GPU), 34 s / 44 s.
- **Marquee** : `.theatre-marquee` — rangée d'ampoules dorées en haut, pulse
  doux du glow.
- **Page de jeu** : variante `.theatre-decor--dim` (spots atténués **et
  statiques**, marquee discret) pour ne pas distraire ni coûter en perfs.
- **Rideaux** : `.theatre-curtains` (2 panneaux velours + liseré doré) injectés
  **sur l'accueil uniquement**, s'écartent ~1 s puis sont **retirés du DOM**
  (`transitionend` + filet `setTimeout`), `pointer-events:none`, **1× par
  session** (`sessionStorage 'qr_curtains_shown'`).

## Accessibilité & perfs

- `prefers-reduced-motion: reduce` : règle globale qui coupe animations/
  transitions ; les rideaux ne sont **pas** injectés (contenu visible direct).
- Animations en `transform`/`opacity` (compositing GPU) ; décor de jeu statique.
- Décor toujours `pointer-events:none` et derrière le contenu → ne bloque jamais
  les clics ni la lisibilité (texte crème sur fond sombre, contrastes renforcés).
- `≤ 380px` : marquee allégé, 2ᵉ spotlight masqué, rien ne déborde.

## Checklist de test

1. **Accueil** (`index.html`) : au chargement, les **rideaux de velours
   s'écartent** (~1 s) puis disparaissent ; recharger dans la même session ne
   les rejoue pas. La page est dorée/velours, titres en serif.
2. **Lobby** : cartes dorées, code d'invitation doré, chat/joueurs harmonisés ;
   entrée immédiate (pas de rideaux). Tout reste cliquable.
3. **Partie** : décor **discret** (spots atténués statiques), HUD scoreboard
   doré, **carte de question lisible** (cadre doré/velours, options A/B/C/D),
   bonne réponse en vert / mauvaise en rouge conservées. Jouable de bout en bout.
4. **Mobile ≤ 380px** : rien ne déborde, décor allégé, boutons cliquables.
5. **`prefers-reduced-motion`** : aucun spotlight/rideau/pulse ; contenu direct.
6. **Non-régression** : `id`/classes JS et `data-i18n` inchangés (vérifié :
   diffs HTML 100 % additifs) ; multijoueur, i18n FR/EN/ES, admin, signalements
   intacts ; assets servis en 200, CSP OK.

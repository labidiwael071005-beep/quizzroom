# SquizzGame — 3 correctifs écran de jeu

Trois ajustements sur l'écran de jeu (thème « plateau TV » bleu/rouge/or), sans
toucher à la logique (multijoueur, multilingue, validation des réponses, timer,
rideaux à chaque question, signalement).

## Fichiers modifiés
- `public/css/game.css` (les 3 phases)
- `public/js/game.js` (Phase 2 : masquage carte pendant transition ; Phase 3 :
  taille d'avatar adaptative)

Aucun id/classe lu par le JS, ni `data-i18n`, n'a été renommé/supprimé.

---

## Phase 1 — Score des joueurs lisible

**Problème :** dans la barre des joueurs, le score s'affichait en **texte doré
sur pastille dorée** → illisible.

**Cause :** un reste de l'ancien thème —
`.av-player-score { color: var(--gold-light) !important; }` — dont le
`!important` écrasait la règle de la refonte.

**Correctif :** suppression de cette surcharge. La pastille du score joueur
utilise désormais **exactement** le même style que la pastille du récap de fin
de partie (`.score-pts` / `.team-score-pts`) :
`color:#5a3a00` (texte foncé) sur `background:var(--gold-grad)` + `box-shadow`.
Le ★ du joueur courant reste en nom crème lisible (inchangé).

**Cible visuelle :** pastille dorée pleine + chiffres foncés bien contrastés,
identique au podium du récap.

---

## Phase 2 — La carte géo ne passe plus par-dessus les rideaux

**Problème :** pendant la manche géo, la carte Leaflet restait au premier plan
par-dessus les rideaux lors des transitions (z-index Leaflet 400–800 > rideaux).

**Correctif (`game.css` + `game.js`) :**
- `.game-curtains` : `z-index 40 → 1000` (au-dessus de toutes les couches
  Leaflet).
- `.geo-map { isolation:isolate }` : crée un contexte d'empilement qui **contient**
  toute la pile interne de Leaflet (panes, contrôles, markers) — leur ordre
  relatif est préservé (carte fonctionnelle), mais l'ensemble reste sous les
  rideaux.
- Anti-fuite pendant la fermeture : `runQuestionTransition` pose
  `#stage.curtains-busy` (carte `visibility:hidden`) le temps de la fermeture,
  retirée juste avant l'ouverture (la carte est alors révélée par les rideaux).
- Les rideaux restent `pointer-events:none` → aucun blocage de clic sur la carte
  une fois ouverts.

**Cycle vérifié :** question géo → question suivante / fin de manche → rideaux
ferment (carte masquée derrière) → contenu change → rideaux ouvrent → nouvelle
carte (ou autre type) s'affiche proprement.

---

## Phase 3 — Joueurs en barre horizontale en haut (au lieu de la sidebar)

**Restructuration (CSS + petit ajustement JS) :**
- `.stage` passe de `grid 240px 1fr` à **flex colonne** : `#avatars-panel`
  devient une **barre horizontale** en haut de la scène ; `.stage-main` (TV)
  occupe toute la largeur → zone centrale plus large et aérée.
- Chaque joueur conserve **avatar + pseudo + statut + score** (mêmes ids/classes ;
  l'indicateur ✓/✗ reste sur l'avatar via `.av-status-badge`, plus le texte de
  statut). Les animations « répond / juste / faux » (contour, glow) restent
  visibles.
- **Taille d'avatar adaptative** : `sizeAvatarBar(panel, n)` pose une variable
  CSS `--avatar-size` calculée à partir du **nombre de joueurs** (64px à 2 →
  32px à 8) **et** de la **largeur disponible** (réduction supplémentaire si
  étroit ; plancher 26px). Recalcul au `resize`. Tout (icône, pseudo, statut,
  badge, score) se dimensionne à partir de `--avatar-size`.
- **Pas de débordement / pas de scroll horizontal** : `overflow:hidden` +
  `flex` ; pseudo en `text-overflow:ellipsis`.
- **Mobile ≤480px** : barre dense, le texte de statut est masqué (le badge ✓/✗
  reste sur l'avatar), pseudo élidé ; aucun scroll horizontal.

Calculs vérifiés (footprint < largeur) :
`1200px → 2:64 4:53 6:43 8:32` · `360px → 2:64 4:53 6:40 8:26` (tient sans
débordement).

---

## Checklist de test

- [ ] **Score lisible** : en jeu, le score dans la barre des joueurs = pastille
      dorée à **texte foncé**, identique au récap de fin de partie.
- [ ] **Carte géo + rideaux** : jouer une manche géo, passer à la question
      suivante → la carte **ne dépasse jamais** des rideaux (fermeture +
      ouverture) ; la carte reste cliquable une fois ouverte ; validation
      lat/lng OK.
- [ ] **Barre joueurs adaptative** : tester à **2, 4, 6, 8** joueurs → avatars
      redimensionnés automatiquement, tous visibles, **aucun débordement**.
- [ ] **Mobile** (≤480px) : barre horizontale dense, pas de scroll horizontal,
      badge ✓/✗ visible.
- [ ] **Multijoueur** : statut « a répondu / juste / faux » + scores se mettent
      à jour pour tous.
- [ ] **Multilingue** : FR/EN/ES sur l'UI et les questions inchangé.
- [ ] **Non-régression** : timer en anneau, rideaux à chaque question,
      signalement, reconnexion — tout fonctionne comme avant.

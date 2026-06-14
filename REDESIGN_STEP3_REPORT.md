# Refonte visuelle SquizzGame — Étape 3/3 : l'écran de jeu

Écran de jeu refait façon **plateau TV** : fond bleu royal, question sur une
**TV à cadre doré** (ampoules), **rideaux rouges à chaque question**, **nouveau
timer en anneau** (remplace le sablier), score type scoreboard, en réutilisant
`theme.css`. **La logique de jeu n'a pas changé.**

## Fichiers modifiés

| Fichier | Action |
|---------|--------|
| `public/game.html` | scène (décor + body.game), TV/options (markup déjà en place), rideaux `#game-curtains`, timer remplacé par un anneau ; retrait theme.js/marble. |
| `public/css/game.css` | section « REDESIGN ÉTAPE 3 » ajoutée en fin de fichier (P1→P5), prime sur l'ancien style. |
| `public/js/game.js` | `new_question` → transition rideaux ; `startTimer`/`stopTimer` pilotent l'anneau. **Rien d'autre.** |

## Ce qui est PRÉSERVÉ (vérifié)

- **`localizeQuestion(data)`** : toujours appelée en tête de `displayQuestion`,
  `displayPixelQuestion`, `displayGeomapQuestion`, `displayPariQuestion` (avant
  tout affichage du texte/options/anecdote, fallback locale → fr → en). Échappement
  HTML (`escapeHtml`) intact, aucun innerHTML brut sur du contenu.
- **Validation des réponses** : inchangée — `submit_answer` par **index**
  (qcm/pixel/pari) et par **lat/lng** (géo). `submitAnswer`/`submitPixelAnswer`/
  `submitGeoAnswer` non modifiés.
- **Timer (logique)** : `startTimer(seconds, onExpire)` garde la durée envoyée par
  le serveur, le décompte 1 s, l'urgence ≤ 5 s et le callback d'expiration. Seul
  le **rendu** change (anneau au lieu du sablier). `#hourglass-wrap` et `#timer-num`
  conservés → tout le show/hide/déplacement (slot géo) reste valable.
- **Events socket** : `new_question`, `answer_result`, `question_reveal`,
  `geomap_reveal`, `pari_reveal`, `player_answered`, `scores_update`,
  `round_ended`, `round_started`, `round_intro`, `players_update`, `game_started`,
  `game_over`, `host_changed`, `awaiting_host`, `kicked`, `join_error` — inchangés.
- **Score / reconnexion** : `renderAvatarsPanel`, `updateAvatarScores`,
  `setAvatarStatus`, gestion hôte/`host-control` — inchangés.
- Tous les `data-i18n*` conservés ; `#lang-switcher` intact (restylé en pastilles).
  Locales fr/en/es identiques (205 clés).

## Détail par phase

1. **Décor + HUD** : `body.game` fond bleu `.stage-bg`, calque décor (projecteurs
   discrets + estrade dorée). HUD en bandeau scoreboard (manche en pastille
   dorée, progression dorée), scores avatars en pastilles dorées. theme.js/marble
   retirés (scène autogérée).
2. **La TV** : `qcm`/`pixel` sur une TV (cadre OR + liseré d'ampoules, écran
   clair `--panel`, texte `--ink`). Options A/B/C/D chunky (blanc/bordure or,
   pastille-lettre bleue) ; **sélectionné = bleu**, **correct = vert**, mauvais =
   rouge. Classes `.answer-btn/.selected/.correct/.wrong/.answer-letter` conservées.
3. **Rideaux par question** : `new_question` → ferme (~0,5 s) → échange le contenu
   → ouvre (~0,6 s). `pointer-events:none` (jamais bloquant) ; `reduced-motion`
   ou rideaux absents → échange instantané. OK 1ʳᵉ question & reconnexion (le
   contenu s'affiche toujours).
4. **Timer en anneau** : anneau circulaire autour des secondes, se vide en
   glissant (transition CSS 1 s linéaire), passe au **rouge + pulse** en fin de
   temps. Visuel uniquement.
5. **Géo / Pari / Révélation / Fin** : carte encadrée or (lat/lng intact), pari
   sur la TV dorée (mise intacte), bonne réponse en **vert**, scores/fin/récap
   cohérents, contrôle hôte chunky. Responsive ≤ 720 / ≤ 480, reduced-motion,
   projecteurs subtils (perf : animations transform/opacity).

## Checklist de test (partie complète à ≥ 2 joueurs)

- [ ] **Rideaux** à chaque nouvelle question (ferme→échange→ouvre), brefs, non
      bloquants ; options cliquables dès l'ouverture ; OK 1ʳᵉ question & reco.
- [ ] **TV lisible** : cadre doré + ampoules, texte net, image pixel dans l'écran.
- [ ] **Options** : survol, **sélection bleue**, **révélation verte** (bonne) /
      rouge (mauvaise sélection). Réponse validée correctement (score juste).
- [ ] **Timer** : anneau qui se vide, secondes correctes, passage au **rouge**
      + pulse sur la fin ; fin de temps gérée comme avant.
- [ ] **Géo** : placement sur la carte, validation, reveal (distance/points).
- [ ] **Pari** : slider de mise, « Miser et voir », réponse, gain/perte.
- [ ] **Multilingue** : FR/EN/ES sur la **question ET l'UI** (pastilles langue).
- [ ] **Score / scoreboard** : pastilles dorées à jour ; classement & récap OK.
- [ ] **Mobile (≤ 380px)** : TV, options, timer lisibles, rien ne déborde.
- [ ] **reduced-motion** : pas de rideaux animés, pas de pulse/dérive ; tout
      reste jouable.
- [ ] **Reconnexion** en pleine partie : la question s'affiche, timer/score OK.
- [ ] Accueil & lobby (étapes 1-2) toujours bons ; admin/legal intacts.

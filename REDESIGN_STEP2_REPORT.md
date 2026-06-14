# Refonte visuelle SquizzGame — Étape 2/3 : le lobby

Salon d'attente refait façon **plateau TV** : fond bleu royal, **velours rouge
en bordure + liseré or**, projecteurs, panneaux clairs, boutons chunky, police
Fredoka — en réutilisant `theme.css` (design system de l'étape 1). Toute la
logique (joueurs, chat, réglages, synchro socket, hôte/invité) est conservée.

## Fichiers modifiés

| Fichier | Action |
|---------|--------|
| `public/lobby.html` | restructuré : scène + 2 colonnes (joueurs+chat / réglages), contrôle unifié manches. |
| `public/css/lobby.css` | réécrit (bleu/rouge/or, panneaux clairs, chunky) en réutilisant les tokens theme.css. |
| `public/js/lobby.js` | contrôle « manches+questions » unifié, MAJ optimistes, réconciliation ciblée. |
| `public/locales/{fr,en,es}.json` | +`lobby.heading`, +`lobby.rounds.qtitle` (jeux de clés identiques, 205). |

> Aucune dépendance Google Fonts ; `theme.js`/`marble` retirés du lobby (scène
> autogérée). CSP inchangée (déjà `'self'`).

## Hooks JS / socket / i18n préservés (vérifié)

- **Joueurs** : `#players-list`, `#player-count`, `#empty-slots`, `updatePlayers`,
  classes `.player-item/.av-inline/.player-name/.player-you/.host-badge/`
  `.player-menu*/.player-team-badge/.player-waiting-label` + actions kebab
  (menu/promote/kick). La **couronne dorée hôte** = `.host-badge` repositionné.
- **Chat** : `#chat-messages`, `#chat-input` (Enter → `sendChat`), `sendChat`,
  `addChatMsg`, `.chat-msg/.chat-author/.chat-text`.
- **Code** : `#room-code`, `copyCode()`.
- **Réglages** : `.round-pick[data-round]`, `.theme-pick[data-theme]`,
  `.diff-pick-btn[data-diff]`, steppers `.qcount-btn`/`.qcount-val#qv-<r>`,
  `#team-toggle`/`.team-toggle-btn`/`setTeamMode`, `#team-config`/`#num-teams-val`/
  `changeNumTeams`/`#teams-display`/`renderTeams`/`joinTeam`.
- **Hôte/invité** : `#host-actions`, `#btn-start` (`startGame`), `.start-hint`,
  `#guest-waiting`, `.lobby-main.is-guest` (lecture seule invité).
- **Socket** : `lobby_sync`, `players_update`, `settings_updated`, `host_changed`,
  `game_started`, `chat_message`, `chat_blocked`, `rate_limited`, `kicked`,
  `player_left`, `start_blocked`, `update_settings`, `choose_team`,
  `kick_player`, `transfer_host`, `start_game`, `leave_game` — inchangés.
- **i18n** : tous les `data-i18n*` conservés ; sélecteur `#lang-switcher`
  (`renderLangSwitcher`/`setLang`) intact, restylé en pastilles.

## Nombre de questions PAR MANCHE (câblage de bout en bout)

Le contrôle a été **unifié** en une ligne par manche (les 4 toujours
affichées) : **chip activable + sélecteur +/−** propre à la manche ; quand la
manche est désactivée, son stepper est grisé/non cliquable (bornes **3–20**).

Chaîne complète (déjà par manche, conservée) :

1. **Lobby** (`lobby.js`) : `toggleRound(r)` → `settings.rounds` ;
   `changeQ(r, ±1)` → `settings.questionsPerRound[r]`. Puis `pushSettings()`.
2. **Réseau** : `socket.emit('update_settings', { code, settings:{…rounds,
   questionsPerRound,…} })`.
3. **Serveur** (`server/index.js`) : `update_settings` fusionne dans
   `room.settings` puis rediffuse `settings_updated` à tous.
4. **Plan de partie** : `buildRoundPlan(settings)` lit
   `settings.questionsPerRound[round]` → `qCount` par manche →
   `loadRoundQuestions` charge ce nombre → déroulé de la partie.

Aucune régression : le compteur est resté **par manche** (pas de compteur
global). Mêmes clés `settings`, mêmes events socket.

## Fluidité (fini le « rechargement »)

- **Optimistic update** : au clic (chip, +/−, segment, switch) l'UI change
  immédiatement en local, puis l'envoi serveur part en arrière-plan.
- **Réconciliation ciblée** : `settings_updated` met à jour les toggles/valeurs
  **existants** (`renderPickersState` → `applyRoundsUI`) sans jamais reconstruire
  le DOM (le contrôle des manches est statique : 4 manches toujours présentes).
- **Anti-écho** : pendant 700 ms après un clic, l'hôte n'applique pas l'écho
  serveur (sa vue optimiste fait foi) → plus de « saut » quand on clique vite.
  Les invités réconcilient toujours depuis le serveur (source de vérité).
- **Grille joueurs** : re-rendue seulement si elle a réellement changé
  (signature) → plus de flash de la liste lors d'un simple changement de réglage.
- Le serveur reste **autoritaire** ; seul l'hôte peut modifier (inchangé).

## Checklist de test (2 joueurs)

- [ ] Rejoindre un salon à 2 (hôte + invité) : avatars, noms, **couronne hôte**,
      compteur X/8 corrects.
- [ ] **Chat** : envoi (bouton + Entrée), réception côté autre joueur.
- [ ] **Manches** : (dés)activer une manche → stepper grisé quand off ; +/−
      change le nombre **par manche** (3–20).
- [ ] **+/− fluide** : cliquer vite, aucun délai ni clignotement ni retour arrière.
- [ ] **Synchro** : l'hôte change un réglage → l'invité voit la mise à jour en
      douceur ; l'invité ne peut rien modifier (cadenas, lecture seule).
- [ ] **Thèmes / Difficulté / Équipes** : sélection bleue, switch équipes OK,
      nb d'équipes +/−, rejoindre une équipe.
- [ ] **Lancer la partie** (hôte) → bascule en jeu pour tous.
- [ ] **FR/EN/ES** : pastilles de langue ; tout le lobby se traduit.
- [ ] **Mobile (≤600px)** : 1 colonne, rien ne déborde, tout cliquable.
- [ ] Le reste du site (accueil, jeu, admin) reste intact (jeu = étape 3).

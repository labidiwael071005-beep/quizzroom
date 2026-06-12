# Rapport i18n — Affichage multilingue (FR / EN / ES)

Objectif : rendre SquizzGame **entièrement jouable** en FR / EN / ES, côté
questions (selon la manche) **et** côté interface (lobby + jeu). Deux bugs
corrigés : (1) les questions ne suivaient la langue que sur la manche QCM, et
(2) la couverture i18n de l'interface était partielle (beaucoup de FR en dur).

Système i18n existant réutilisé : `public/js/i18n.js`
(`initI18n`, `t`, `setLang`, `getLang`, `applyTranslations`,
`renderLangSwitcher`, `pickQuestionTranslation`) + `public/locales/{fr,en,es}.json`.

---

## Partie 1 — Questions localisées sur TOUTES les manches

`localizeQuestion(data)` est désormais appelée **en tête de chaque fonction
d'affichage** (et non plus à un seul endroit). Chaque vue est ainsi
auto-suffisante : elle applique `translations[locale]` avec le fallback
existant **locale → fr → en → première dispo**.

| Manche            | Fonction               | Localisé |
|-------------------|------------------------|----------|
| Culture / QCM     | `displayQuestion`      | ✅ texte, options, (anecdote au reveal) |
| Pixel             | `displayPixelQuestion` | ✅ texte, options |
| Géo (geomap)      | `displayGeomapQuestion`| ✅ texte (+ label/country/anecdote au `geomap_reveal`) |
| Pari              | `displayPariQuestion`  | ✅ texte, options (réutilisées au `pari_reveal`) |

Champs réécrits par `localizeQuestion` : `question`, `options`, `explanation`,
`label`, `country`. Si une question n'a pas la langue demandée (vieille
question non migrée), on retombe sur le français — comportement attendu.

**Côté serveur (`server/index.js`) — déjà conforme, aucune modification
nécessaire** : `q.translations` est envoyé au client pour **tous** les types
de manches :
- `new_question` (émission principale, l.871) et la **resync** (l.1098) ;
- `question_reveal` (l.663) et `geomap_reveal` (l.644).

`pari_reveal` n'a pas besoin de renvoyer les traductions : le client réutilise
`currentQ.options`, déjà localisées à l'affichage de la question. La validation
des réponses reste **neutre (par index)** — inchangée.

---

## Partie 2 — Libellés FR en dur du JS sortis en i18n

### `public/js/game.js`
- **`ROUND_LABELS`** (constante figée) → helpers `roundLabel(roundName)` et
  `roundMeta(roundIndex, totalRounds, qCount)` **résolus à l'affichage** via
  `t()` (clés `game.round.culture|geo|pixel|pari`). `roundMeta` utilise
  `game.round.meta` avec variables `{n}/{total}/{count}/{questions}` et gère le
  pluriel (`game.round.question` / `game.round.questions`).
- **`AV_STATUS_LABELS`** → helper `avStatusLabel(status)` (clés
  `avatar.status.thinking|answered|correct|wrong|noanswer`).
- Libellés directs `hud-round` « Manche Pixel / GéoQuizz / Manche Pari » →
  `roundLabel('pixel'|'geo'|'pari')`.
- Hint carte + bouton « Valider ! », anecdote « Le savais-tu ? » par défaut,
  attente pari, contrôle hôte (libellé traduit côté client à partir des flags
  `isGameOver` / `isLastInRound` envoyés par le serveur), récap d'historique
  (« Question {n} », « Bonne réponse : », « pas de réponse », titre de
  signalement), toasts (nouvel hôte, exclusion, auto-submit géo) et la
  confirmation « Quitter la partie ».

### `public/js/lobby.js`
- Libellés de manches dans `buildQCountControls` (clé i18n résolue à
  l'affichage) ; liste des joueurs (« (toi) », « En attente du joueur »,
  « Hôte », menu « Léguer l'hôte / Exclure ») ; hint hôte / « En attente de :
  {names} » ; toasts (nouvel hôte, départ, exclusion, rate-limit, chat bloqué) ;
  confirmations (exclure / léguer l'hôte).

### `public/js/geo-round.js`
- « Envoyé ! », « Réponse envoyée — en attente des autres », « Sans réponse ».

### `public/js/i18n.js`
- `t(key, fallback, vars)` **interpole** les variables `{x}` (rétro-compatible :
  les appels sans `vars` sont inchangés). Vérifié sur EN :
  `Round 1/3 — 10 questions`, `Round 2/3 — 1 question` (pluriel OK).

Tout texte injecté reste **échappé** (`escapeHtml`) ; aucun `innerHTML` brut sur
des données joueur.

---

## Partie 3 — Couverture i18n du HTML (lobby + game)

`data-i18n` / `data-i18n-placeholder` / `data-i18n-title` ajoutés sur tous les
textes visibles encore en dur. Les libellés **avec icône** sont enveloppés dans
un `<span data-i18n>` pour ne pas écraser l'icône (`applyTranslations` pose
`textContent`).

- **`lobby.html`** : « Manches activées », boutons manches, « Thèmes
  (multi-sélection) », boutons thèmes, « Difficulté », boutons difficulté,
  « Nombre d'équipes », titre de page.
- **`game.html`** : intro (« PRÊTS ? » / « va commencer !! »), badges de manche
  (Pixel / GéoQuizz / Pari), placeholders question, bloc pari (« Tes points : »,
  « pts misés »), écran reveal (« Le savais-tu ? », « Bonne réponse »), écran
  résultat, gameover (« Voir le récap », « Retour au lobby »), récap
  (« Récap de la partie », « Retour au classement »), contrôle hôte,
  **modal de signalement complet** (titre, sous-titre, 4 catégories, label
  commentaire + « (optionnel) », placeholder, « Annuler », « Envoyer »,
  titre du bouton fermer), titre de page.

Comble aussi une clé pré-existante manquante : `modal.join.avatar`.

> Les placeholders posés ensuite par le JS (`hud-round` « Manche 1 »,
> `round-intro-name`, `q-theme`) restent volontairement non `data-i18n` : ils
> sont remplacés par `roundLabel()` dès le premier event socket.

---

## Partie 4 — Sélecteur de langue partout + application au chargement

- `#lang-switcher` ajouté dans le **nav du lobby** et le **HUD du jeu**.
  `renderLangSwitcher()` est appelé par `initI18n()`, déjà invoqué sur les deux
  pages. `setLang()` enregistre `localStorage 'qr_lang'`, recharge la locale,
  rappelle `applyTranslations()` + `renderLangSwitcher()`.
- Au chargement, **`lobby.html`** re-rend après `initI18n()` les zones générées
  par JS (manches, pickers, liste joueurs) pour qu'elles soient déjà dans la
  langue stockée sans attendre un event serveur.
- Conformément à la consigne : un changement de langue **en pleine partie** ne
  re-traduit pas instantanément le HUD/manche en cours (texte posé par JS) ;
  l'essentiel — **tout s'affiche dans la langue stockée au démarrage de chaque
  page** — est assuré.

---

## Clés i18n — état des locales

- Fichiers : `public/locales/{fr,en,es}.json`.
- **116 → 201 clés** (+85). FR sert de référence ; EN/ES traduits naturellement.
- ✅ **Les 3 fichiers ont EXACTEMENT le même jeu de clés** (201 chacun, aucune
  manquante ni en trop) — vérifié programmatiquement.
- ✅ **Toutes** les clés `data-i18n*` du HTML et tous les `t('clé')` du JS
  existent dans les locales (0 manquante).

Familles de clés ajoutées : `game.round.*`, `avatar.status.*`, `game.geo.*`,
`game.history.*`, `game.host.*`, `game.intro.*`, `game.reveal.*`,
`game.pari.yourpoints|betted|waiting`, `game.recap`, `game.backlobby`,
`game.loading`, `game.quit.title`, `lobby.rounds.title|themes.title|numteams`,
`lobby.you|menu.*|player.*|waitingfor|left*|confirm.*|chat.blocked|host`,
`round.pixel.short`, `round.pari.short`, `toast.nowhost|newhost|kicked|ratelimited`,
`report.*`, `page.{lobby,game}.title`, `modal.join.avatar`.

---

## Checklist de test

### Choisir EN sur l'accueil (`index.html`)
1. Cliquer 🇬🇧 EN dans le sélecteur de langue. La page d'accueil passe en anglais.
2. Créer une partie → **le lobby s'affiche en anglais** : « Active rounds »,
   « Themes (multi-select) », « Difficulty », « Number of teams », « Players »,
   « Chat », « Start game », noms de manches/thèmes/difficulté.
3. Lancer la partie → **le jeu s'affiche en anglais** : intro « READY? … is
   starting!! », « Round 1/3 — N questions », HUD, badges, boutons.
4. **Questions importées (avec traduction `en`)** → texte + options **en
   anglais** sur **chaque type de manche** : QCM, Pixel, Géo, Pari.
5. Reveal « Did you know? » + « Correct answer » + anecdote en anglais.
6. Une **vieille question sans `en`** retombe sur le français (attendu).
7. Modal de signalement (depuis le récap) entièrement en anglais.

### Idem en ES
- Sélectionner 🇪🇸 ES sur l'accueil → lobby et jeu en espagnol
  (« Rondas activas », « ¿LISTOS? … ¡va a empezar! », « Ronda 1/3 — N preguntas »,
  badges « Píxel / GeoQuiz / Apuesta »), questions importées (`es`) en espagnol
  sur chaque manche, reveal « ¿Sabías que? / Respuesta correcta ».

### Persistance & changement à chaud
- La langue est mémorisée (`localStorage 'qr_lang'`) : recharger le lobby ou le
  jeu conserve la langue choisie ; le `#lang-switcher` (nav lobby / HUD jeu)
  permet d'en changer hors de l'accueil et re-traduit immédiatement les éléments
  statiques `[data-i18n]`.

### Non-régression
- La **validation des réponses reste par index** (inchangée) : jouer en EN/ES ne
  change pas quelle réponse est correcte.
- `node --check` OK sur `i18n.js`, `game.js`, `lobby.js`, `geo-round.js` ;
  les 3 JSON parsent et ont des jeux de clés identiques.

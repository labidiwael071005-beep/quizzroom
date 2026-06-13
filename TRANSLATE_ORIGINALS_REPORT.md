# Rapport — Traduction EN + ES des 251 questions d'origine

Les 251 questions **d'origine** de SquizzGame n'existaient qu'en français ; les
200 questions importées d'Open Trivia DB étaient déjà trilingues. Objectif :
créer les traductions **EN** et **ES** des 251 originales (source = FR), sans
jamais toucher au FR, aux champs neutres, ni à la logique du jeu.

## Résultat

- **251 questions** traduites en EN **et** ES → **502 `QuestionTranslation`
  créées** (251 en + 251 es).
- Base après import : **fr = 451, en = 451, es = 451** (total 1353 traductions).
- Au prochain démarrage, le serveur affichera donc :
  `🌍 Traductions par langue : fr=451, en=451, es=451`.

### Répartition par type (251 questions)

| Type   | Questions |
|--------|-----------|
| qcm    | 215 |
| geo    | 26 |
| pixel  | 10 |
| **Total** | **251** |

## Démarche (3 phases, commits + push après chaque lot)

### Phase 1 — Export · `scripts/export-originals.js` (`npm run export:originals`)
Sélectionne les `Question` ayant déjà une traduction `fr` mais auxquelles il
manque `en` et/ou `es`, et écrit **`data/originals-fr.json`** :
`{ questionId, type, theme, missing:["en","es"], fr:{ text, options|null,
explanation, label|null, country|null } }`. Lecture seule. → 251 questions
exportées (215 qcm / 26 geo / 10 pixel).

### Phase 2 — Traduction FR → EN/ES (réalisée par Claude Code)
- Sortie cumulative **`data/originals-translated.json`**, format :
  `{ questionId, type, translations:{ en:{...}, es:{...} } }`.
- Procédé par **lots de ~25** ; après chaque lot : merge → commit → push
  (reprenable si la session s'interrompt). Helper `scripts/merge-originals-batch.js`
  (fichier de lot transitoire `data/_batch.json`, gitignoré).
- **Règle critique respectée : l'ordre des options est identique au FR dans
  toutes les langues.** `correctIndex` est partagé : un réordonnancement
  rendrait la bonne réponse fausse. Le merge **rejette** toute entrée dont la
  longueur d'options EN/ES diffère du FR (filet anti-erreur).
- `geo` : `label` et `country` traduits (ex. « Paris (Tour Eiffel) » → en
  « Paris (Eiffel Tower) » / es « París (Torre Eiffel) » ; « France » → en
  « France » / es « Francia »), `options` reste `null`.
- `pixel` : `text` + `options` + `explanation` (+ `label`) traduits comme un qcm.
- Champs FR vides laissés vides en EN/ES (ex. anecdotes absentes).
- Vérif finale du fichier : **251/251, 0 erreur**, longueurs d'options EN/ES ==
  FR pour tous les qcm/pixel, `label`/`country` présents pour tous les geo.

### Phase 3 — Import · `scripts/import-originals.js` (`npm run import:originals`)
Lit `data/originals-translated.json` et crée les `QuestionTranslation`
manquantes via la clé unique `@@unique([questionId, language])` :
- **idempotent / reprenable** — si `(questionId, language)` existe → skip ;
- ne modifie **jamais** la traduction `fr` ni les champs neutres de `Question`
  (`correctIndex`, `lat`, `lng`, `imageUrl`, …) ;
- garde-fou : longueur des options EN/ES revalidée == FR avant insertion.

Exécution contre Neon : **251 en + 251 es créées**. Relance à blanc :
**0 créée, 502 ignorées** (idempotence confirmée).

## Vérification automatique (post-import)

- `🌍` équivalent serveur (questions `approved`) : **fr=451, en=451, es=451**.
- **0** incohérence de longueur d'options EN/ES vs FR sur les 451 questions.
- Alignement `correctIndex` (la bonne réponse traduite reste à la même position) :
  - capitale de la France (`correctIndex=1`) : fr=`Paris` · en=`Paris` · es=`París` ✅
  - plus grand océan (`correctIndex=3`) : fr=`Pacifique` · en=`Pacific` · es=`Pacífico` ✅

## Checklist de test (en jeu)

1. **Accueil → choisir 🇬🇧 EN**, créer/rejoindre une partie, lancer le jeu.
2. Jouer sur **n'importe quel thème / difficulté**, sur les 4 types de manche
   (culture/QCM, pixel, géo, pari) :
   - les questions **d'origine** s'affichent désormais **en anglais** (texte,
     options, anecdote ; label/pays pour la géo) ;
   - l'**ordre des réponses** est correct et **la bonne réponse reste juste**
     (validation par index, inchangée) ;
   - l'écran « Did you know? » montre l'anecdote anglaise (ou rien si l'anecdote
     FR était vide — normal).
3. **Recommencer en 🇪🇸 ES** : mêmes contrôles, questions en espagnol.
4. Une question **OTDB** (déjà trilingue) reste correcte → pas de régression.

## Fichiers

- `scripts/export-originals.js`, `scripts/import-originals.js`,
  `scripts/merge-originals-batch.js`
- `data/originals-fr.json` (export), `data/originals-translated.json` (livrable)
- `package.json` : `export:originals`, `import:originals`

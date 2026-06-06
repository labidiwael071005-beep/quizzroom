# SquizzGame — Import Open Trivia DB + traductions FR/ES

Rapport de la mission d'import OTDB en 4 phases (toutes terminées, pushées
sur `master`, déployées sur Render). Chaque phase a fait l'objet d'un ou
plusieurs commits indépendants pour tester en réel après chaque étape.

## Vue d'ensemble

- **200 questions** récupérées depuis [Open Trivia Database](https://opentdb.com)
  (gratuit, sans clé, sous CC BY-SA 4.0), traduites par mes soins en français
  et en espagnol, puis insérées en base avec leurs 3 versions de langue.
- L'ordre des options est strictement identique dans les 3 langues
  (`correctIndex` partagé) — un joueur qui joue en EN, FR ou ES sur la même
  room voit la question dans SA langue mais valide la même réponse.
- Idempotence à tous les étages : on peut re-lancer `otdb:fetch`,
  `otdb:translate` et `otdb:seed` sans créer de doublons (clé
  `Question.sourceRef @unique`).
- État final base : **451 questions** (251 legacy FR + 200 OTDB tri-lingues),
  851 `QuestionTranslation`.

## Répartition par thème (200 nouvelles questions)

| Thème        | Nb |
| ------------ | -- |
| cinema       | 20 |
| general      | 20 |
| geographie   | 20 |
| histoire     | 40 (mythologie + WW2 / révolutions / antiquité) |
| musique      | 20 |
| nature       | 40 (corps humain, physique, biologie animale) |
| science      | 20 (maths) |
| tech         | 20 (informatique) |
| **Total**    | **200** |

La catégorie « art » a été demandée mais l'API OTDB a refusé toutes nos
requêtes la concernant (HTTP 429 persistant). Le script ré-lancé avec
`ONLY_CATS=25` permettra de la combler plus tard.

## Fichiers créés / modifiés

### Phase 1 — Récupération EN
- `scripts/otdb-fetch.js` — pull paginé OTDB, base64 decode, shuffle Fisher-Yates
  + `correctIndex`, token de session anti-doublons, rate-limit 5,5 s + retry 429,
  options `PER_CATEGORY` et `ONLY_CATS`.
- `data/otdb-staged.json` — 200 entrées EN (sourceRef SHA-256 16 hex, type,
  theme, difficulty, correctIndex, en.{text, options[4], explanation: ""}).
- `package.json` — script `otdb:fetch`.

### Phase 2 — Traductions FR + ES
- `scripts/otdb-translate.js` — merger compact `staged.json` + `tr.json` →
  `translated.json`. Reprenable : les entrées sans traduction sont juste
  comptées "en attente", jamais perdues.
- `data/otdb-tr.json` — mes traductions, dictionnaire compact
  `sourceRef → {fr: {text, options[4]}, es: {text, options[4]}}`.
- `data/otdb-translated.json` — deliverable (200 entrées × 3 langues).
- `package.json` — script `otdb:translate`.
- **4 commits** : 1 batch de 50 questions à chaque fois, avec push entre.

### Phase 3 — Seed en base
- `scripts/otdb-seed.js` — insert idempotent : pour chaque entrée,
  `findUnique({sourceRef}) ? skip : create({translations: { create: [3 langues] }})`.
  Validation de shape avant insert (3 langues × 4 options non vides).
- `package.json` — script `otdb:seed`.

### Phase 4 — Attribution
- `public/legal/attributions.html` — nouvelle section « Banque de questions »
  en tête de page avec lien OTDB + lien CC BY-SA 4.0.

## Endpoints / commandes ajoutés

| Commande              | Usage                                                              |
| --------------------- | ------------------------------------------------------------------ |
| `npm run otdb:fetch`  | Récupère ~200 questions OTDB → `data/otdb-staged.json`             |
| `npm run otdb:translate` | Génère/refresh `data/otdb-translated.json` depuis staged + tr |
| `npm run otdb:seed`   | Insère les questions traduites en base (Neon), idempotent          |

Variables d'env supportées par `otdb:fetch` :
- `PER_CATEGORY=N` — vise N questions par catégorie (défaut : 20).
- `ONLY_CATS=25,27` — ne récupère QUE ces catégories (mode merge avec staged).

## Pour relancer / agrandir le lot plus tard

```bash
# 1. Récupérer plus de questions (ex. la catégorie art qui était bloquée)
ONLY_CATS=25 PER_CATEGORY=20 npm run otdb:fetch

# 2. Traduire les nouvelles entrées (otdb-translate.js détecte les manquantes
#    automatiquement — il faut ajouter à la main les entrées dans data/otdb-tr.json
#    ou demander à Claude de le faire).
npm run otdb:translate

# 3. Seed (idempotent → ne réinsère pas les anciennes)
npm run otdb:seed

# 4. Push → Render redéploie → cache serveur rechargé
git add -A && git commit -m "feat(otdb): add art category" && git push
```

## Pièges contournés

- **Ordre des options strictement préservé en FR/ES** : c'est la règle critique.
  `correctIndex` est partagé entre les 3 langues. Si l'ordre change, la bonne
  réponse devient fausse. Vérifié par `otdb-translate.js` (alerte sur shape ≠ 4).
- **Noms propres conservés** : artistes, titres d'albums/chansons, noms de
  cités, marques (KFC, Bluetooth, NATO…) restent inchangés.
- **Mythologies traduites en orthographe locale** : Athéna/Atenea,
  Héphaïstos/Hefesto, Yggdrasil (commun aux 3 langues), Persephone → Perséphone/
  Perséfone, etc.
- **Termes techniques en sigles** : DNA/ADN, LASER, CSS, CPU, SSD, JVM, etc. —
  les sigles eux-mêmes restent (la question demande explicitement leur sens).
- **Football vs soccer** : la seule question avec ce piège est « premier sport
  joué sur la Lune » (golf). En anglais les options listent `Soccer` ET
  `Football` ; en FR/ES je les ai mappés en `Football / Fútbol` (= soccer) et
  `Football américain / Fútbol americano` pour rester non ambigu.
- **Tasmanian tiger** (extinction) : traduit « Tigre de Tasmanie / Tigre de
  Tasmania » — espèce, donc on traduit le nom commun.

## Checklist de tests manuels (à dérouler sur Render)

- [ ] **Démarrage serveur** : au boot, le log doit afficher
  `🌍 Traductions par langue : fr=451, en=200, es=200`.
- [ ] **Cache** : `📚 Cache : 415 QCM, 26 Géo, 10 Pixel` (415 = 215 legacy + 200
  OTDB).
- [ ] **Partie en FR** : créer une room en FR, lancer une manche « Culture G »
  ou « Science »/« Géo »/« Tech ». Au moins une question doit provenir d'OTDB
  (texte fluide en FR, options bien ordonnées). Vérifier qu'une bonne réponse
  est bien validée.
- [ ] **Partie en EN** : changer la langue en EN dans le lang-switcher, créer
  une partie. La question OTDB doit s'afficher en ANGLAIS (texte original
  d'OTDB). Cliquer la même réponse logique → validée.
- [ ] **Partie en ES** : pareil en espagnol. Le texte et les options doivent
  s'afficher en espagnol.
- [ ] **Mixed langs** : 2 joueurs dans une room, l'un en FR l'autre en ES.
  Chacun voit la question dans SA langue, mais en cliquant sur l'option à
  l'index N, ils valident la même bonne réponse.
- [ ] **Reveal anecdote** : à la fin de chaque question OTDB, le « Le savais-tu ? »
  est vide (les nouvelles questions n'ont pas d'explication) — c'est attendu.
- [ ] **Signalement** : sur le récap de fin de partie, le bouton drapeau
  fonctionne sur les nouvelles questions (lien `questionId` propagé).
- [ ] **Admin** : `/admin` → liste des questions affiche les 200 nouvelles
  (`source: OpenTriviaDB`).
- [ ] **Attribution** : ouvrir `/legal/attributions.html` → première section
  « Banque de questions » avec lien OTDB et licence CC BY-SA 4.0.

## Pourquoi ce design est sûr

- Aucun appel d'API externe en runtime — tout est en cache mémoire au boot.
- `sourceRef` unique = idempotence garantie côté DB.
- `correctIndex` jamais envoyé au client avant le reveal (inchangé depuis la
  mission précédente).
- Validation des réponses neutre en langue : QCM par index, géo par lat/lng.

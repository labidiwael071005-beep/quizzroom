# Admin SquizzGame — Tableau de bord + stats par question + restyle

Trois améliorations du back-office (`/admin`), sans toucher à l'auth ni casser
le CRUD existant. Outil interne → reste en **FR**, pas d'i18n.

## Fichiers modifiés
- `public/css/admin.css` — réécrit sur le thème (Phase 1).
- `server/index.js` — nouvel endpoint `/api/admin/stats/overview` (Phase 2),
  `/api/admin/questions` enrichi (Phase 3).
- `public/admin.html` — onglet + panneau dashboard, 2 nouveaux selects (stat/tri).
- `public/js/admin.js` — chargement/rendu du dashboard + colonnes/filtres stats.

Auth, endpoints existants, hooks JS (ids/classes, `switchTab`, modal, CRUD) :
**inchangés**. Le gate « rien sans token » est conservé (vérifié : 401 sans
Bearer sur `/api/admin/questions` et `/api/admin/stats/overview`).

## Phase 1 — Restyle thème
`admin.css` reprend `theme.css` (Fredoka, bleu royal, accents or, panneaux
`--panel` clairs pour login & modal). Boutons « chunky » à ombre pleine,
contraste garanti (fond + texte explicites) — obtenus en **restylant les classes
existantes** (`.btn-orange`, `.btn-ghost`, tailles) scopées sous `.admin-body`,
donc **aucun markup/JS à changer**. Selects/inputs sombres lisibles (les
`option` ont un fond sombre explicite). Sobre : **pas de rideaux/projecteurs**.
Login = carte claire centrée, logo or « SquizzGame — Admin ». Responsive
tablette paysage (≤900px → colonnes empilées).

## Phase 2 — Onglet « Tableau de bord » (par défaut)
**Endpoint** `GET /api/admin/stats/overview` (protégé `adminAuth`) :
```
totals    : questions, questionsApproved, translationsByLang{fr,en,es},
            gameSessions, reportsOpen, reportsTotal
breakdown : byType[], byDifficulty[], byTheme[]   (prisma.groupBy, triés desc)
recent    : gameSessions[5] (id, roomCode, startedAt, endedAt, playerCount),
            reports[5] (id, category, status, createdAt, questionExcerpt)
```
`playerCount` = longueur de `playerNames` (Json). Implémenté via
`prisma.question.count`, `questionTranslation.groupBy`, `question.groupBy`,
`gameSession.count/findMany`, `questionReport.count/findMany`.

**UI** : 4 KPI cards chunky (Questions totales · Sessions · Signalements ouverts ·
Signalements totaux, gros chiffres), 3 mini-cartes de répartition en **barres CSS
pures** proportionnelles (type / difficulté / langue) + une large par thème, et 2
listes « Activité récente » (dernières parties, derniers signalements). Bouton
**« Rafraîchir »** + **auto-refresh 30 s** tant que l'onglet dashboard est actif
(intervalle arrêté au logout). Onglet **par défaut** à la connexion. Pas de lib
externe.

Vérifié de bout en bout (login → overview) : totals corrects (451 questions,
trad fr/en/es=451…), byType `qcm 415 / geo 26 / pixel 10`, byDifficulty
`easy 250 / medium 159 / hard 42`, recent peuplé.

## Phase 3 — Stats par question
**Backend** `GET /api/admin/questions` :
- renvoie `timesShown`, `timesCorrect` (déjà présents) + **`successRate`** calculé
  = `timesShown>0 ? round(timesCorrect/timesShown*100) : null`.
- `?stat=` : `never` → `timesShown=0` (SQL) ; `hard` → ratio `<40%` &
  `timesShown>=5` ; `easy` → ratio `>=80%` & `timesShown>=5` (pré-filtre SQL
  `timesShown>=5` puis ratio en JS, le ratio n'étant pas triable/filtrable en
  SQL sans raw query).
- `?sort=` : `date` (createdAt desc, défaut), `freq` (timesShown desc),
  `rate` (par taux croissant, « jamais servie » en dernier — tri JS).

**Frontend** : colonnes **« Servie »** (timesShown) et **« Taux »** avec **code
couleur** :
| Cas | Couleur |
|-----|---------|
| jamais servie (null) | gris |
| ≥ 80 % | vert (peut-être trop facile) |
| 40–79 % | neutre |
| < 40 % | orange (trop dure / mal formulée) |
| < 15 % | rouge (à vérifier en priorité) |

Selects **« Statistique »** (Toutes / Jamais servies / Souvent ratées / Très
réussies) et **« Tri »** (date / taux / fréquence). Recherche libre client
conservée.

Vérifié : `stat=never` → 273 (tous `timesShown=0`), `stat=easy` → 2 (≥80 % & ≥5),
`stat=hard` → 0, `sort=freq` décroissant, `successRate` présent.

### ⚠️ Note sur `successRate` (à garder en tête)
`timesCorrect` compte **chaque bonne réponse de chaque joueur** (pas chaque
partie). Donc `successRate` est un **indicateur RELATIF** pour comparer les
questions entre elles (repérer les anormalement ratées/réussies), **pas une
vérité absolue** de difficulté. Le filtre exige `timesShown>=5` pour éviter le
bruit des petits échantillons.

## Checklist de test
- [ ] Connexion admin → arrive sur **Tableau de bord** avec KPI remplis,
      barres de répartition et activité récente.
- [ ] « Rafraîchir » met à jour ; auto-refresh 30 s pendant que l'onglet est
      affiché ; s'arrête au logout / changement d'onglet.
- [ ] Onglet **Questions** : colonnes **Servie** + **Taux** visibles, code
      couleur correct ; filtre **« Jamais servies »** ne montre que `timesShown=0` ;
      « Souvent ratées » / « Très réussies » cohérents ; tris date/taux/fréquence OK.
- [ ] **Aucun endpoint** `/api/admin/*` accessible sans token (401).
- [ ] **CRUD** questions (créer / éditer / supprimer) toujours OK ; signalements
      (résoudre / supprimer) OK ; badge « ouverts » à jour.
- [ ] Rendu lisible sur tablette paysage ; selects déroulants lisibles en sombre.

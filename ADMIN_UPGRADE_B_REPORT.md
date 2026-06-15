# Admin SquizzGame — Gestion enrichie des questions

Quatre améliorations du back-office (`/admin`) autour de la gestion des
questions : recherche multilingue, édition côte à côte FR/EN/ES, actions en
masse, pagination + tri + état dans l'URL. Outil **interne** (pour l'auteur) →
reste en **FR**, pas d'i18n côté admin.

**Règle d'or respectée** : `adminAuth` (Bearer token) conservé sur **tous** les
endpoints `/api/admin/*` (vérifié : 401 sans token). Aucun hook JS existant
cassé (ids/classes, `switchTab`, modal, CRUD, signalements inchangés). Toute
opération destructive ou en masse → confirmation explicite côté UI **et** log
serveur.

## Fichiers modifiés
- `server/index.js` — endpoints questions enrichis (cf. ci-dessous).
- `public/admin.html` — modal multilingue, barre d'actions en masse, en-têtes de
  tri, pagination, modal de confirmation « SUPPRIMER ».
- `public/js/admin.js` — recherche débouncée, surbrillance, modal 3 langues,
  sélection/actions en masse, pagination + tri + persistance URL.
- `public/css/admin.css` — surbrillance `.hl`, colonnes de langue, barre de masse,
  en-têtes de tri, pagination.

---

## Nouveaux endpoints (tous sous `adminAuth`)

| Méthode | Route | Rôle |
|--------|-------|------|
| `GET`  | `/api/admin/questions?q=…&page=&pageSize=&sort=&type=&theme=&difficulty=&stat=` | Liste filtrée/triée/paginée. |
| `GET`  | `/api/admin/questions/:id` | Une question + ses 3 traductions `{fr,en,es}` (null si absente). |
| `PUT`  | `/api/admin/questions/:id` | Mise à jour multilingue transactionnelle. |
| `POST` | `/api/admin/questions/bulk-status` | `{ids[], status}` → changement de statut en masse. |
| `POST` | `/api/admin/questions/bulk-delete` | `{ids[]}` → suppression en masse (cascade). |

### `GET /api/admin/questions` — recherche, tri, pagination
- **`q`** : recherche **insensible à la casse**, sur le texte de **toutes les
  langues** (`translations.some.text`), le label géo (`translations.some.label`)
  et le label legacy. Un terme présent **uniquement en EN** fait remonter la
  question (l'affichage FR ne change pas). Limite `take` réduite à 100 quand `q`
  est présent.
- **`sort`** : `date` (défaut, createdAt desc), `freq` (timesShown desc),
  `rate` (taux croissant, « jamais servie » en dernier — tri JS).
- **`stat`** : `never` / `hard` (<40 % & ≥5 servies) / `easy` (≥80 % & ≥5).
- **Pagination** : `page` (1-based) + `pageSize` (défaut 50, max 100). Le
  découpage se fait **après** les filtres/tri JS (hard/easy/rate) pour rester
  cohérent. Réponse : `{ ok, questions: [page], total, page, pageSize }` où
  `total` = nombre de résultats **après filtres** (pas seulement la page).

---

## Phase 1 — Recherche par mot-clé
UI : champ de recherche **débouncé (~300 ms)**, compteur de résultats mis à jour,
message vide explicite *« Aucune question ne contient ce terme. »*. Le terme est
**surligné en doré** dans les résultats — le texte est **échappé en HTML avant**
d'injecter `<mark class="hl">` (la regex du terme est elle aussi échappée), donc
pas d'injection possible. Compatible avec les autres filtres et le tri.

## Phase 2 — Édition multilingue côte à côte
**Structure du modal** (`#question-form`) :
- **En-tête méta** (`.meta-grid`) : `#f-type`, `#f-theme`, `#f-difficulty`,
  `#f-status` (selects, champs **neutres** partagés par les 3 langues).
- **`#correct-group`** : radios `name="f-correct"` (A/B/C/D) → `correctIndex`,
  **partagé** par les 3 langues.
- **`#f-pixel-group`** (image/crédit/licence) et **`#f-geo-group`** (lat/lng),
  affichés selon le type.
- **Onglets `#lang-tabs`** (FR/EN/ES) + **`.lang-cols`** : 3 colonnes
  `.lang-col[data-lang]`. ≥1100 px → 3 colonnes visibles ; en dessous → onglets
  (une colonne à la fois). Chaque colonne : `f-{lang}-text`, `f-{lang}-opt-0..3`,
  `f-{lang}-explanation`, et `f-{lang}-label`/`f-{lang}-country` (géo).
- **« Copier depuis FR »** sur EN et ES, **badge rouge « langue manquante »**
  (`#miss-{lang}` + onglet `.lang-miss`) tant qu'une trad est vide.

### ⚠️ Piège critique géré : `correctIndex` partagé
`correctIndex` est **commun aux 3 langues** → l'ordre des options doit rester
aligné. **Côté UI** : les options sont des champs **fixes A→D** (on ne peut pas
les réordonner ; on change la bonne réponse via le radio, pas l'ordre).
**Côté API** : validation de **longueur identique** du tableau d'options entre
langues + jamais de réordonnancement serveur.

### Validations des options (`validateQuestionPayload`)
Pour `qcm` / `pixel`, par langue **fournie** :
- exactement **4 options**, **non vides** (chaîne après `trim`) → sinon `400`.
- `correctIndex` **entier 0–3** → sinon `400`.
- **longueur identique** du tableau d'options entre toutes les langues fournies
  → sinon `400` avec message explicite.
- `geo` : pas d'options (mises à `null`).
- `PUT` exige au moins le **FR** (langue de référence / legacy aligné dessus).

`PUT` est **transactionnel** (`$transaction`) : update des champs neutres de la
question + `upsert` par langue (`@@unique([questionId, language])`). Vérifié :
options de longueurs différentes → `400`.

## Phase 3 — Actions en masse
- Colonne de **cases à cocher** + case **« Tout sélectionner (page) »**.
- **Barre d'actions** (`#bulk-bar`) visible dès ≥1 sélection : compteur
  *« X sélectionnées »*, select de statut (Approuvée/Brouillon/Rejetée),
  bouton **Supprimer** (rouge) et **Désélectionner**.
- **Suppression** → modal de confirmation exigeant de **taper « SUPPRIMER »**
  (`#confirm-ok` activé seulement si la saisie == `SUPPRIMER`).
- **Changement de statut** → simple confirmation.
- Backend : `sanitizeBulkIds`, **max 200 ids**, statut ∈ {approved, draft,
  rejected}. `updateMany` / `deleteMany` (atomiques, cascade sur traductions &
  signalements). `reloadQuestionStore()` après coup.

### Où sont les logs serveur ?
Pas de table d'audit (volontairement simple) → **logs `console.warn`** sur la
sortie standard du serveur, préfixés **`[ADMIN BULK]`** :
```
[ADMIN BULK] actor=admin action=status status=draft count=3 t=<ISO> ids=…
[ADMIN BULK] actor=admin action=delete count=3 t=<ISO> ids=…
```
Visibles dans le terminal qui exécute `node server/index.js` (ou les logs de la
plateforme d'hébergement).

## Phase 4 — Pagination, tri cliquable, état dans l'URL
- **Pagination** 50/page : boutons **Précédent / Suivant** + info
  **« 1–50 sur N »** (`#pager-info`). Boutons désactivés aux bornes ; le pager
  se masque s'il n'y a qu'une page. Si la page demandée dépasse le total (après
  changement de filtre), le front **recadre** sur la dernière page valide.
- **Tri cliquable** sur en-têtes (`#sort-head`) : **Date / Taux / Fréquence**,
  avec **flèche** indiquant le tri actif (▼ desc pour date/fréquence, ▲ asc pour
  taux). Remplace l'ancien select de tri (le param `sort` côté API est inchangé).
- **État dans l'URL** : type, thème, difficulté, stat, `q`, `sort`, `page` sont
  écrits dans la querystring (`history.replaceState`) et **restaurés au reload**
  (`readStateFromUrl`). Si l'URL porte un état « Questions », l'onglet Questions
  s'ouvre directement (lien partageable). Tout changement de filtre/recherche/
  tri **remet à la page 1**.

---

## Checklist de test
- [x] Recherche d'un terme présent **uniquement en EN** → la question remonte
      (vérifié `q=Tower` → 4 résultats).
- [ ] Édition des 3 traductions d'une question, sauvegarde, **réouverture** →
      les 3 langues sont bien rechargées.
- [x] Options de **longueurs différentes** entre langues → erreur **400**.
- [ ] **Changement de statut en masse** (confirmation simple) → statut mis à jour,
      log `[ADMIN BULK] action=status`.
- [ ] **Suppression en masse** avec saisie **« SUPPRIMER »** → suppression +
      cascade, log `[ADMIN BULK] action=delete`.
- [x] **Pagination** : « 1–50 sur N », page suivante/précédente, bornes
      désactivées (vérifié total=451, p1/p2 distinctes, page 10 = 1 item,
      page hors limite = liste vide).
- [x] **Tri** date/taux/fréquence avec pagination (vérifié `sort=freq` desc).
- [ ] **Filtres + recherche + tri + page reflétés dans l'URL** et restaurés
      après reload (lien partageable).
- [x] **Aucun endpoint** `/api/admin/*` accessible sans token (**401**).
- [ ] **Aucune régression** : tableau de bord, signalements, login, CRUD
      unitaire OK.

> Cases `[x]` : vérifiées automatiquement (API, en local). Cases `[ ]` :
> à confirmer visuellement dans le navigateur.

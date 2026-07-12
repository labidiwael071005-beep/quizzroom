# Rapport — Génération massive de questions QCM + Géo (FR/EN/ES)

Génération de questions **rédigées à la main** (par Claude Code), multilingues
(français, anglais, espagnol), idempotente et **reprenable par vagues**. Aucune
API externe : chaque question, ses 4 options et son anecdote sont écrits dans les
trois langues, avec le même `correctIndex` partagé (ordre des options identique
entre langues).

## 1. Ce qui a été mis en place

| Élément | Rôle |
|---|---|
| `scripts/lib/qhash.js` | Calcule le `sourceRef` = SHA-256 (16 car.) **stable de la version FR** (QCM : texte + options ; Géo : texte). Source de vérité unique du dédoublonnage. |
| `data/generated-qcm/lotNN.json` | Lots de ~40 QCM. |
| `data/generated-geo/lotNN.json` | Lots de ~30 questions géo « anecdote ». |
| `scripts/stamp-lots.js` (`npm run stamp:lots`) | Injecte/rafraîchit le `sourceRef` dans chaque lot et **détecte les doublons stricts FR**. |
| `scripts/seed-generated.js` (`npm run seed:generated`) | Insertion **idempotente** : valide la forme, saute les `sourceRef` déjà en base, crée sinon la `Question` + ses 3 `QuestionTranslation`. |
| `scripts/check-questions.js` (`npm run check:questions`) | Contrôle qualité : répartition, matrice thème × difficulté, repérage des trous, alertes cohérence. |

### Garanties
- **Idempotent** : `sourceRef` est `@unique`. Relancer `seed:generated` n'insère
  jamais de doublon (vérifié : 2ᵉ passage → *0 créées, 40 ignorées*).
- **Reprenable** : chaque lot est indépendant ; une session interrompue reprend
  au lot suivant. Les `sourceRef` déjà présents sont ignorés.
- **Ordre des options** : identique dans les 3 langues ; `correctIndex` partagé
  (jamais réordonné entre langues). `correctIndex` réparti sur les 4 positions.
- **Pas de doublon sémantique** : sujets réellement variés, vérifiés à la main.
- **Géo « anecdote »** : chaque question part d'un fait/événement rattaché à un
  lieu (coordonnées `lat/lng`), **sans jamais nommer le lieu-réponse** dans
  l'énoncé, et **rattachée à un thème** (histoire, art, sport, science…) pour un
  futur filtrage par thème.

## 2. État actuel (vagues en cours)

- **Questions générées et insérées : 686** (10 lots QCM = 464 + 8 lots Géo = 222).
- **Total en base : 1137** questions (les ~451 préexistantes sont conservées).
- **Traductions équilibrées** : `fr = en = es = 1137`.
- **Difficultés équilibrées** : easy = **442**, medium = 422, hard = 273 (≈ 39/37/24 %).
- **Type géo** : 26 → **267** (toutes les nouvelles géo sont « anecdote » et thématisées).
- **Thèmes faibles renforcés** (lots 08-10 + géo 06-08) : litterature 42→71, art 46→69,
  gastronomie 46→74, tech 58→73.
- **Correction** : la géo `b6966ed6c0054551` (pyramides de Gizeh) demandait une capitale
  mais avait pour label « Gizeh » → corrigée en **Le Caire** (30.0444, 31.2357) dans le
  lot ET en base (script ponctuel `scripts/fix-cairo-label.js`, le hash géo ne dépendant
  que du texte FR, le sourceRef est inchangé).

Lots produits à ce jour : `generated-qcm/lot01-10.json`, `generated-geo/lot01-08.json`.

Répartition thème × difficulté (source `check:questions`, base complète) :

```
theme             easy  medium    hard     total
art                 13      28      28        69
cinema              40      21      15        76
gastronomie         27      26      21        74
general             48      20      16        84
geo                  0      26       0        26   ← thème legacy des 26 anciennes géo (medium)
geographie          62      47      21       130
histoire            45      64      34       143
litterature         17      30      24        71
musique             37      25      21        83
nature              50      50      18       118
science             43      35      33       111
sport               26      30      23        79
tech                34      20      19        73
```

Note : le thème `geo` (easy/hard à 0) correspond aux 26 **anciennes** questions
géo, toutes en `medium`. Les **nouvelles** géo sont thématisées par sujet
(histoire, art, sport, science, geographie, nature, litterature), donc elles
alimentent ces thèmes-là, pas le bucket legacy `geo`. Ce n'est pas un manque.

## 3. Comment ajouter d'autres vagues (reprise)

1. Créer un nouveau lot : `data/generated-qcm/lot03.json` (ou `generated-geo/lotNN.json`),
   au même format (voir lots existants). Le `sourceRef` peut être **omis**.
2. `npm run stamp:lots` → calcule les `sourceRef` et signale tout doublon strict.
3. `npm run seed:generated` → insère uniquement les nouveautés (le reste est ignoré).
4. `npm run check:questions` → vérifie la répartition et les trous.
5. `git add -A && git commit && git push`.

Instruction de reprise type : *« continue la génération de nouveaux lots QCM/Géo
dans `data/generated-*`, en évitant les `sourceRef` déjà présents, puis relance
`seed:generated` »*. Le système est conçu pour ça : aucun doublon possible grâce
au `sourceRef`.

## 4. Priorités restantes pour les prochaines vagues

Pour atteindre la cible (~1500–2000 nouvelles ; on en est à 686), continuer :
- thèmes désormais bien équilibrés (69-143 chacun hors legacy `geo`) — répartir
  uniformément, avec un léger plus pour **art**, **litterature**, **tech**, **cinema** ;
- garder l'équilibre easy/medium/hard atteint (≈ 39/37/24 %) ;
- reprendre à **lot11** (QCM) et **lot09** (Géo) ; relire les lots existants avant
  rédaction pour éviter tout doublon sémantique (sujets ET lieux-réponses déjà utilisés —
  attention notamment aux réutilisations pays/ville : ex. Kingston puis Jamaïque).

## 5. Vérification au redémarrage

Au boot du serveur, le log doit afficher une hausse cohérente :
`🌍 Traductions par langue : fr=561, en=561, es=561` (et croissant à chaque vague).

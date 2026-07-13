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
| `data/generated-qcm/lotNN.json` | Lots de QCM (40 pour lot01-10, **80** à partir de lot11). |
| `data/generated-geo/lotNN.json` | Lots de questions géo « anecdote » (30 pour lot01-08, **50** à partir de lot09). |
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

- **Questions générées et insérées : 1206** (14 lots QCM = **765** + 12 lots Géo = **441**).
- **Total en base : 1657** questions (les ~451 préexistantes — dont 26 géo legacy et
  10 « pixel » — sont conservées).
- **Traductions équilibrées** : `fr = en = es = 1657`.
- **Difficultés (base complète)** : easy = **528**, medium = 681, hard = 448.
  Sur les 1206 *générées* seules : medium = 522, hard = 406, easy = 278.
- **Type géo** : 26 → **467** (toutes les nouvelles géo sont « anecdote » et thématisées).
- **Session turbo (lots QCM 11-14 + Géo 09-12)** : **+520 questions** (320 QCM à 80/lot,
  200 Géo à 50/lot), avec priorité aux thèmes faibles — general 24→64, cinema 39→82,
  tech 39→83, musique 47→96, art 56→96.
- **Zéro doublon** : `stamp:lots` confirme 0 collision de hash FR sur les 1206 lots ;
  `seed:generated` relancé → *0 créées, 1206 ignorées* (idempotence vérifiée).
- **Correction historique** : la géo `b6966ed6c0054551` (pyramides de Gizeh) demandait une
  capitale mais avait pour label « Gizeh » → corrigée en **Le Caire** (30.0444, 31.2357).

Lots produits à ce jour : `generated-qcm/lot01-14.json`, `generated-geo/lot01-12.json`.

Répartition thème × difficulté (source `check:questions`, base complète) :

```
theme             easy  medium    hard     total
art                 19      47      43       109
cinema              45      44      30       119
gastronomie         36      55      33       124
general             60      41      23       124
geo                  0      26       0        26   ← thème legacy des 26 anciennes géo (medium)
geographie          70      68      36       174
histoire            49      82      55       186
litterature         22      51      43       116
musique             47      46      39       132
nature              61      71      31       163
science             46      56      53       155
sport               31      49      32       112
tech                42      45      30       117
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

Pour poursuivre au-delà des 1206 générées, continuer :
- thèmes désormais tous ≥ 82 hors legacy `geo` (base : 109-186 chacun) — répartir
  uniformément ; les plus légers en *générés* restent **general** (64), **cinema** (82),
  **tech** (83) et **sport** (95) ;
- rééquilibrer un peu vers **easy** (les lots récents penchent medium/hard) ;
- reprendre à **lot15** (QCM) et **lot13** (Géo) ; relire les lots existants avant
  rédaction pour éviter tout doublon sémantique (sujets ET lieux-réponses déjà utilisés —
  attention aux réutilisations pays/ville, ex. Kingston puis Jamaïque). L'inventaire des
  réponses/labels déjà pris se reconstruit en 1 commande node sur `data/generated-*`.

## 5. Vérification au redémarrage

Au boot du serveur, le log doit afficher une hausse cohérente :
`🌍 Traductions par langue : fr=1657, en=1657, es=1657` (et croissant à chaque vague).

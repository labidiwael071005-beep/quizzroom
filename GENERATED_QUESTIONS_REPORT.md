# Rapport — Génération massive de questions QCM + Géo (FR/EN/ES)

> ✅ **BANQUE DE QUESTIONS FINALISÉE.** 1726 questions générées à la main
> (1085 QCM + 641 Géo), insérées en base (2177 questions au total, dont 451
> préexistantes). Zéro doublon, zéro erreur de forme, traductions FR/EN/ES
> équilibrées. La génération par vagues est terminée ; le système reste
> reprenable si l'on souhaite en ajouter d'autres.

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

## 2. État final (banque finalisée)

- **Questions générées et insérées : 1726** (18 lots QCM = **1085** + 16 lots Géo = **641**).
- **Total en base : 2177** questions (les ~451 préexistantes — dont 26 géo legacy et
  10 « pixel » — sont conservées).
- **Traductions équilibrées** : `fr = en = es = 2177` (soit **6531** traductions).
- **Difficultés (base complète)** : easy = **623**, medium = 890, hard = 664.
  Sur les 1726 *générées* seules : medium = 731, hard = 622, easy = 373.
- **Type géo** : 26 → **667** (toutes les nouvelles géo sont « anecdote » et thématisées).
- **Trois vagues successives** de +520 questions chacune :
  - Vague 1 (QCM lot01-10 + Géo lot01-08) : 686 questions.
  - Vague 2 « turbo » (QCM lot11-14 + Géo lot09-12) : +520.
  - Vague 3 « finale » (QCM lot15-18 + Géo lot13-16) : +520, avec rééquilibrage vers
    les thèmes faibles (general, cinema, tech, sport, musique, art) et davantage d'`easy`.
- **Zéro doublon** : `stamp:lots` confirme 0 collision de hash FR sur les 1726 lots ;
  `seed:generated` relancé → *0 créées, 1726 ignorées* (idempotence vérifiée). Les seuls
  labels géo répétés (« Paris », « Waterloo ») portent sur des faits distincts ou des
  villes homonymes de pays différents — aucun doublon réel.
- **Correction historique** : la géo `b6966ed6c0054551` (pyramides de Gizeh) demandait une
  capitale mais avait pour label « Gizeh » → corrigée en **Le Caire** (30.0444, 31.2357).

Lots produits : `generated-qcm/lot01-18.json`, `generated-geo/lot01-16.json`.

Répartition thème × difficulté (source `check:questions`, base complète) :

```
theme             easy  medium    hard     total
art                 26      69      62       157
cinema              56      67      52       175
gastronomie         40      69      40       149
general             79      67      34       180
geo                  0      26       0        26   ← thème legacy des 26 anciennes géo (medium)
geographie          72      82      52       206
histoire            51      88      79       218
litterature         25      59      59       143
musique             57      65      60       182
nature              66      85      46       197
science             50      66      72       188
sport               42      81      50       173
tech                59      66      58       183
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

## 4. Banque finalisée — état d'équilibre

La banque est **complète et équilibrée** ; aucune vague n'est prévue. Répartition
des *générées* par thème (QCM + Géo) : general 120, art 144, nature 144, musique 146,
science 145, tech 149, sport 156, geographie 157, histoire 157, cinema 138, gastronomie 137,
litterature 133 — tous entre 120 et 157. Les thèmes jadis faibles ont été rattrapés :
general 24 → 120, cinema 39 → 138, tech 39 → 149, sport 79 → 156, musique 47 → 146,
art 56 → 144.

Si l'on souhaite néanmoins **reprendre** un jour :
- reprendre à **lot19** (QCM) et **lot17** (Géo) ;
- relire les lots existants pour éviter tout doublon sémantique (réponses QCM ET
  lieux-réponses géo déjà pris — l'inventaire se reconstruit en une commande node sur
  `data/generated-*`) ; attention aux réutilisations pays/ville ;
- rédiger, `npm run stamp:lots` (dédoublonnage strict), `npm run seed:generated`
  (insertion idempotente), `npm run check:questions`, puis `git commit && push`.

## 5. Vérification au redémarrage

Au boot du serveur, le log doit afficher :
`🌍 Traductions par langue : fr=2177, en=2177, es=2177` (stable, banque finalisée).

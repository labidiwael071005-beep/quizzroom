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

- **Questions générées et insérées : 606** (9 lots QCM = 414 + 7 lots Géo = 192).
- **Total en base : 1057** questions (les ~451 préexistantes sont conservées).
- **Traductions équilibrées** : `fr = en = es = 1057`.
- **Difficultés équilibrées** : easy = **423**, medium = 390, hard = 244 (≈ 40/37/23 %).
- **Type géo** : 26 → **237** (toutes les nouvelles géo sont « anecdote » et thématisées).
- **Thèmes faibles renforcés** (lots 08-09 + géo 06-07) : litterature 42→63, art 46→62,
  gastronomie 46→65.
- **Correction** : la géo `b6966ed6c0054551` (pyramides de Gizeh) demandait une capitale
  mais avait pour label « Gizeh » → corrigée en **Le Caire** (30.0444, 31.2357) dans le
  lot ET en base (script ponctuel `scripts/fix-cairo-label.js`, le hash géo ne dépendant
  que du texte FR, le sourceRef est inchangé).

Lots produits à ce jour : `generated-qcm/lot01-09.json`, `generated-geo/lot01-07.json`.

Répartition thème × difficulté (source `check:questions`, base complète) :

```
theme             easy  medium    hard     total
art                 12      25      25        62
cinema              39      19      14        72
gastronomie         24      23      18        65
general             46      20      15        81
geo                  0      26       0        26   ← thème legacy des 26 anciennes géo (medium)
geographie          60      42      19       121
histoire            43      60      31       134
litterature         15      27      21        63
musique             36      23      19        78
nature              49      47      16       112
science             42      33      30       105
sport               24      28      20        72
tech                33      17      16        66
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

Pour atteindre la cible (~1500–2000 nouvelles ; on en est à 606), continuer en renforçant :
- **art**, **litterature**, **gastronomie**, **tech** (thèmes les moins fournis : 62-66) ;
- garder l'équilibre easy/medium/hard atteint (≈ 40/37/23 %) ;
- reprendre à **lot10** (QCM) et **lot08** (Géo) ; relire les lots existants avant
  rédaction pour éviter tout doublon sémantique (sujets ET lieux-réponses déjà utilisés —
  attention notamment aux réutilisations pays/ville : ex. Kingston puis Jamaïque).

## 5. Vérification au redémarrage

Au boot du serveur, le log doit afficher une hausse cohérente :
`🌍 Traductions par langue : fr=561, en=561, es=561` (et croissant à chaque vague).

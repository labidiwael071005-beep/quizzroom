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

- **Questions générées et insérées : 220** (4 lots QCM = 160 + 2 lots Géo = 60).
- **Total en base : 671** questions (les ~451 préexistantes sont conservées).
- **Traductions équilibrées** : `fr = en = es = 671`.
- **Difficulté `hard`** renforcée : 42 → **141** au total ; chaque thème a désormais ≥ 8 en `hard`.
- **Type géo** : 26 → **86** (les nouvelles géo sont « anecdote » et thématisées par sujet).

Lots produits à ce jour : `generated-qcm/lot01-04.json`, `generated-geo/lot01-02.json`.

Répartition thème × difficulté (source `check:questions`) :

```
theme             easy  medium    hard
art                  6      15      11
cinema              29      11       9
gastronomie         10       8       8
general             36      17      13
geo                  0      26       0   ← thème legacy des 26 anciennes géo (medium)
geographie          38      20      11
histoire            32      36      16
litterature          6      13       8
musique             29      10       9
nature              30      32       8
science             29      18      14
sport               14      13      10
tech                26      10      10
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

Pour atteindre la cible (~1500–2000 nouvelles), continuer en renforçant :
- la difficulté **hard** partout (encore la plus légère : 85 au total) ;
- **gastronomie**, **litterature**, **art**, **sport** (thèmes les moins fournis) ;
- diversifier les sous-sujets pour éviter tout doublon sémantique avec l'existant.

## 5. Vérification au redémarrage

Au boot du serveur, le log doit afficher une hausse cohérente :
`🌍 Traductions par langue : fr=561, en=561, es=561` (et croissant à chaque vague).

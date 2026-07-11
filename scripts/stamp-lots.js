// scripts/stamp-lots.js
// Calcule et INJECTE le sourceRef (hash stable de la version FR) dans chaque
// question des lots data/generated-qcm/*.json et data/generated-geo/*.json.
//
// IDEMPOTENT : recalcule à chaque passage ; ne réécrit un fichier que s'il a
// changé. On peut donc rédiger les lots SANS sourceRef puis lancer ce script
// (npm run stamp:lots) pour les remplir. Repère aussi les collisions de hash
// (doublons stricts FR) au sein de l'ensemble des lots.
//
// L'objet est réécrit avec sourceRef en PREMIÈRE clé (format du cahier des
// charges), le reste des clés conservant leur ordre d'origine.

const fs   = require('fs');
const path = require('path');
const { refFor } = require('./lib/qhash');

const DIRS = [
  { dir: path.join(__dirname, '..', 'data', 'generated-qcm'), type: 'qcm' },
  { dir: path.join(__dirname, '..', 'data', 'generated-geo'), type: 'geo' },
];

let total = 0, updated = 0, dupWarn = 0;
const seen = new Map(); // sourceRef -> "file#index"

for (const { dir, type } of DIRS) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  for (const f of files) {
    const full = path.join(dir, f);
    let arr;
    try {
      arr = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      console.error(`❌ JSON invalide : ${f} — ${e.message}`);
      process.exitCode = 1;
      continue;
    }
    if (!Array.isArray(arr)) { console.error(`❌ ${f} : racine non-tableau`); process.exitCode = 1; continue; }

    let fileChanged = false;
    const out = arr.map((q, i) => {
      total++;
      const fr  = q.translations && q.translations.fr;
      const ref = refFor(q.type || type, fr);

      // Collision = même FR (texte + options) dans deux questions → doublon strict.
      const loc = `${f}#${i}`;
      if (seen.has(ref)) {
        console.warn(`⚠️  DOUBLON de hash ${ref} : ${loc} == ${seen.get(ref)}`);
        dupWarn++;
      } else {
        seen.set(ref, loc);
      }

      if (q.sourceRef !== ref) { updated++; fileChanged = true; }
      const { sourceRef: _drop, ...rest } = q;
      return { sourceRef: ref, ...rest };
    });

    if (fileChanged) fs.writeFileSync(full, JSON.stringify(out, null, 2) + '\n');
  }
}

console.log(`🔖 Stamp : ${total} questions parcourues, ${updated} sourceRef (ré)écrits.`);
if (dupWarn) console.log(`⚠️  ${dupWarn} collision(s) de hash (doublon strict FR) — à corriger.`);
else        console.log('✅ Aucun doublon strict FR détecté dans les lots.');

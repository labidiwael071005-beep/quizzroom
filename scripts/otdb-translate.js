// scripts/otdb-translate.js
// Merge data/otdb-staged.json (anglais) + data/otdb-tr.json (mes traductions
// FR/ES, indexées par sourceRef) → data/otdb-translated.json (deliverable
// Phase 2).
//
// Reprenable : seules les entrées présentes ET dans staged ET dans tr.json
// sont écrites. Les autres sont juste comptées en "en attente". Relancer
// le script ne crée jamais de doublon (sourceRef est la clé unique).
//
// Usage : node scripts/otdb-translate.js

const fs   = require('fs');
const path = require('path');

const STAGED = path.join(__dirname, '..', 'data', 'otdb-staged.json');
const TR     = path.join(__dirname, '..', 'data', 'otdb-tr.json');
const OUT    = path.join(__dirname, '..', 'data', 'otdb-translated.json');

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const staged = readJson(STAGED, []);
const trMap  = readJson(TR, {});

const out     = [];
const pending = [];

for (const q of staged) {
  const tr = trMap[q.sourceRef];
  if (!tr || !tr.fr || !tr.es) { pending.push(q.sourceRef); continue; }
  // Validation : options doivent avoir la même longueur (4) dans toutes les
  // langues — l'ordre est partagé via correctIndex.
  const lens = [
    q.en.options.length,
    Array.isArray(tr.fr.options) ? tr.fr.options.length : -1,
    Array.isArray(tr.es.options) ? tr.es.options.length : -1,
  ];
  if (lens.some(n => n !== 4)) {
    console.warn(`⚠️  ${q.sourceRef} : tailles d'options incohérentes ${JSON.stringify(lens)} — sautée`);
    continue;
  }
  out.push({
    sourceRef:    q.sourceRef,
    type:         q.type,
    theme:        q.theme,
    difficulty:   q.difficulty,
    correctIndex: q.correctIndex,
    translations: {
      en: { text: q.en.text,  options: q.en.options,  explanation: q.en.explanation || '' },
      fr: { text: tr.fr.text, options: tr.fr.options, explanation: tr.fr.explanation || '' },
      es: { text: tr.es.text, options: tr.es.options, explanation: tr.es.explanation || '' },
    },
  });
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

// Répartition par thème pour le suivi
const byTheme = {};
for (const q of out) byTheme[q.theme] = (byTheme[q.theme] || 0) + 1;

console.log(`✅ ${out.length} / ${staged.length} entrées traduites écrites dans ${path.relative(process.cwd(), OUT)}`);
console.log(`⏳ ${pending.length} encore en attente de traduction`);
console.log('   Par thème (traduit) :');
for (const [t, n] of Object.entries(byTheme).sort()) {
  console.log(`     ${t.padEnd(12)} ${n}`);
}

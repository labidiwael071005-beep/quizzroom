// scripts/export-originals.js
// Phase 1 — Export des questions D'ORIGINE à traduire.
//
// Cible : les Question qui possèdent déjà une traduction 'fr' mais à qui il
// manque 'en' ET/OU 'es' (essentiellement les 251 questions d'origine — les
// 200 importées d'Open Trivia DB sont déjà trilingues).
//
// Sortie : data/originals-fr.json — un tableau d'objets
//   { questionId, type, theme, missing: ['en','es'],
//     fr: { text, options|null, explanation, label|null, country|null } }
// La source de la traduction est TOUJOURS la version FR (QuestionTranslation.fr,
// avec fallback sur les colonnes legacy de Question si la ligne fr manquait).
//
// Lecture seule : ce script ne modifie rien en base.
//
// Usage : npm run export:originals

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const OUT       = path.join(__dirname, '..', 'data', 'originals-fr.json');
const TARGET    = ['en', 'es'];   // langues que l'on veut produire
const prisma    = new PrismaClient();

async function main() {
  const all = await prisma.question.findMany({
    select: {
      id:           true,
      type:         true,
      theme:        true,
      // Colonnes legacy : fallback ultime si la ligne fr n'existe pas.
      question:     true,
      options:      true,
      explanation:  true,
      label:        true,
      country:      true,
      translations: {
        select: { language: true, text: true, options: true, explanation: true, label: true, country: true },
      },
    },
  });

  console.log(`📚 ${all.length} questions inspectées`);

  const out     = [];
  const byType  = {};
  let noFr      = 0;
  let trilingue = 0;

  for (const q of all) {
    const langs = new Set(q.translations.map(t => t.language));

    // On ne traite QUE les questions disposant déjà du FR (source de vérité).
    if (!langs.has('fr')) { noFr++; continue; }

    // Langues manquantes parmi en/es.
    const missing = TARGET.filter(l => !langs.has(l));
    if (missing.length === 0) { trilingue++; continue; }

    // Source FR : la ligne QuestionTranslation 'fr' (sinon colonnes legacy).
    const fr = q.translations.find(t => t.language === 'fr') || {};
    const frData = {
      text:        fr.text        || q.question    || '',
      options:     fr.options     ?? q.options     ?? null,
      explanation: fr.explanation || q.explanation || '',
      label:       fr.label       ?? q.label       ?? null,
      country:     fr.country     ?? q.country     ?? null,
    };

    out.push({ questionId: q.id, type: q.type, theme: q.theme, missing, fr: frData });
    byType[q.type] = (byType[q.type] || 0) + 1;
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

  console.log('');
  console.log(`✅ ${out.length} questions exportées → ${path.relative(process.cwd(), OUT)}`);
  console.log('   Répartition par type :');
  for (const [t, n] of Object.entries(byType).sort()) {
    console.log(`     ${t.padEnd(8)} ${n}`);
  }
  console.log('');
  console.log(`ℹ️  Déjà trilingues (ignorées) : ${trilingue}`);
  console.log(`ℹ️  Sans FR (ignorées)         : ${noFr}`);
}

main()
  .catch((err) => { console.error('❌ Export error:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

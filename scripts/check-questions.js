// scripts/check-questions.js — Phase 4 : contrôle qualité de la base.
//
// Ne modifie RIEN. Lit la base et affiche :
//   - le total par type, par thème, par difficulté ;
//   - la matrice thème × difficulté (QCM) avec repérage des trous (cellules à 0) ;
//   - le nombre de traductions par langue (doit être ~égal entre fr/en/es) ;
//   - des alertes cohérence (QCM sans correctIndex, géo sans lat/lng, options ≠ 4,
//     question sans 3 traductions).
//
// Usage : npm run check:questions

const { PrismaClient } = require('@prisma/client');

const DIFFS  = ['easy', 'medium', 'hard'];
const LANGS  = ['fr', 'en', 'es'];

async function main() {
  const prisma = new PrismaClient();
  try {
    const total  = await prisma.question.count();
    const byType = await prisma.question.groupBy({ by: ['type'], _count: true });
    const byDiff = await prisma.question.groupBy({ by: ['difficulty'], _count: true });
    const trLang = await prisma.questionTranslation.groupBy({ by: ['language'], _count: true });
    const cells  = await prisma.question.groupBy({ by: ['theme', 'difficulty', 'type'], _count: true });

    const n = r => r._count._all ?? r._count;

    console.log(`\n===== CONTRÔLE QUALITÉ — ${total} questions =====\n`);
    console.log('Par type       :', byType.map(r => `${r.type}=${n(r)}`).join(', '));
    console.log('Par difficulté :', byDiff.map(r => `${r.difficulty}=${n(r)}`).join(', '));
    console.log('Traductions    :', trLang.map(r => `${r.language}=${n(r)}`).join(', '));

    // Matrice thème × difficulté (tous types confondus).
    const themes = [...new Set(cells.map(c => c.theme))].sort();
    const map = {}; // theme -> diff -> count
    for (const c of cells) {
      map[c.theme] ??= {};
      map[c.theme][c.difficulty] = (map[c.theme][c.difficulty] || 0) + n(c);
    }

    console.log('\n----- Matrice thème × difficulté -----');
    console.log('theme'.padEnd(14) + DIFFS.map(d => d.padStart(8)).join('') + '     total');
    const holes = [];
    for (const t of themes) {
      let line = t.padEnd(14);
      let tot = 0;
      for (const d of DIFFS) {
        const v = map[t]?.[d] || 0;
        tot += v;
        line += String(v).padStart(8);
        if (v === 0) holes.push(`${t}/${d}`);
      }
      console.log(line + String(tot).padStart(10));
    }

    console.log('\n----- Trous (thème/difficulté à 0) -----');
    console.log(holes.length ? holes.join(', ') : '✅ aucun trou : chaque thème couvre les 3 difficultés.');

    // Alertes cohérence.
    console.log('\n----- Alertes cohérence -----');
    const qcmNoIdx = await prisma.question.count({ where: { type: 'qcm', correctIndex: null } });
    const geoNoPos = await prisma.question.count({ where: { type: 'geo', OR: [{ lat: null }, { lng: null }] } });
    if (qcmNoIdx) console.log(`⚠️  ${qcmNoIdx} QCM sans correctIndex`); else console.log('✅ tous les QCM ont un correctIndex');
    if (geoNoPos) console.log(`⚠️  ${geoNoPos} géo sans lat/lng`); else console.log('✅ toutes les géo ont lat/lng');

    // Questions sans les 3 traductions.
    const all = await prisma.question.findMany({ select: { id: true, type: true, translations: { select: { language: true, options: true } } } });
    let missTr = 0, badOpts = 0;
    for (const q of all) {
      const langs = new Set(q.translations.map(t => t.language));
      if (!LANGS.every(l => langs.has(l))) missTr++;
      if (q.type === 'qcm') {
        for (const t of q.translations) {
          if (!Array.isArray(t.options) || t.options.length !== 4) { badOpts++; break; }
        }
      }
    }
    if (missTr)  console.log(`⚠️  ${missTr} question(s) sans les 3 langues`); else console.log('✅ toutes les questions ont fr/en/es');
    if (badOpts) console.log(`⚠️  ${badOpts} QCM avec des options ≠ 4 dans une langue`); else console.log('✅ tous les QCM ont 4 options dans chaque langue');
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error('❌', e); process.exit(1); });

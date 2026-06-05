// scripts/seed-questions.js — Migration des 252 questions in-memory → Neon
//
// À exécuter UNE FOIS avant de basculer le serveur sur la version DB :
//   npm run seed
//
// Idempotent : supprime tout le contenu de la table Question avant d'insérer
// (les tables GameSession et QuestionReport restent intactes — elles sont
// censées être vides au moment du seed).

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { _DB }           = require('./_seed-data/questions');     // QCM par theme/diff
const { GEO_LOCATIONS } = require('./_seed-data/geo-questions'); // 26 lieux
const { PIXEL_IMAGES }  = require('./_seed-data/pixel-images');  // 10 images

const prisma = new PrismaClient();

async function seedQuestions() {
  console.log('🌱 Début du seed…');

  // ── Reset table Question pour idempotence ───────────────────
  // (cascade vers QuestionReport via Prisma ; pas de GameSession encore)
  const deleted = await prisma.question.deleteMany({});
  if (deleted.count > 0) console.log(`🧹 ${deleted.count} questions existantes supprimées`);

  let qcmCount = 0, geoCount = 0, pixelCount = 0;

  // ── 1. QCM : DB[theme][difficulty] = [ { question, options, correctIndex, explanation } ] ──
  for (const theme of Object.keys(_DB)) {
    for (const difficulty of Object.keys(_DB[theme])) {
      const list = _DB[theme][difficulty] || [];
      for (const q of list) {
        await prisma.question.create({
          data: {
            question:     q.question,
            language:     'fr',
            theme,
            difficulty,
            type:         'qcm',
            options:      q.options,
            correctIndex: q.correctIndex,
            explanation:  q.explanation || '',
            source:       'manual',
            status:       'approved',
          },
        });
        qcmCount++;
      }
    }
  }
  console.log(`✅ QCM   : ${qcmCount} questions importées (12 thèmes × 3 difficultés)`);

  // ── 2. Géo : 1 enregistrement par lieu ──────────────────────
  for (const loc of GEO_LOCATIONS) {
    await prisma.question.create({
      data: {
        question:    `Où se trouve ${loc.label} ?`,
        language:    'fr',
        theme:       'geo',
        difficulty:  'medium',
        type:        'geo',
        lat:         loc.lat,
        lng:         loc.lng,
        label:       loc.label,
        country:     loc.country || '',
        explanation: loc.fact || `${loc.label} — ${loc.country || ''}`.trim(),
        source:      'manual',
        status:      'approved',
      },
    });
    geoCount++;
  }
  console.log(`✅ Géo   : ${geoCount} lieux importés`);

  // ── 3. Pixel : QCM image, on conserve credit/license (CC BY-SA) ─
  for (const img of PIXEL_IMAGES) {
    await prisma.question.create({
      data: {
        question:     img.question || 'Qu\'est-ce que c\'est ?',
        language:     'fr',
        theme:        img.theme || 'geographie',
        difficulty:   img.difficulty || 'easy',
        type:         'pixel',
        options:      img.options,
        correctIndex: img.correctIndex,
        imageUrl:     img.url,
        credit:       img.credit || null,
        creditUrl:    img.creditUrl || null,
        license:      img.license || null,
        label:        img.label || null,
        explanation:  img.fact || '',
        source:       'manual',
        status:       'approved',
      },
    });
    pixelCount++;
  }
  console.log(`✅ Pixel : ${pixelCount} images importées`);

  const total = await prisma.question.count();
  console.log(`\n🎉 Seed terminé — ${total} questions en base.`);
}

seedQuestions()
  .catch(err => { console.error('❌ Seed error:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());

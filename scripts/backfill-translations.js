// scripts/backfill-translations.js
// Backfill : crée une QuestionTranslation pour chaque Question existante qui
// n'en a pas encore dans sa langue de référence.
//
// Idempotent grâce à l'unique (questionId, language) : on peut le relancer
// autant qu'on veut sans créer de doublons.
//
// Usage : npm run backfill

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const all = await prisma.question.findMany({
    select: {
      id:           true,
      language:     true,
      question:     true,
      options:      true,
      explanation:  true,
      label:        true,
      country:      true,
      translations: { select: { language: true } },
    },
  });

  console.log(`📚 ${all.length} questions à inspecter`);

  let created   = 0;
  let skipped   = 0;
  let noLegacy  = 0;

  for (const q of all) {
    const lang = q.language || 'fr';

    // Si pas de texte legacy, on n'a rien à backfiller
    if (!q.question || !q.question.trim()) {
      noLegacy++;
      continue;
    }

    // Déjà une traduction dans cette langue ? on saute
    if (q.translations.some(t => t.language === lang)) {
      skipped++;
      continue;
    }

    await prisma.questionTranslation.create({
      data: {
        questionId:  q.id,
        language:    lang,
        text:        q.question,
        options:     q.options ?? undefined,
        explanation: q.explanation || '',
        label:       q.label   || null,
        country:     q.country || null,
      },
    });
    created++;
  }

  console.log(`✅ Créées : ${created}`);
  console.log(`⏭️  Déjà présentes : ${skipped}`);
  console.log(`⚠️  Sans texte legacy (sautées) : ${noLegacy}`);

  const total = await prisma.questionTranslation.count();
  console.log(`📊 Total traductions en base : ${total}`);
}

main()
  .catch((err) => { console.error('❌ Backfill error:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

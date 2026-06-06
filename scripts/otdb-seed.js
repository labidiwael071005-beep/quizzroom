// scripts/otdb-seed.js
// Insertion en base des questions traduites (data/otdb-translated.json).
//
// IDEMPOTENT : si une Question existe déjà avec ce sourceRef, on SKIPPE
// — pas de doublon, pas d'update. Relancer le script n'a aucun effet de
// bord. Idem pour les translations (unique [questionId, language]).
//
// Usage : npm run otdb:seed
// Pré-requis : Phase 1 (fetch) + Phase 2 (traduction) déjà exécutées.

const fs                 = require('fs');
const path               = require('path');
const { PrismaClient }   = require('@prisma/client');

const FILE = path.join(__dirname, '..', 'data', 'otdb-translated.json');

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`❌ Fichier ${FILE} introuvable. Lance d'abord npm run otdb:fetch + otdb:translate.`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  console.log(`📚 ${data.length} questions traduites à seeder`);

  const prisma = new PrismaClient();
  let created = 0, skipped = 0, errors = 0;

  try {
    for (const q of data) {
      // Double check : sourceRef doit être présent (sinon on saute, sécurité)
      if (!q.sourceRef) { skipped++; continue; }

      // Garde-fou : la validation du correctIndex et de l'ordre des options
      // est implicite — toutes les langues partagent le même correctIndex
      // et doivent avoir 4 options. Le script otdb-translate.js a déjà
      // validé les tailles ; on revérifie ici à minima.
      const allLangs = ['en', 'fr', 'es'];
      const okShape = allLangs.every(l =>
        q.translations?.[l]?.text &&
        Array.isArray(q.translations[l].options) &&
        q.translations[l].options.length === 4
      );
      if (!okShape) {
        console.warn(`⚠️  ${q.sourceRef} : shape invalide (langue manquante ou options ≠ 4) — sautée`);
        errors++; continue;
      }

      // Idempotence : sourceRef est @unique. On tente d'abord findUnique.
      const existing = await prisma.question.findUnique({
        where:  { sourceRef: q.sourceRef },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }

      try {
        await prisma.question.create({
          data: {
            // La colonne legacy `question` reste : on y met la version EN
            // d'origine (utilisée comme fallback ultime côté server cache).
            question:     q.translations.en.text,
            language:     'en',
            options:      q.translations.en.options,  // legacy options (EN)
            correctIndex: q.correctIndex,
            theme:        q.theme,
            difficulty:   q.difficulty,
            type:         q.type,
            explanation:  '',
            source:       'OpenTriviaDB',
            sourceRef:    q.sourceRef,
            status:       'approved',
            translations: {
              create: allLangs.map(l => ({
                language:    l,
                text:        q.translations[l].text,
                options:     q.translations[l].options,
                explanation: q.translations[l].explanation || '',
              })),
            },
          },
        });
        created++;
      } catch (e) {
        // Course condition possible si 2 instances lancent le seed en même
        // temps : on retombe sur skip.
        if (String(e.message || '').includes('Unique constraint')) {
          skipped++;
        } else {
          console.warn(`⚠️  ${q.sourceRef} : create fail — ${e.message}`);
          errors++;
        }
      }
    }
  } finally {
    // Récapitulatif post-seed
    const total       = await prisma.question.count();
    const fromOtdb    = await prisma.question.count({ where: { source: 'OpenTriviaDB' } });
    const trCount     = await prisma.questionTranslation.count();
    await prisma.$disconnect();

    console.log('');
    console.log(`✅ Créées        : ${created}`);
    console.log(`⏭️  Déjà en base  : ${skipped}`);
    if (errors) console.log(`⚠️  Erreurs       : ${errors}`);
    console.log('');
    console.log(`📊 Total questions en base   : ${total}`);
    console.log(`📊 dont source=OpenTriviaDB  : ${fromOtdb}`);
    console.log(`📊 Total traductions          : ${trCount}`);
  }
}

main().catch(err => { console.error('❌ Seed error :', err); process.exit(1); });

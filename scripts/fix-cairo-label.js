// scripts/fix-cairo-label.js — correction ponctuelle (juillet 2026)
// La géo sourceRef b6966ed6c0054551 demandait une CAPITALE mais son label était
// "Gizeh" (pas une capitale). Réponse correcte : Le Caire. Le hash géo ne dépend
// que du texte FR, donc le sourceRef ne change pas ; seed-generated skippe les
// refs existants → on met à jour la ligne en base directement.

const { PrismaClient } = require('@prisma/client');

const REF = 'b6966ed6c0054551';
const LAT = 30.0444, LNG = 31.2357;
const LABELS = { fr: 'Le Caire', en: 'Cairo', es: 'El Cairo' };

async function main() {
  const prisma = new PrismaClient();
  try {
    const q = await prisma.question.findUnique({
      where: { sourceRef: REF },
      include: { translations: true },
    });
    if (!q) { console.log(`Question ${REF} absente de la base — rien à corriger (le seed insérera la version corrigée).`); return; }

    await prisma.question.update({
      where: { id: q.id },
      data: { lat: LAT, lng: LNG, label: LABELS.fr },
    });
    for (const tr of q.translations) {
      const label = LABELS[tr.language];
      if (label) await prisma.questionTranslation.update({ where: { id: tr.id }, data: { label } });
    }

    const after = await prisma.question.findUnique({
      where: { id: q.id },
      select: { lat: true, lng: true, label: true, translations: { select: { language: true, label: true } } },
    });
    console.log('✅ Corrigé :', JSON.stringify(after));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error('❌', e); process.exit(1); });

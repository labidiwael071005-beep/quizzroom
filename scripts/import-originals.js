// scripts/import-originals.js
// Phase 3 — Réinjection en base des traductions EN + ES des questions d'origine.
//
// Lit data/originals-translated.json et crée, pour chaque question, les
// QuestionTranslation manquantes (en/es). NE modifie JAMAIS la traduction 'fr'
// existante ni les champs neutres de Question (correctIndex, lat, lng, …).
//
// IDEMPOTENT + REPRENABLE grâce à @@unique([questionId, language]) : si la
// traduction (questionId, language) existe déjà → skip ; sinon création. On peut
// relancer le script autant de fois que nécessaire sans créer de doublon.
//
// Garde-fou ordre des options : on revalide que les options EN/ES ont la même
// longueur que la version FR en base (correctIndex est partagé). Une entrée
// incohérente est signalée et sautée plutôt qu'insérée de travers.
//
// Usage : npm run import:originals  (en local, contre Neon via DATABASE_URL)

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const FILE  = path.join(__dirname, '..', 'data', 'originals-translated.json');
const LANGS = ['en', 'es'];
const prisma = new PrismaClient();

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`❌ Fichier ${FILE} introuvable. Lance d'abord la Phase 2 (traduction).`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  console.log(`📚 ${data.length} questions à réinjecter (en/es)`);

  let createdEn = 0, createdEs = 0, skipped = 0, rejected = 0, notFound = 0;

  for (const entry of data) {
    const { questionId } = entry;

    // On lit la Question + sa traduction FR (référence pour valider l'ordre/longueur
    // des options) + les langues déjà présentes.
    const q = await prisma.question.findUnique({
      where:  { id: questionId },
      select: { id: true, type: true, translations: { select: { language: true, options: true } } },
    });
    if (!q) { console.warn(`⚠️  ${questionId} : Question absente en base — sautée`); notFound++; continue; }

    const present = new Set(q.translations.map(t => t.language));
    const frRow   = q.translations.find(t => t.language === 'fr');
    const frLen   = Array.isArray(frRow?.options) ? frRow.options.length : 0;

    for (const lang of LANGS) {
      const tr = entry.translations?.[lang];
      if (!tr || !tr.text || !String(tr.text).trim()) {
        console.warn(`⚠️  ${questionId} ${lang} : traduction absente/vide — sautée`);
        rejected++; continue;
      }

      // Idempotence : déjà présente → on ne retouche pas.
      if (present.has(lang)) { skipped++; continue; }

      // Garde-fou ordre des options (sauf geo qui n'a pas d'options).
      if (q.type !== 'geo') {
        if (!Array.isArray(tr.options) || (frLen && tr.options.length !== frLen)) {
          console.warn(`⚠️  ${questionId} ${lang} : options=${Array.isArray(tr.options) ? tr.options.length : 'null'} ≠ fr=${frLen} — sautée`);
          rejected++; continue;
        }
      }

      try {
        await prisma.questionTranslation.create({
          data: {
            questionId,
            language:    lang,
            text:        tr.text,
            options:     tr.options ?? undefined,   // geo : pas d'options
            explanation: tr.explanation || '',
            label:       tr.label   ?? null,
            country:     tr.country ?? null,
          },
        });
        if (lang === 'en') createdEn++; else createdEs++;
      } catch (e) {
        // Course condition : la contrainte unique a joué entre le check et le create.
        if (String(e.message || '').includes('Unique constraint')) { skipped++; }
        else { console.warn(`⚠️  ${questionId} ${lang} : create fail — ${e.message}`); rejected++; }
      }
    }
  }

  // Récapitulatif + comptage final par langue (sanity)
  const [fr, en, es, total] = await Promise.all([
    prisma.questionTranslation.count({ where: { language: 'fr' } }),
    prisma.questionTranslation.count({ where: { language: 'en' } }),
    prisma.questionTranslation.count({ where: { language: 'es' } }),
    prisma.questionTranslation.count(),
  ]);

  console.log('');
  console.log(`✅ Créées (en) : ${createdEn}`);
  console.log(`✅ Créées (es) : ${createdEs}`);
  console.log(`⏭️  Déjà présentes (ignorées) : ${skipped}`);
  if (rejected) console.log(`⚠️  Rejetées (shape/option) : ${rejected}`);
  if (notFound) console.log(`⚠️  Question introuvable      : ${notFound}`);
  console.log('');
  console.log(`📊 Traductions en base — fr=${fr}, en=${en}, es=${es} (total ${total})`);
}

main()
  .catch((err) => { console.error('❌ Import error:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

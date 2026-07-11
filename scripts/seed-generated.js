// scripts/seed-generated.js — Phase 3
// Insertion IDEMPOTENTE des questions générées à la main par Claude Code,
// stockées dans data/generated-qcm/*.json (QCM) et data/generated-geo/*.json (Géo).
//
// Garanties :
//   - IDEMPOTENT : le sourceRef (hash stable de la version FR) est @unique.
//     Si une Question existe déjà avec ce sourceRef → SKIP (aucun doublon, aucun
//     update). On peut relancer autant de fois qu'on veut, y compris après avoir
//     ajouté de nouveaux lots.
//   - REPRENABLE : chaque lot est indépendant ; un lot partiellement inséré
//     reprend là où il s'était arrêté au prochain lancement.
//   - VALIDATION avant écriture : QCM → 4 options identiques en taille dans les
//     3 langues + correctIndex 0-3 ; Géo → lat/lng numériques + label/country
//     présents dans les 3 langues.
//
// Usage : npm run seed:generated
// Le sourceRef est RECALCULÉ ici (via lib/qhash) pour ne jamais dépendre d'un
// stamp oublié — c'est l'unique source de vérité du dédoublonnage.

const fs   = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { refFor } = require('./lib/qhash');

const LANGS = ['fr', 'en', 'es'];
const QCM_DIR = path.join(__dirname, '..', 'data', 'generated-qcm');
const GEO_DIR = path.join(__dirname, '..', 'data', 'generated-geo');

function loadDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const out = [];
  for (const f of files) {
    let arr;
    try { arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { console.error(`❌ JSON invalide ${f}: ${e.message}`); continue; }
    if (Array.isArray(arr)) for (const q of arr) out.push({ ...q, _file: f });
  }
  return out;
}

// Validation de forme. Renvoie null si OK, sinon un message d'erreur.
function validate(q) {
  const t = q.translations || {};
  for (const l of LANGS) {
    if (!t[l] || !t[l].text) return `traduction ${l} manquante/vide`;
  }
  if (q.type === 'qcm') {
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3)
      return `correctIndex invalide (${q.correctIndex})`;
    for (const l of LANGS) {
      if (!Array.isArray(t[l].options) || t[l].options.length !== 4)
        return `options ${l} ≠ 4`;
      if (t[l].options.some(o => o == null || String(o).trim() === ''))
        return `option vide en ${l}`;
    }
  } else if (q.type === 'geo') {
    if (typeof q.lat !== 'number' || typeof q.lng !== 'number' ||
        Number.isNaN(q.lat) || Number.isNaN(q.lng))
      return `lat/lng non numériques`;
    if (q.lat < -90 || q.lat > 90 || q.lng < -180 || q.lng > 180)
      return `lat/lng hors bornes`;
    for (const l of LANGS) {
      if (!t[l].label || !t[l].country) return `label/country ${l} manquant`;
    }
  } else {
    return `type inconnu (${q.type})`;
  }
  return null;
}

async function main() {
  const items = [...loadDir(QCM_DIR), ...loadDir(GEO_DIR)];
  console.log(`📚 ${items.length} questions générées à examiner (QCM + Géo).`);
  if (items.length === 0) {
    console.log('Rien à insérer. Rédige des lots dans data/generated-qcm/ ou data/generated-geo/.');
    return;
  }

  const prisma = new PrismaClient();
  let created = 0, skipped = 0, invalid = 0, errors = 0;
  const seenRefs = new Set();

  try {
    for (const q of items) {
      const fr  = q.translations && q.translations.fr;
      const ref = refFor(q.type, fr);

      // Doublon interne aux lots (deux questions FR identiques) : on n'insère
      // qu'une fois par run.
      if (seenRefs.has(ref)) { skipped++; continue; }
      seenRefs.add(ref);

      const err = validate(q);
      if (err) {
        console.warn(`⚠️  [${q._file}] ${ref} invalide : ${err}`);
        invalid++; continue;
      }

      const existing = await prisma.question.findUnique({
        where: { sourceRef: ref }, select: { id: true },
      });
      if (existing) { skipped++; continue; }

      const t = q.translations;
      const isGeo = q.type === 'geo';
      try {
        await prisma.question.create({
          data: {
            // Colonnes legacy (fallback serveur) : on y met la version FR.
            question:     t.fr.text,
            language:     'fr',
            theme:        q.theme,
            difficulty:   q.difficulty,
            type:         q.type,
            options:      isGeo ? undefined : t.fr.options,
            correctIndex: isGeo ? undefined : q.correctIndex,
            lat:          isGeo ? q.lat : undefined,
            lng:          isGeo ? q.lng : undefined,
            label:        isGeo ? t.fr.label   : undefined,
            country:      isGeo ? t.fr.country : undefined,
            explanation:  t.fr.explanation || '',
            source:       'generated',
            status:       'approved',
            sourceRef:    ref,
            translations: {
              create: LANGS.map(l => ({
                language:    l,
                text:        t[l].text,
                options:     isGeo ? undefined : t[l].options,
                explanation: t[l].explanation || '',
                label:       isGeo ? t[l].label   : undefined,
                country:     isGeo ? t[l].country : undefined,
              })),
            },
          },
        });
        created++;
      } catch (e) {
        if (String(e.message || '').includes('Unique constraint')) { skipped++; }
        else { console.warn(`⚠️  [${q._file}] ${ref} create fail : ${e.message}`); errors++; }
      }
    }
  } finally {
    // ── Récapitulatif ──────────────────────────────────────────
    const total     = await prisma.question.count();
    const fromGen    = await prisma.question.count({ where: { source: 'generated' } });
    const trCount    = await prisma.questionTranslation.count();
    const byType     = await prisma.question.groupBy({ by: ['type'], _count: true });
    const byThemeDiff = await prisma.question.groupBy({
      by: ['theme', 'difficulty', 'type'], _count: true,
    });
    await prisma.$disconnect();

    console.log('');
    console.log(`✅ Créées         : ${created}`);
    console.log(`⏭️  Ignorées (dbl) : ${skipped}`);
    if (invalid) console.log(`🚫 Invalides      : ${invalid}`);
    if (errors)  console.log(`⚠️  Erreurs        : ${errors}`);
    console.log('');
    console.log(`📊 Total questions en base   : ${total}`);
    console.log(`📊 dont source=generated     : ${fromGen}`);
    console.log(`📊 Total traductions          : ${trCount}`);
    console.log(`📊 Par type : ${byType.map(r => `${r.type}=${r._count._all ?? r._count}`).join(', ')}`);
    console.log('');
    console.log('📊 Répartition thème / difficulté / type :');
    const rows = byThemeDiff
      .map(r => ({ k: `${r.theme.padEnd(12)} ${r.difficulty.padEnd(7)} ${r.type.padEnd(5)}`, n: r._count._all ?? r._count }))
      .sort((a, b) => a.k.localeCompare(b.k));
    for (const r of rows) console.log(`   ${r.k} : ${r.n}`);
  }
}

main().catch(err => { console.error('❌ Seed error :', err); process.exit(1); });

// scripts/merge-originals-batch.js
// Phase 2 (helper) — fusionne un lot de traductions dans data/originals-translated.json.
//
// Workflow : pour chaque lot, on écrit les ~25 entrées traduites dans
// data/_batch.json, puis on lance ce script. Il fusionne le lot dans le
// fichier de sortie cumulatif data/originals-translated.json.
//
// IDEMPOTENT + REPRENABLE : une question déjà présente (avec en+es) dans la
// sortie n'est jamais réécrite. On peut relancer sans risque.
//
// VALIDATION (filet anti-erreur sur l'ordre des options) : pour chaque entrée,
// les options EN/ES doivent avoir EXACTEMENT la même longueur que le FR
// (l'ordre est partagé via correctIndex — on ne réordonne jamais). Pour le
// type geo, options doit rester null et label/country doivent être fournis si
// le FR les avait. Toute entrée invalide est rejetée (et signalée) sans
// polluer la sortie.
//
// Usage : node scripts/merge-originals-batch.js [data/_batch.json]

const fs   = require('fs');
const path = require('path');

const FR_FILE  = path.join(__dirname, '..', 'data', 'originals-fr.json');
const OUT_FILE = path.join(__dirname, '..', 'data', 'originals-translated.json');
const BATCH    = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'data', '_batch.json');

const LANGS = ['en', 'es'];

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function validate(frEntry, tr, lang) {
  const errs = [];
  const t = tr && tr[lang];
  if (!t) { errs.push(`${lang} manquant`); return errs; }
  if (!t.text || !String(t.text).trim()) errs.push(`${lang}.text vide`);

  if (frEntry.type === 'geo') {
    if (t.options != null) errs.push(`${lang}.options doit être null (geo)`);
    if (frEntry.fr.label   && !t.label)   errs.push(`${lang}.label manquant`);
    if (frEntry.fr.country && !t.country) errs.push(`${lang}.country manquant`);
  } else {
    const frLen = Array.isArray(frEntry.fr.options) ? frEntry.fr.options.length : 0;
    if (!Array.isArray(t.options)) errs.push(`${lang}.options doit être un tableau`);
    else if (t.options.length !== frLen) errs.push(`${lang}.options=${t.options.length} ≠ fr=${frLen}`);
    else if (t.options.some(o => o == null || !String(o).trim())) errs.push(`${lang}.options contient un vide`);
  }
  return errs;
}

function main() {
  const frList = readJson(FR_FILE, null);
  if (!frList) { console.error(`❌ ${FR_FILE} introuvable (lance Phase 1).`); process.exit(1); }
  const frById = new Map(frList.map(e => [e.questionId, e]));

  const existing = readJson(OUT_FILE, []);
  const outById  = new Map(existing.map(e => [e.questionId, e]));

  const batch = readJson(BATCH, null);
  if (!batch) { console.error(`❌ Lot ${BATCH} introuvable.`); process.exit(1); }

  let added = 0, skipped = 0, rejected = 0;

  for (const entry of batch) {
    const id = entry.questionId;
    const frEntry = frById.get(id);
    if (!frEntry) { console.warn(`⚠️  ${id} : absent de originals-fr.json — rejeté`); rejected++; continue; }

    // Déjà présent avec en+es → on ne retouche pas (reprenable).
    const cur = outById.get(id);
    if (cur && LANGS.every(l => cur.translations?.[l]?.text)) { skipped++; continue; }

    const tr = entry.translations || {};
    const errs = LANGS.flatMap(l => validate(frEntry, tr, l));
    if (errs.length) { console.warn(`⚠️  ${id} : ${errs.join(' ; ')} — rejeté`); rejected++; continue; }

    outById.set(id, {
      questionId: id,
      type:       frEntry.type,
      translations: {
        en: { text: tr.en.text, options: tr.en.options ?? null, explanation: tr.en.explanation || '', label: tr.en.label ?? null, country: tr.en.country ?? null },
        es: { text: tr.es.text, options: tr.es.options ?? null, explanation: tr.es.explanation || '', label: tr.es.label ?? null, country: tr.es.country ?? null },
      },
    });
    added++;
  }

  // On réordonne selon originals-fr.json pour des diffs git stables.
  const merged = frList.map(e => outById.get(e.questionId)).filter(Boolean);
  fs.writeFileSync(OUT_FILE, JSON.stringify(merged, null, 2));

  const done = merged.length, total = frList.length;
  const byType = {};
  for (const e of merged) byType[e.type] = (byType[e.type] || 0) + 1;

  console.log(`✅ Lot fusionné : +${added} ajoutées, ${skipped} déjà présentes, ${rejected} rejetées`);
  console.log(`📊 Avancement : ${done}/${total} questions traduites (reste ${total - done})`);
  console.log(`   Par type : ${Object.entries(byType).sort().map(([t, n]) => `${t}=${n}`).join(', ')}`);
}

main();

// server/question-store.js — Couche d'accès aux questions, backée Prisma/Neon.
//
// Le serveur n'a pas changé : il appelle toujours getQuestions / getPixelQuestions
// / getGeoQuestions avec les mêmes signatures qu'avant la migration. La seule
// différence est que les données proviennent désormais d'une DB Postgres,
// cachée en mémoire au boot pour ne pas taper Neon à chaque manche.

let prisma = null;
let cache  = { qcm: [], geo: [], pixel: [] };

// Mélange un tableau et en retire `count` éléments. On copie d'abord pour
// ne pas muter le cache.
function pickRandom(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ── Init : charge tout en cache au boot ───────────────────────
async function initQuestionStore(prismaClient) {
  prisma = prismaClient;
  console.log('📚 Chargement des questions depuis la DB…');

  const all = await prisma.question.findMany({ where: { status: 'approved' } });
  cache.qcm   = all.filter(q => q.type === 'qcm');
  cache.geo   = all.filter(q => q.type === 'geo');
  cache.pixel = all.filter(q => q.type === 'pixel');

  console.log(`✅ Cache : ${cache.qcm.length} QCM, ${cache.geo.length} Géo, ${cache.pixel.length} Pixel`);
}

// Optionnel : recharger le cache (appelé après un POST/DELETE admin)
async function reloadQuestionStore() {
  if (!prisma) return;
  const all = await prisma.question.findMany({ where: { status: 'approved' } });
  cache.qcm   = all.filter(q => q.type === 'qcm');
  cache.geo   = all.filter(q => q.type === 'geo');
  cache.pixel = all.filter(q => q.type === 'pixel');
}

// ── Adaptateurs : même signature que les anciens fichiers ─────

// Mapping DB-row → format jeu (QCM "normal", pas de type explicite).
function adaptQcm(row) {
  return {
    id:           row.id,
    question:     row.question,
    options:      row.options,
    correctIndex: row.correctIndex,
    explanation:  row.explanation || '',
  };
}

// Géo : la logique de jeu attend `type: 'geomap'` (et non 'geo').
function adaptGeo(row) {
  return {
    id:          row.id,
    type:        'geomap',
    question:    row.question,
    label:       row.label,
    lat:         row.lat,
    lng:         row.lng,
    country:     row.country || '',
    explanation: row.explanation || '',
  };
}

// Pixel : QCM avec image + attribution.
function adaptPixel(row) {
  return {
    id:           row.id,
    type:         'pixel',
    imageUrl:     row.imageUrl,
    question:     row.question,
    options:      row.options,
    correctIndex: row.correctIndex,
    label:        row.label,
    explanation:  row.explanation || '',
    credit:       row.credit,
    creditUrl:    row.creditUrl,
    license:      row.license,
  };
}

// QCM : on filtre par theme (string ou tableau) + difficulty, on retire `count`
// au hasard. Compatible avec l'ancienne API.
function getQuestions({ themes = 'general', difficulty = 'medium', count = 10 }) {
  const themeList = Array.isArray(themes) ? themes : [themes];

  let pool = cache.qcm.filter(q =>
    themeList.includes(q.theme) && q.difficulty === difficulty
  );

  // Fallback si la difficulté demandée n'a rien (ancien fallback "medium")
  if (pool.length === 0) {
    pool = cache.qcm.filter(q => themeList.includes(q.theme));
  }
  // Dernier recours : élargir à general
  if (pool.length === 0) {
    pool = cache.qcm.filter(q => q.theme === 'general');
  }

  return pickRandom(pool, count).map(adaptQcm);
}

function getPixelQuestions({ count = 5 }) {
  return pickRandom(cache.pixel, count).map(adaptPixel);
}

function getGeoQuestions({ count = 5 }) {
  return pickRandom(cache.geo, count).map(adaptGeo);
}

// ── Stats : fire-and-forget (on ne bloque pas le gameflow) ────
function recordShown(id) {
  if (!prisma || !id) return;
  prisma.question.update({
    where: { id },
    data:  { timesShown: { increment: 1 } },
  }).catch(err => console.warn('[stats] timesShown fail', err.message));
}

function recordCorrect(id) {
  if (!prisma || !id) return;
  prisma.question.update({
    where: { id },
    data:  { timesCorrect: { increment: 1 } },
  }).catch(err => console.warn('[stats] timesCorrect fail', err.message));
}

// Pour le dashboard admin / health
function cacheStats() {
  return {
    qcm:   cache.qcm.length,
    geo:   cache.geo.length,
    pixel: cache.pixel.length,
    total: cache.qcm.length + cache.geo.length + cache.pixel.length,
  };
}

module.exports = {
  initQuestionStore,
  reloadQuestionStore,
  getQuestions,
  getPixelQuestions,
  getGeoQuestions,
  recordShown,
  recordCorrect,
  cacheStats,
};

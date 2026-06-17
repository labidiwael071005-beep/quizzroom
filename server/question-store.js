// server/question-store.js — Couche d'accès aux questions, backée Prisma/Neon.
//
// Le serveur n'a pas changé : il appelle toujours getQuestions / getPixelQuestions
// / getGeoQuestions avec les mêmes signatures qu'avant la migration. La seule
// différence est que les données proviennent désormais d'une DB Postgres,
// cachée en mémoire au boot pour ne pas taper Neon à chaque manche.
//
// Multilingue : chaque question porte désormais un objet `translations` indexé
// par langue { fr: {text, options, explanation, label, country}, en: {...}, … }.
// Les champs neutres (correctIndex, lat, lng, imageUrl) restent à la racine —
// la validation des réponses n'utilise QUE ces champs (jamais le texte).

const SUPPORTED_LANGS = ['fr', 'en', 'es'];

// Anti-répétition niveau 2 : on ne reressert pas au même joueur CONNECTÉ une
// question vue dans les N derniers jours (à travers toutes ses parties).
// Ajustable ici (point de contrôle unique).
const HISTORY_WINDOW_DAYS = 14;

let prisma = null;
let cache  = { qcm: [], geo: [], pixel: [] };

// Mélange un tableau et en retire `count` éléments. On copie d'abord pour
// ne pas muter le cache.
function pickRandom(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// Choisit la "meilleure" traduction selon une langue préférée :
// preferred → fr → en → première disponible. Renvoie un objet
// { text, options, explanation, label, country } ou null si absolument rien.
function pickTranslation(translations, preferred = 'fr') {
  if (!translations) return null;
  const order = [preferred, 'fr', 'en', ...Object.keys(translations)];
  for (const l of order) {
    if (translations[l]) return translations[l];
  }
  return null;
}

// Construit l'objet translations à partir des lignes QuestionTranslation +
// d'éventuelles données legacy de la Question elle-même (fallback ultime).
function buildTranslations(row) {
  const out = {};
  for (const t of row.translations || []) {
    if (!SUPPORTED_LANGS.includes(t.language)) continue;
    out[t.language] = {
      text:        t.text || '',
      options:     t.options || null,
      explanation: t.explanation || '',
      label:       t.label   || null,
      country:     t.country || null,
    };
  }
  // Fallback : si aucune traduction n'existe pour la langue legacy, on la
  // synthétise depuis les colonnes héritées (Question.question, .options, …).
  const legacyLang = row.language || 'fr';
  if (!out[legacyLang] && row.question) {
    out[legacyLang] = {
      text:        row.question,
      options:     row.options || null,
      explanation: row.explanation || '',
      label:       row.label   || null,
      country:     row.country || null,
    };
  }
  return out;
}

// ── Init : charge tout en cache au boot ───────────────────────
async function initQuestionStore(prismaClient) {
  prisma = prismaClient;
  console.log('📚 Chargement des questions depuis la DB…');

  const all = await prisma.question.findMany({
    where: { status: 'approved' },
    include: { translations: true },
  });
  const enriched = all.map(enrichRow);
  cache.qcm   = enriched.filter(q => q.type === 'qcm');
  cache.geo   = enriched.filter(q => q.type === 'geo');
  cache.pixel = enriched.filter(q => q.type === 'pixel');

  const langStats = SUPPORTED_LANGS.map(l => {
    const n = enriched.filter(q => q.translations[l]).length;
    return `${l}=${n}`;
  }).join(', ');
  console.log(`✅ Cache : ${cache.qcm.length} QCM, ${cache.geo.length} Géo, ${cache.pixel.length} Pixel`);
  console.log(`🌍 Traductions par langue : ${langStats}`);
}

// Optionnel : recharger le cache (appelé après un POST/DELETE admin)
async function reloadQuestionStore() {
  if (!prisma) return;
  const all = await prisma.question.findMany({
    where: { status: 'approved' },
    include: { translations: true },
  });
  const enriched = all.map(enrichRow);
  cache.qcm   = enriched.filter(q => q.type === 'qcm');
  cache.geo   = enriched.filter(q => q.type === 'geo');
  cache.pixel = enriched.filter(q => q.type === 'pixel');
}

// Enrichit une ligne DB avec son objet translations + des champs "fallback"
// (en FR si disponible) pour que la logique serveur (history, reveal interne)
// puisse continuer à lire q.question / q.options sans connaître la locale.
function enrichRow(row) {
  const translations = buildTranslations(row);
  const fallback     = pickTranslation(translations, 'fr') || {};
  return {
    id:           row.id,
    type:         row.type,
    theme:        row.theme,
    difficulty:   row.difficulty,
    correctIndex: row.correctIndex,
    imageUrl:     row.imageUrl,
    credit:       row.credit,
    creditUrl:    row.creditUrl,
    license:      row.license,
    lat:          row.lat,
    lng:          row.lng,
    translations,
    // Fallback (FR ou première dispo) — utilisé par le serveur en interne.
    question:     fallback.text        || row.question     || '',
    options:      fallback.options     || row.options      || null,
    explanation:  fallback.explanation || row.explanation  || '',
    label:        fallback.label       || row.label        || null,
    country:      fallback.country     || row.country      || '',
  };
}

// ── Adaptateurs : même signature que les anciens fichiers ─────

// Mapping cache-row → format jeu (QCM "normal", pas de type explicite).
function adaptQcm(row) {
  return {
    id:           row.id,
    question:     row.question,
    options:      row.options,
    correctIndex: row.correctIndex,
    explanation:  row.explanation || '',
    translations: row.translations,
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
    translations: row.translations,
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
    translations: row.translations,
  };
}

// Tire jusqu'à `count` questions DISTINCTES, en excluant les ids déjà servis,
// en parcourant une liste de pools par ordre de PRIORITÉ (fallback). Une fois
// `count` atteint on s'arrête ; on ne reprend jamais une question déjà servie
// ni une déjà choisie dans cet appel. Peut renvoyer MOINS que `count` (réservoir
// épuisé) — c'est volontaire (manche raccourcie côté serveur).
// `hardExclude` = ids JAMAIS resservis (servedQuestionIds niveau 1 — inviolable).
// `softExclude` = historique par joueur connecté (niveau 2) — respecté d'abord,
// relâché EN DERNIER recours si le pool non-vu est épuisé (sans jamais toucher
// au hard). Au sein de chaque passe, on parcourt les pools dans l'ordre de
// priorité (strict → élargi) déjà fourni par l'appelant.
function pickDistinct(pools, count, hardExclude, softExclude) {
  const hard = hardExclude instanceof Set ? hardExclude : new Set();
  const soft = softExclude instanceof Set ? softExclude : new Set();
  const out  = [];
  const seen = new Set();
  const fill = (useSoft) => {
    for (const pool of pools) {
      if (out.length >= count) break;
      const avail = pool.filter(q =>
        !hard.has(q.id) && !seen.has(q.id) && (!useSoft || !soft.has(q.id)));
      for (const q of pickRandom(avail, count - out.length)) { seen.add(q.id); out.push(q); }
    }
  };
  fill(true);                              // 1-3 : historique respecté
  if (out.length < count && soft.size) {   // 4-5 : historique relâché (dernier recours)
    const before = out.length;
    fill(false);
    if (out.length > before) {
      console.log(`[anti-rep L2] historique relâché : +${out.length - before} question(s) déjà vue(s) réutilisée(s) (pool non-vu épuisé).`);
    }
  }
  return out;
}

// QCM : filtre par theme (string|tableau) + difficulty, EXCLUT les ids déjà
// servis, et applique un fallback progressif si le pool strict ne suffit pas :
//   1) thèmes + difficulté  →  2) thèmes (toute difficulté)  →  3) tout le type.
// `exclude` = Set d'ids déjà servis dans la partie (anti-répétition).
function getQuestions({ themes = 'general', difficulty = 'medium', count = 10, exclude, softExclude } = {}) {
  const themeList = Array.isArray(themes) ? themes : [themes];
  const inThemes  = q => themeList.includes(q.theme);
  const pools = [
    cache.qcm.filter(q => inThemes(q) && q.difficulty === difficulty), // 1. strict
    cache.qcm.filter(q => inThemes(q)),                                // 2. difficulté relâchée
    cache.qcm,                                                         // 3. thèmes relâchés (tout le type)
  ];
  return pickDistinct(pools, count, exclude, softExclude).map(adaptQcm);
}

function getPixelQuestions({ count = 5, exclude, softExclude } = {}) {
  // Pas de filtre thème/difficulté pour le pixel : un seul pool, hors exclusions.
  return pickDistinct([cache.pixel], count, exclude, softExclude).map(adaptPixel);
}

function getGeoQuestions({ count = 5, exclude, softExclude } = {}) {
  return pickDistinct([cache.geo], count, exclude, softExclude).map(adaptGeo);
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
  pickTranslation,
  SUPPORTED_LANGS,
  HISTORY_WINDOW_DAYS,
};

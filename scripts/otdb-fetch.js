// scripts/otdb-fetch.js
// Récupération de questions depuis l'Open Trivia DB (https://opentdb.com).
//
// Sortie : data/otdb-staged.json — questions en anglais, format intermédiaire
// prêt pour Phase 2 (traduction FR/ES). Chaque entrée porte un sourceRef
// stable (SHA-256, 16 premiers hex) calculé sur la question anglaise
// d'origine — c'est ce qui garantit l'idempotence côté seed.
//
// Usage :
//   npm run otdb:fetch                          # ~200 questions par défaut
//   PER_CATEGORY=25 npm run otdb:fetch          # surcharge le nb visé/catégorie
//   ONLY_CATS=25,27 npm run otdb:fetch          # ne récupère QUE ces catégories
//                                               # (en mode merge : conserve les
//                                               # questions déjà dans staged.json)
//
// Notes API OTDB :
// - amount max = 50 par requête.
// - encode=base64 : recommandé pour éviter les soucis d'entités HTML.
// - Sans clé. Token de session pour ne pas tirer 2× la même question.
// - Rate-limit : ~1 req / 5 s. On laisse 5.5 s entre chaque appel.

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const OUT_FILE     = path.join(__dirname, '..', 'data', 'otdb-staged.json');
const PER_CATEGORY = Math.max(1, parseInt(process.env.PER_CATEGORY || '20', 10));
const PAUSE_MS     = 5500;
const ONLY_CATS    = (process.env.ONLY_CATS || '')
  .split(',').map(s => s.trim()).filter(Boolean).map(Number);

// Mapping (catId OTDB → theme du projet). On ignore tout le reste.
const CATEGORY_THEME = {
  9:  'general',     // General Knowledge
  17: 'nature',      // Science & Nature
  18: 'tech',        // Science: Computers
  19: 'science',     // Science: Mathematics
  20: 'histoire',    // Mythology → on rattache à l'histoire
  22: 'geographie',  // Geography
  23: 'histoire',    // History
  25: 'art',         // Art
  27: 'nature',      // Animals
  11: 'cinema',      // Entertainment: Film
  12: 'musique',     // Entertainment: Music
};
const DIFFICULTIES = ['easy', 'medium', 'hard'];

// ── Helpers ─────────────────────────────────────────────────
function b64decode(s) { return Buffer.from(s, 'base64').toString('utf8'); }
function sleep(ms)    { return new Promise(r => setTimeout(r, ms)); }
function sourceRefOf(text) {
  return crypto.createHash('sha256').update('otdb:' + text).digest('hex').slice(0, 16);
}
// Fisher-Yates : mélange un tableau, retourne aussi le nouvel index de
// l'élément correct (celui dont la valeur === answer avant mélange).
function shuffleWithAnswer(options, answer) {
  const arr = [...options];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { options: arr, correctIndex: arr.indexOf(answer) };
}

async function httpGetJson(url) {
  // Node 20+ : fetch dispo natif. L'API OTDB renvoie parfois un HTTP 429
  // (Too Many Requests) en plus de son response_code=5 → on retente avec
  // un backoff plus long, jusqu'à 4 fois.
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (res.status === 429) {
      const wait = PAUSE_MS * (attempt + 2);   // 11s, 16.5s, 22s
      console.warn(`  ↻ HTTP 429, retry dans ${(wait / 1000).toFixed(1)}s`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
    return res.json();
  }
  throw new Error(`HTTP 429 persistant sur ${url}`);
}

// ── Token de session : évite que l'API renvoie 2× la même question ──
let SESSION_TOKEN = null;
async function getToken() {
  const j = await httpGetJson('https://opentdb.com/api_token.php?command=request');
  if (j.response_code !== 0 || !j.token) {
    throw new Error('Impossible d\'obtenir un token OTDB : ' + JSON.stringify(j));
  }
  return j.token;
}
async function resetToken(token) {
  const j = await httpGetJson(`https://opentdb.com/api_token.php?command=reset&token=${token}`);
  if (j.response_code !== 0) {
    throw new Error('Reset token OTDB échoué : ' + JSON.stringify(j));
  }
}

// ── Une requête OTDB ─────────────────────────────────────────
async function fetchBatch({ catId, diff, amount, token }) {
  const url = `https://opentdb.com/api.php?amount=${amount}&type=multiple&category=${catId}`
            + `&difficulty=${diff}&encode=base64&token=${token}`;
  for (let retry = 0; retry < 4; retry++) {
    const j = await httpGetJson(url);
    if (j.response_code === 0) return j.results || [];
    if (j.response_code === 1) return [];                   // pas assez de résultats
    if (j.response_code === 4) { await resetToken(token); continue; }  // token vide
    if (j.response_code === 5) { await sleep(PAUSE_MS); continue; }    // rate-limit
    // Inconnu / token invalide
    if (j.response_code === 3 || j.response_code === 2) return [];
    throw new Error('OTDB response_code inattendu : ' + j.response_code);
  }
  return [];
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  // Mode "merge" : si on cible quelques catégories seulement, on conserve
  // les questions déjà présentes dans data/otdb-staged.json et on ajoute
  // les nouvelles. Sans ONLY_CATS, on repart de zéro.
  let existing = [];
  if (ONLY_CATS.length > 0 && fs.existsSync(OUT_FILE)) {
    try { existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); } catch (_) {}
    console.log(`🔁 Mode merge : ${existing.length} questions déjà présentes, on n'ajoute que les catégories [${ONLY_CATS.join(', ')}]`);
  }

  const activeCats = ONLY_CATS.length > 0
    ? Object.entries(CATEGORY_THEME).filter(([id]) => ONLY_CATS.includes(Number(id)))
    : Object.entries(CATEGORY_THEME);
  const targetTotal = PER_CATEGORY * activeCats.length;
  console.log(`🎯 Cible : ~${targetTotal} questions (~${PER_CATEGORY}/catégorie sur ${activeCats.length} catégories)`);

  SESSION_TOKEN = await getToken();
  console.log(`🔑 Token OTDB : ${SESSION_TOKEN.slice(0, 8)}…`);
  await sleep(1000);

  const seen = new Set(existing.map(q => q.sourceRef));   // dédoublonnage par sourceRef
  const out  = [...existing];

  for (const [catId, theme] of activeCats) {
    let collected = 0;
    // On répartit en 3 difficultés pour avoir un mix.
    for (const diff of DIFFICULTIES) {
      if (collected >= PER_CATEGORY) break;
      const want   = Math.min(50, PER_CATEGORY - collected);
      const amount = Math.max(1, want);
      console.log(`📥 cat=${catId} (${theme}) diff=${diff} amount=${amount}`);
      let results = [];
      try {
        results = await fetchBatch({ catId, diff, amount, token: SESSION_TOKEN });
      } catch (e) {
        console.warn(`⚠️  cat=${catId}/${diff} fail : ${e.message}`);
      }
      for (const r of results) {
        const question = b64decode(r.question).trim();
        const correct  = b64decode(r.correct_answer).trim();
        const incorrect = (r.incorrect_answers || []).map(b => b64decode(b).trim());
        if (!question || !correct || incorrect.length !== 3) continue;
        const all4 = [correct, ...incorrect];
        // Garde-fou : si l'API a renvoyé une option vide
        if (all4.some(o => !o)) continue;
        const { options, correctIndex } = shuffleWithAnswer(all4, correct);
        const sourceRef = sourceRefOf(question);
        if (seen.has(sourceRef)) continue;
        seen.add(sourceRef);
        out.push({
          sourceRef,
          type:         'qcm',
          theme,
          difficulty:   diff,
          correctIndex,
          en: {
            text:        question,
            options,
            explanation: '',
          },
        });
        collected++;
      }
      await sleep(PAUSE_MS);
    }
    console.log(`  → cat=${catId} (${theme}) : ${collected} collectées`);
  }

  // Récap par thème
  const byTheme = {};
  for (const q of out) byTheme[q.theme] = (byTheme[q.theme] || 0) + 1;

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log('');
  console.log(`✅ ${out.length} questions écrites dans ${path.relative(process.cwd(), OUT_FILE)}`);
  console.log('   Répartition par thème :');
  for (const [t, n] of Object.entries(byTheme).sort()) {
    console.log(`     ${t.padEnd(12)} ${n}`);
  }
}

main().catch(err => {
  console.error('❌ Fetch error :', err);
  process.exit(1);
});

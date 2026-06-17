// server/index.js — Serveur principal QuizzRoom
const express     = require('express');
const http        = require('http');
const { Server }  = require('socket.io');
const path        = require('path');
const crypto      = require('crypto');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
require('dotenv').config();

const { validatePseudo, validateChatMessage, isReservedPseudo, containsProfanity } = require('./profanity-filter');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3000;

// ── Origins autorisés (CORS Socket.io + sécurité) ─────────────
const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
  ? [process.env.PUBLIC_URL || 'https://quizzroom.onrender.com']
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout:  60000,
  pingInterval: 25000,
});

// ── Durcissement Express ──────────────────────────────────────
app.disable('x-powered-by');
// Render (et la plupart des PaaS) place l'app derrière un proxy. Sans
// trust proxy, req.ip et le rate-limit IP pointent tous vers l'IP du proxy.
app.set('trust proxy', 1);

// Helmet : headers de sécurité + CSP adaptée à Socket.io, Tabler Icons,
// Leaflet (CSS+JS sur unpkg) et les tuiles OpenStreetMap.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://cdn.socket.io",
        "https://unpkg.com",
      ],
      // Helmet met scriptSrcAttr à 'none' par défaut → bloquerait tous les
      // onclick="…" inline du HTML. On les autorise tant qu'on n'a pas migré
      // toute la UI vers addEventListener.
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'", "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
      ],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "data:"],
      imgSrc: [
        "'self'", "data:", "blob:",
        "https://upload.wikimedia.org",
        "https://*.tile.openstreetmap.org",
        "https://unpkg.com",
        // Avatars Google (photo de profil OAuth)
        "https://lh3.googleusercontent.com",
        "https://*.googleusercontent.com",
      ],
      connectSrc: ["'self'", "wss:", "ws:"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: '64kb' }));

// ── Rate-limit REST ────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      60,
  standardHeaders: true,
  legacyHeaders:   false,
});
app.use('/api/', apiLimiter);

app.use(express.static(path.join(__dirname, '../public')));

// ── Couche données : Prisma → cache mémoire chargé au boot ────
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const {
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
} = require('./question-store');
const { distanceKm, geoScore } = require('./geo-math');

// ── Sessions + Passport (connexion Google OPTIONNELLE) ────────
// Ordre IMPÉRATIF : session AVANT passport, passport AVANT les routes.
// Le static (servi plus haut) ne traverse PAS ce middleware → pas de requête
// DB de session par asset. Le store vit dans la même base Neon
// (connect-pg-simple) pour survivre aux redémarrages de Render.
const session         = require('express-session');
const passport        = require('passport');
const GoogleStrategy  = require('passport-google-oauth20').Strategy;
const PgSession       = require('connect-pg-simple')(session);
const { Pool }        = require('pg');

const IS_PROD = process.env.NODE_ENV === 'production';

// En prod, refuser de démarrer sans secret de session (cookies non sûrs sinon).
if (IS_PROD && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET manquant en production — démarrage refusé.');
}

// Pool PG dédié au store de session (Neon impose SSL).
const sessionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sessionMiddleware = session({
  name:  'squizz.sid',
  store: new PgSession({ pool: sessionPool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure:   IS_PROD,                 // Render termine le HTTPS en amont
    maxAge:   30 * 24 * 60 * 60 * 1000, // 30 jours
  },
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// ── Partage de la session Express avec Socket.io ──────────────
// Indispensable pour identifier req.user (compte Google) dans le handshake
// socket. Le pseudo/avatar VISIBLE reste celui envoyé par le client (override
// possible) ; userId est dérivé de la session côté serveur — JAMAIS du client.
io.engine.use(sessionMiddleware);
io.engine.use(passport.initialize());
io.engine.use(passport.session());

// Stratégie Google : upsert d'un User par googleId à chaque connexion.
passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  '/auth/google/callback',
  proxy:        true,   // construit le redirect_uri en https derrière le proxy Render
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const googleId    = profile.id;
    const email       = profile.emails?.[0]?.value || null;
    const displayName = profile.displayName || email || 'Joueur';
    const avatarUrl   = profile.photos?.[0]?.value || null;
    const user = await prisma.user.upsert({
      where:  { googleId },
      create: { googleId, email, displayName, avatarUrl },
      update: { displayName, avatarUrl, email, lastLoginAt: new Date() },
    });
    done(null, user);
  } catch (err) {
    done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user || false);
  } catch (err) {
    done(err);
  }
});

// ── Routes d'authentification Google ──────────────────────────
// Rate-limit léger dédié à /auth/* (les routes /api/* ont déjà apiLimiter).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      60,
  standardHeaders: true,
  legacyHeaders:   false,
});
app.use('/auth/', authLimiter);

// N'autorise qu'un chemin interne comme returnTo (anti open-redirect).
function safeReturnTo(rt) {
  return (typeof rt === 'string' && rt.startsWith('/') && !rt.startsWith('//')) ? rt : null;
}

// Vérif d'origine minimale pour les POST sensibles. Le cookie sameSite=lax
// empêche déjà l'envoi cross-site, c'est une ceinture+bretelles.
function sameOrigin(req) {
  const src = req.headers.origin || req.headers.referer;
  if (!src) return true; // pas d'en-tête → sameSite protège déjà
  try { return new URL(src).host === req.headers.host; }
  catch { return false; }
}

// Démarre l'OAuth. ?returnTo=/lobby/CODE est mémorisé pour la redirection finale.
app.get('/auth/google', (req, res, next) => {
  const rt = safeReturnTo(req.query.returnTo);
  if (rt) req.session.returnTo = rt;
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// Retour de Google : succès → returnTo || '/' ; échec → accueil avec drapeau.
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/?login=fail' }),
  (req, res) => {
    const rt = safeReturnTo(req.session.returnTo);
    delete req.session.returnTo;
    res.redirect(rt || '/');
  });

// Déconnexion (POST + cookie). Détruit la session côté serveur et le cookie.
app.post('/auth/logout', (req, res) => {
  if (!sameOrigin(req)) {
    return res.status(403).json({ ok: false, error: 'Origine invalide' });
  }
  req.logout(err => {
    if (err) return res.status(500).json({ ok: false, error: 'Échec déconnexion' });
    req.session.destroy(() => {
      res.clearCookie('squizz.sid');
      res.json({ ok: true });
    });
  });
});

// État de connexion pour le front (public, léger). Ne renvoie jamais de donnée
// sensible (pas de googleId, pas de tokens).
app.get('/api/me', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    const u = req.user;
    return res.json({
      authenticated: true,
      user: {
        id:              u.id,
        displayName:     u.displayName,
        pseudo:          u.pseudo,           // null tant que non choisi (1ère connexion)
        avatarUrl:       u.avatarUrl,
        email:           u.email,
        preferredLocale: u.preferredLocale,
      },
    });
  }
  res.json({ authenticated: false });
});

// Validation d'un choix de pseudo (longueur 3..16, charset sûr, profanité).
// Renvoie { ok, pseudo, pseudoKey } ou { ok:false, reason } (clé i18n).
function validatePseudoChoice(raw) {
  const pseudo = String(raw == null ? '' : raw).trim();
  if (pseudo.length < 3 || pseudo.length > 16) return { ok: false, reason: 'pseudo.err.length' };
  if (!/^[a-zA-Z0-9._-]+$/.test(pseudo))        return { ok: false, reason: 'pseudo.err.charset' };
  if (isReservedPseudo(pseudo) || containsProfanity(pseudo)) return { ok: false, reason: 'pseudo.err.profanity' };
  return { ok: true, pseudo, pseudoKey: pseudo.toLowerCase() };
}

// Disponibilité d'un pseudo (auth requise — appelé pendant le choix/édition).
app.get('/api/me/pseudo/available', async (req, res) => {
  if (!(req.isAuthenticated && req.isAuthenticated() && req.user)) {
    return res.status(401).json({ available: false, reason: 'pseudo.err.auth' });
  }
  const v = validatePseudoChoice(req.query.p);
  if (!v.ok) return res.json({ available: false, reason: v.reason });
  try {
    const existing = await prisma.user.findUnique({ where: { pseudoKey: v.pseudoKey }, select: { id: true } });
    if (existing && existing.id !== req.user.id) return res.json({ available: false, reason: 'pseudo.taken' });
    res.json({ available: true });
  } catch (err) {
    res.status(500).json({ available: false, reason: 'pseudo.err.server' });
  }
});

// Définit / modifie le pseudo du compte connecté.
app.post('/api/me/pseudo', async (req, res) => {
  if (!(req.isAuthenticated && req.isAuthenticated() && req.user)) {
    return res.status(401).json({ ok: false, reason: 'pseudo.err.auth' });
  }
  const v = validatePseudoChoice(req.body && req.body.pseudo);
  if (!v.ok) return res.status(400).json({ ok: false, reason: v.reason });
  try {
    const existing = await prisma.user.findUnique({ where: { pseudoKey: v.pseudoKey }, select: { id: true } });
    // 409 Conflict : pseudo déjà utilisé par un AUTRE compte connecté.
    if (existing && existing.id !== req.user.id) return res.status(409).json({ ok: false, reason: 'pseudo.taken' });
    const u = await prisma.user.update({
      where: { id: req.user.id },
      data:  { pseudo: v.pseudo, pseudoKey: v.pseudoKey },
    });
    res.json({ ok: true, user: { id: u.id, pseudo: u.pseudo, displayName: u.displayName, avatarUrl: u.avatarUrl } });
  } catch (err) {
    // Course possible sur l'unique → P2002
    if (err && err.code === 'P2002') return res.status(409).json({ ok: false, reason: 'pseudo.taken' });
    console.warn('[pseudo] échec:', err.message);
    res.status(500).json({ ok: false, reason: 'pseudo.err.server' });
  }
});

// ── Leaderboard (public) ──────────────────────────────────────
// ?period=week|month (7 / 30 jours, défaut week)
// ?scope=verified|all   (défaut verified)
//   verified : uniquement les résultats liés à un compte (userId), regroupés
//              par userId, displayName/avatar à jour depuis User.
//   all      : regroupés par pseudoKey (anonymes inclus). verified=true pour une
//              entrée seulement si TOUS ses résultats pointent vers le même
//              compte (un seul userId non nul).
app.get('/api/leaderboard', async (req, res) => {
  try {
    const period = req.query.period === 'month' ? 'month' : 'week';
    const days   = period === 'month' ? 30 : 7;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Réservé aux comptes connectés : on classe par userId, victoires décroissantes.
    const grouped = await prisma.gamePlayerResult.groupBy({
      by: ['userId'],
      where: { userId: { not: null }, won: true, createdAt: { gte: cutoff } },
      _count: { _all: true },
    });
    grouped.sort((a, b) => b._count._all - a._count._all);
    const top = grouped.slice(0, 10);
    const users = top.length
      ? await prisma.user.findMany({
          where: { id: { in: top.map(t => t.userId) } },
          select: { id: true, pseudo: true, displayName: true, avatarUrl: true },
        })
      : [];
    const byId = Object.fromEntries(users.map(u => [u.id, u]));
    const leaderboard = top.map((t, i) => ({
      rank:      i + 1,
      pseudo:    byId[t.userId]?.pseudo || byId[t.userId]?.displayName || '—',
      avatarUrl: byId[t.userId]?.avatarUrl || null,
      wins:      t._count._all,
      verified:  true,
    }));

    res.json({ ok: true, period, scope: 'verified', leaderboard });
  } catch (err) {
    console.warn('[leaderboard] échec:', err.message);
    res.status(500).json({ ok: false, error: 'Erreur leaderboard' });
  }
});

// Profil du joueur connecté (auth via session Google — PAS l'adminAuth).
app.get('/api/me/profile', async (req, res) => {
  if (!(req.isAuthenticated && req.isAuthenticated() && req.user)) {
    return res.status(401).json({ ok: false, error: 'Non authentifié' });
  }
  try {
    const u = req.user;
    const gamesPlayed = u.gamesPlayed || 0;
    const gamesWon    = u.gamesWon || 0;
    const totalScore  = u.totalScore || 0;
    const stats = {
      gamesPlayed,
      gamesWon,
      totalScore,
      winRate:  gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0,
      avgScore: gamesPlayed > 0 ? Math.round(totalScore / gamesPlayed) : 0,
    };
    const recent = await prisma.gamePlayerResult.findMany({
      where:   { userId: u.id },
      orderBy: { createdAt: 'desc' },
      take:    10,
      select:  { roomCode: true, score: true, won: true, createdAt: true },
    });
    res.json({
      ok: true,
      user: {
        id:              u.id,
        pseudo:          u.pseudo,
        displayName:     u.displayName,   // nom du compte Google (sous-texte)
        avatarUrl:       u.avatarUrl,
        email:           u.email,
        createdAt:       u.createdAt,
        preferredLocale: u.preferredLocale,
      },
      stats,
      recent,
    });
  } catch (err) {
    console.warn('[profile] échec:', err.message);
    res.status(500).json({ ok: false, error: 'Erreur profil' });
  }
});

// Persiste la langue préférée d'un joueur connecté (auth session requise).
app.post('/api/me/locale', async (req, res) => {
  if (!(req.isAuthenticated && req.isAuthenticated() && req.user)) {
    return res.status(401).json({ ok: false, error: 'Non authentifié' });
  }
  const locale = req.body && req.body.locale;
  if (!SUPPORTED_LANGS.includes(locale)) {
    return res.status(400).json({ ok: false, error: 'Locale invalide' });
  }
  try {
    await prisma.user.update({ where: { id: req.user.id }, data: { preferredLocale: locale } });
    res.json({ ok: true });
  } catch (err) {
    console.warn('[locale] échec:', err.message);
    res.status(500).json({ ok: false });
  }
});

// Page profil (fichier statique servi sur une URL propre).
app.get('/profil', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/profil.html'));
});

// ── Auth admin (session token, scrypt-free pour limiter les deps) ─
const ADMIN_PASSWORD_HASH = crypto.createHash('sha256')
  .update(process.env.ADMIN_PASSWORD || 'changeme_random_password_here')
  .digest('hex');
const adminTokens = new Map(); // token → expiryMs

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(String(pwd || '')).digest('hex');
}
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}
function purgeExpiredTokens() {
  const now = Date.now();
  for (const [t, exp] of adminTokens) if (exp < now) adminTokens.delete(t);
}
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Non authentifié' });
  }
  const token = auth.substring(7);
  const expiry = adminTokens.get(token);
  if (!expiry || expiry < Date.now()) {
    adminTokens.delete(token);
    return res.status(401).json({ ok: false, error: 'Token expiré' });
  }
  next();
}

// Rate-limit dédié au login admin (anti-brute-force).
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      5,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { ok: false, error: 'Trop de tentatives, réessayez plus tard.' },
});

// Sonde de santé légère (utilisée par Render pour le health check) — JSON pur,
// pas de HTML, pas d'authentification, pas de données sensibles.
app.get('/api/health', (req, res) => {
  res.json({
    ok:          true,
    uptime:      process.uptime(),
    activeRooms: Object.keys(rooms).length,
    timestamp:   Date.now(),
  });
});

app.get('/api/questions', async (req, res) => {
  try {
    const { theme, difficulty, type, limit } = req.query;
    const l = Math.min(parseInt(limit) || 10, 100);
    const questions = await prisma.question.findMany({
      where: {
        status: 'approved',
        ...(theme && { theme }),
        ...(difficulty && { difficulty }),
        ...(type && { type }),
      },
      take: l,
      select: { id: true, question: true, theme: true, difficulty: true, type: true },
    });
    res.json({ ok: true, questions });
  } catch (err) {
    console.error('[/api/questions]', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

// ── Endpoints Admin ──────────────────────────────────────────
app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!password || hashPassword(password) !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ ok: false, error: 'Mot de passe incorrect' });
  }
  purgeExpiredTokens();
  const token = generateToken();
  adminTokens.set(token, Date.now() + 24 * 60 * 60 * 1000);
  res.json({ ok: true, token });
});

app.post('/api/admin/logout', adminAuth, (req, res) => {
  const token = req.headers.authorization.substring(7);
  adminTokens.delete(token);
  res.json({ ok: true });
});

app.get('/api/admin/questions', adminAuth, async (req, res) => {
  try {
    const { theme, type, difficulty, stat, sort } = req.query;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const where = {};
    if (theme)      where.theme      = theme;
    if (type)       where.type       = type;
    if (difficulty) where.difficulty = difficulty;
    // Filtre statistique : 'never' est exprimable en SQL ; 'hard'/'easy'
    // dépendent d'un ratio → on pré-filtre sur timesShown>=5 puis on affine en JS.
    if (stat === 'never')                         where.timesShown = 0;
    else if (stat === 'hard' || stat === 'easy')  where.timesShown = { gte: 5 };
    // Recherche mot-clé : sur le texte des traductions (toute langue) + le label
    // (traduction géo et colonne legacy), insensible à la casse.
    if (q) {
      where.OR = [
        { translations: { some: { text:  { contains: q, mode: 'insensitive' } } } },
        { translations: { some: { label: { contains: q, mode: 'insensitive' } } } },
        { label: { contains: q, mode: 'insensitive' } },
      ];
    }

    let orderBy = { createdAt: 'desc' };
    if (sort === 'freq') orderBy = { timesShown: 'desc' };
    // 'rate' : tri appliqué côté JS (ratio non triable en SQL sans raw query).

    let questions = await prisma.question.findMany({ where, orderBy, take: q ? 100 : 500 });

    // successRate = timesCorrect / timesShown (null si jamais servie).
    questions = questions.map(q => ({
      ...q,
      successRate: q.timesShown > 0 ? Math.round((q.timesCorrect / q.timesShown) * 100) : null,
    }));
    if (stat === 'hard')      questions = questions.filter(q => q.successRate !== null && q.successRate < 40);
    else if (stat === 'easy') questions = questions.filter(q => q.successRate !== null && q.successRate >= 80);

    if (sort === 'rate') {
      questions.sort((a, b) => {
        if (a.successRate === null && b.successRate === null) return 0;
        if (a.successRate === null) return 1;   // « jamais servie » en dernier
        if (b.successRate === null) return -1;
        return a.successRate - b.successRate;    // les plus ratées en premier
      });
    }

    // Pagination (après filtres/tri JS pour rester cohérent avec hard/easy & rate).
    const page     = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 50));
    const total    = questions.length;
    const pageItems = questions.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    res.json({ ok: true, questions: pageItems, total, page, pageSize });
  } catch (err) {
    console.error('[GET /api/admin/questions]', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

// Détail d'une question + ses 3 traductions (fr/en/es ; null si absente).
app.get('/api/admin/questions/:id', adminAuth, async (req, res) => {
  try {
    const row = await prisma.question.findUnique({
      where: { id: req.params.id },
      include: { translations: true },
    });
    if (!row) return res.status(404).json({ ok: false, error: 'Question introuvable' });
    const translations = { fr: null, en: null, es: null };
    for (const t of row.translations) {
      if (translations[t.language] !== undefined) {
        translations[t.language] = {
          text: t.text || '', options: t.options || null,
          explanation: t.explanation || '', label: t.label || null, country: t.country || null,
        };
      }
    }
    const { translations: _omit, ...q } = row;
    res.json({ ok: true, question: { ...q, translations } });
  } catch (err) {
    console.error('[GET /api/admin/questions/:id]', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

// Normalise le payload d'une langue ; renvoie null si totalement vide (→ ignorée).
function normLangPayload(tr) {
  if (!tr || typeof tr !== 'object') return null;
  const text = typeof tr.text === 'string' ? tr.text.trim() : '';
  const options = Array.isArray(tr.options) ? tr.options.map(o => (o == null ? '' : String(o))) : null;
  const hasOpts = Array.isArray(options) && options.some(o => o.trim());
  const explanation = typeof tr.explanation === 'string' ? tr.explanation : '';
  const label = tr.label ? String(tr.label) : null;
  const country = tr.country ? String(tr.country) : null;
  if (!text && !hasOpts && !explanation && !label && !country) return null;
  return { text, options, explanation, label, country };
}

// Valide le payload multilingue (longueurs d'options identiques, correctIndex 0-3…).
// Renvoie { error } ou { provided } (map langue → payload normalisé).
function validateQuestionPayload({ type, correctIndex, translations, requireFr }) {
  const provided = {};
  for (const l of SUPPORTED_LANGS) { const n = normLangPayload(translations && translations[l]); if (n) provided[l] = n; }
  if (requireFr && !provided.fr) return { error: 'Le texte en français est requis.' };
  if (Object.keys(provided).length === 0) return { error: 'Au moins une langue doit être renseignée.' };

  if (type === 'qcm' || type === 'pixel') {
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      return { error: 'La bonne réponse (correctIndex) doit être un entier entre 0 et 3.' };
    }
    let len = null;
    for (const [l, n] of Object.entries(provided)) {
      if (!Array.isArray(n.options) || n.options.length !== 4) {
        return { error: `La langue ${l.toUpperCase()} doit avoir exactement 4 options.` };
      }
      if (n.options.some(o => !o.trim())) {
        return { error: `La langue ${l.toUpperCase()} a une option vide.` };
      }
      if (len === null) len = n.options.length;
      else if (n.options.length !== len) {
        return { error: 'Les options doivent avoir la même longueur dans toutes les langues (correctIndex est partagé).' };
      }
    }
  } else if (type === 'geo') {
    for (const n of Object.values(provided)) n.options = null; // géo : pas d'options
  }
  return { provided };
}

app.post('/api/admin/questions', adminAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const type = b.type;
    if (!['qcm', 'pixel', 'geo'].includes(type)) {
      return res.status(400).json({ ok: false, error: 'Type invalide' });
    }
    // Nouveau format multilingue (translations) ; sinon repli mono-langue legacy.
    const translations = b.translations || { fr: { text: b.question, options: b.options, explanation: b.explanation, label: b.label, country: b.country } };
    const correctIndex = (type === 'qcm' || type === 'pixel') ? b.correctIndex : null;
    const v = validateQuestionPayload({ type, correctIndex, translations, requireFr: true });
    if (v.error) return res.status(400).json({ ok: false, error: v.error });
    const provided = v.provided;
    const fr = provided.fr;
    const status = (b.status && ['draft', 'approved', 'reported', 'rejected'].includes(b.status)) ? b.status : 'approved';

    const created = await prisma.$transaction(async (tx) => {
      const qrow = await tx.question.create({
        data: {
          question:     fr.text.slice(0, 500),
          language:     'fr',
          type,
          theme:        b.theme || (type === 'geo' ? 'geo' : 'general'),
          difficulty:   b.difficulty || 'medium',
          options:      type === 'geo' ? null : fr.options,
          correctIndex,
          imageUrl:     type === 'pixel' ? (b.imageUrl || null) : null,
          credit:       type === 'pixel' ? (b.credit || null) : null,
          creditUrl:    type === 'pixel' ? (b.creditUrl || null) : null,
          license:      type === 'pixel' ? (b.license || null) : null,
          lat:          type === 'geo' ? (Number.isFinite(b.lat) ? b.lat : null) : null,
          lng:          type === 'geo' ? (Number.isFinite(b.lng) ? b.lng : null) : null,
          label:        fr.label,
          country:      fr.country,
          explanation:  fr.explanation,
          status,
          source:       'admin',
        },
      });
      for (const [l, n] of Object.entries(provided)) {
        await tx.questionTranslation.create({
          data: { questionId: qrow.id, language: l, text: n.text, options: type === 'geo' ? null : n.options, explanation: n.explanation, label: n.label, country: n.country },
        });
      }
      return qrow;
    });
    await reloadQuestionStore();
    res.json({ ok: true, question: created });
  } catch (err) {
    console.error('[POST /api/admin/questions]', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

// Édition MULTILINGUE : met à jour les champs neutres de la question + upsert des
// 3 traductions, en transaction. Validations strictes (cf. validateQuestionPayload).
app.put('/api/admin/questions/:id', adminAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const id = req.params.id;
    const existing = await prisma.question.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ ok: false, error: 'Question introuvable' });
    const type = ['qcm', 'pixel', 'geo'].includes(b.type) ? b.type : existing.type;

    const translations = b.translations || {};
    const correctIndex = (type === 'qcm' || type === 'pixel')
      ? (Number.isInteger(b.correctIndex) ? b.correctIndex : existing.correctIndex)
      : null;
    const v = validateQuestionPayload({ type, correctIndex, translations, requireFr: false });
    if (v.error) return res.status(400).json({ ok: false, error: v.error });
    const provided = v.provided;
    const fr = provided.fr;

    await prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id },
        data: {
          type,
          ...(b.theme && { theme: b.theme }),
          ...(b.difficulty && { difficulty: b.difficulty }),
          ...(b.status && ['draft', 'approved', 'reported', 'rejected'].includes(b.status) && { status: b.status }),
          correctIndex: (type === 'qcm' || type === 'pixel') ? correctIndex : null,
          ...(type === 'pixel' ? { imageUrl: b.imageUrl || null, credit: b.credit || null, creditUrl: b.creditUrl || null, license: b.license || null } : {}),
          ...(type === 'geo'   ? { lat: Number.isFinite(b.lat) ? b.lat : null, lng: Number.isFinite(b.lng) ? b.lng : null } : {}),
          // Colonnes legacy (fallback serveur) alignées sur le FR si fourni.
          ...(fr ? { question: fr.text.slice(0, 500), options: type === 'geo' ? null : fr.options, explanation: fr.explanation, label: fr.label, country: fr.country } : {}),
        },
      });
      for (const [l, n] of Object.entries(provided)) {
        await tx.questionTranslation.upsert({
          where:  { questionId_language: { questionId: id, language: l } },
          create: { questionId: id, language: l, text: n.text, options: type === 'geo' ? null : n.options, explanation: n.explanation, label: n.label, country: n.country },
          update: { text: n.text, options: type === 'geo' ? null : n.options, explanation: n.explanation, label: n.label, country: n.country },
        });
      }
    });
    await reloadQuestionStore();
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/admin/questions/:id]', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

app.delete('/api/admin/questions/:id', adminAuth, async (req, res) => {
  try {
    await prisma.question.delete({ where: { id: req.params.id } });
    await reloadQuestionStore();
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/admin/questions/:id]', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

// ── Actions en masse ──────────────────────────────────────────
// Valide une liste d'ids (tableau de strings, 1..200).
function sanitizeBulkIds(raw) {
  const ids = Array.isArray(raw) ? raw.filter(x => typeof x === 'string' && x) : [];
  return [...new Set(ids)];
}

app.post('/api/admin/questions/bulk-status', adminAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const ids = sanitizeBulkIds(b.ids);
    if (!ids.length)      return res.status(400).json({ ok: false, error: 'Aucune question sélectionnée' });
    if (ids.length > 200) return res.status(400).json({ ok: false, error: 'Trop d\'éléments (max 200)' });
    if (!['approved', 'draft', 'rejected'].includes(b.status)) {
      return res.status(400).json({ ok: false, error: 'Statut invalide' });
    }
    console.warn(`[ADMIN BULK] actor=admin action=status status=${b.status} count=${ids.length} t=${new Date().toISOString()} ids=${ids.join(',')}`);
    // updateMany = une seule requête atomique ; ignore les ids inexistants.
    const r = await prisma.question.updateMany({ where: { id: { in: ids } }, data: { status: b.status } });
    await reloadQuestionStore();
    res.json({ ok: true, count: r.count });
  } catch (err) {
    console.error('[POST /api/admin/questions/bulk-status]', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

app.post('/api/admin/questions/bulk-delete', adminAuth, async (req, res) => {
  try {
    const ids = sanitizeBulkIds((req.body || {}).ids);
    if (!ids.length)      return res.status(400).json({ ok: false, error: 'Aucune question sélectionnée' });
    if (ids.length > 200) return res.status(400).json({ ok: false, error: 'Trop d\'éléments (max 200)' });
    console.warn(`[ADMIN BULK] actor=admin action=delete count=${ids.length} t=${new Date().toISOString()} ids=${ids.join(',')}`);
    // deleteMany = atomique ; cascade sur translations & reports (onDelete: Cascade).
    const r = await prisma.question.deleteMany({ where: { id: { in: ids } } });
    await reloadQuestionStore();
    res.json({ ok: true, count: r.count });
  } catch (err) {
    console.error('[POST /api/admin/questions/bulk-delete]', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

// ── Signalements (Phase 5) ────────────────────────────────────
// Rate-limit dédié pour /api/report : 10/min/IP. On veut bloquer un
// joueur qui spammerait le bouton mais rester généreux côté UX.
const reportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { ok: false, error: 'Trop de signalements, réessayez dans 1 minute.' },
});
const REPORT_CATEGORIES = ['translation', 'wrong_answer', 'typo', 'other'];

app.post('/api/report', reportLimiter, async (req, res) => {
  try {
    const b = req.body || {};
    const questionId = typeof b.questionId === 'string' ? b.questionId.trim() : '';
    if (!questionId) {
      return res.status(400).json({ ok: false, error: 'questionId requis' });
    }
    const category = REPORT_CATEGORIES.includes(b.category) ? b.category : null;
    if (!category) {
      return res.status(400).json({ ok: false, error: 'category invalide' });
    }
    const language = SUPPORTED_LANGS.includes(b.language) ? b.language : null;
    const roomCode = (typeof b.roomCode === 'string' && validRoomCode(b.roomCode)) ? b.roomCode : null;
    let comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 500) : '';
    if (!comment) comment = null;

    // Vérifie l'existence de la question
    const q = await prisma.question.findUnique({ where: { id: questionId }, select: { id: true } });
    if (!q) return res.status(400).json({ ok: false, error: 'Question introuvable' });

    await prisma.questionReport.create({
      data: { questionId, category, comment, language, roomCode, status: 'open' },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/report]', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

app.get('/api/admin/reports', adminAuth, async (req, res) => {
  try {
    const reports = await prisma.questionReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        question: {
          select: {
            id: true, type: true, theme: true,
            question: true, language: true,
            translations: {
              select: { language: true, text: true },
            },
          },
        },
      },
    });
    // On ré-écrit chaque report avec un extrait de la question dans la
    // langue signalée (fallback FR puis première dispo).
    const out = reports.map(r => {
      const trMap = {};
      for (const t of (r.question?.translations || [])) trMap[t.language] = t.text;
      const order = [r.language, 'fr', 'en', ...Object.keys(trMap)];
      let preview = '';
      for (const l of order) { if (l && trMap[l]) { preview = trMap[l]; break; } }
      if (!preview) preview = r.question?.question || '(question supprimée)';
      return {
        id:         r.id,
        questionId: r.questionId,
        category:   r.category,
        comment:    r.comment,
        language:   r.language,
        roomCode:   r.roomCode,
        status:     r.status,
        createdAt:  r.createdAt,
        questionPreview: preview,
        questionType:    r.question?.type  || null,
        questionTheme:   r.question?.theme || null,
      };
    });
    const openCount = out.filter(r => r.status === 'open').length;
    res.json({ ok: true, reports: out, openCount, total: out.length });
  } catch (err) {
    console.error('[GET /api/admin/reports]', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

app.patch('/api/admin/reports/:id', adminAuth, async (req, res) => {
  try {
    const b = req.body || {};
    if (b.status !== 'resolved' && b.status !== 'open') {
      return res.status(400).json({ ok: false, error: 'status invalide' });
    }
    await prisma.questionReport.update({
      where: { id: req.params.id },
      data:  { status: b.status },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/admin/reports/:id]', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

app.delete('/api/admin/reports/:id', adminAuth, async (req, res) => {
  try {
    await prisma.questionReport.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/admin/reports/:id]', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const counts = cacheStats();
    const total  = await prisma.question.count();
    const openReports = await prisma.questionReport.count({ where: { status: 'open' } });
    res.json({
      ok:    true,
      cache: counts,
      total,
      openReports,
      activeRooms: Object.keys(rooms).length,
      uptime:      process.uptime(),
    });
  } catch (err) {
    console.error('[GET /api/admin/stats]', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

// Vue d'ensemble du tableau de bord admin (KPIs + répartitions + activité récente).
app.get('/api/admin/stats/overview', adminAuth, async (req, res) => {
  try {
    const [
      questions, questionsApproved, gameSessions, reportsOpen, reportsTotal,
      trByLang, byType, byDifficulty, byTheme, recentSessions, recentReports,
      historyTotal, historyDistinct,
    ] = await Promise.all([
      prisma.question.count(),
      prisma.question.count({ where: { status: 'approved' } }),
      prisma.gameSession.count(),
      prisma.questionReport.count({ where: { status: 'open' } }),
      prisma.questionReport.count(),
      prisma.questionTranslation.groupBy({ by: ['language'], _count: { _all: true } }),
      prisma.question.groupBy({ by: ['type'],       _count: { _all: true } }),
      prisma.question.groupBy({ by: ['difficulty'], _count: { _all: true } }),
      prisma.question.groupBy({ by: ['theme'],      _count: { _all: true } }),
      prisma.gameSession.findMany({
        orderBy: { startedAt: 'desc' }, take: 5,
        select: { id: true, roomCode: true, startedAt: true, endedAt: true, playerNames: true },
      }),
      prisma.questionReport.findMany({
        orderBy: { createdAt: 'desc' }, take: 5,
        include: { question: { select: { question: true, translations: { select: { language: true, text: true } } } } },
      }),
      // Anti-répétition niveau 2 : volume d'historique + couverture du pool.
      prisma.userQuestionHistory.count(),
      prisma.userQuestionHistory.groupBy({ by: ['questionId'], _count: { _all: true } }),
    ]);
    const historyCoverage = Array.isArray(historyDistinct) ? historyDistinct.length : 0;

    const translationsByLang = { fr: 0, en: 0, es: 0 };
    for (const r of trByLang) if (translationsByLang[r.language] !== undefined) translationsByLang[r.language] = r._count._all;

    const mapCount = (rows, key) =>
      rows.map(r => ({ [key]: r[key], count: r._count._all })).sort((a, b) => b.count - a.count);

    const recent = {
      gameSessions: recentSessions.map(s => ({
        id: s.id, roomCode: s.roomCode, startedAt: s.startedAt, endedAt: s.endedAt,
        playerCount: Array.isArray(s.playerNames) ? s.playerNames.length : 0,
      })),
      reports: recentReports.map(r => {
        const trMap = {};
        for (const t of (r.question?.translations || [])) trMap[t.language] = t.text;
        const excerpt = trMap.fr || trMap.en || trMap.es || r.question?.question || '(question supprimée)';
        return { id: r.id, category: r.category, status: r.status, createdAt: r.createdAt, questionExcerpt: String(excerpt).slice(0, 80) };
      }),
    };

    res.json({
      ok: true,
      totals: { questions, questionsApproved, translationsByLang, gameSessions, reportsOpen, reportsTotal, historyTotal, historyCoverage },
      breakdown: {
        byType:       mapCount(byType, 'type'),
        byDifficulty: mapCount(byDifficulty, 'difficulty'),
        byTheme:      mapCount(byTheme, 'theme'),
      },
      recent,
    });
  } catch (err) {
    console.error('[GET /api/admin/stats/overview]', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

// ── Rooms ─────────────────────────────────────────────────────
const rooms = {};

// Code de room : 6 caractères tirés cryptographiquement, charset sans
// confusions (pas de I/O/0/1). En cas de collision improbable, on retire.
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let code = 'QR-';
  for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length];
  if (rooms[code]) return generateCode();
  return code;
}

// ── Validation des entrées socket (F3) ────────────────────────
const CHAT_MAX = 200;

function validRoomCode(s) {
  return typeof s === 'string' && /^QR-[A-Z2-9]{6}$/.test(s);
}
function validAnswerIndex(i) {
  return Number.isInteger(i) && i >= 0 && i <= 10;
}
function validBet(b, max) {
  return Number.isInteger(b) && b >= 0 && b <= max;
}
function validLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
      && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
function validAvatar(a) {
  if (!a || typeof a !== 'object') return false;
  if (!Number.isInteger(a.colorIdx) || a.colorIdx < 0 || a.colorIdx > 20) return false;
  if (typeof a.emoji !== 'string' || a.emoji.length > 8) return false;
  return true;
}
function validSettingsObj(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
  // Tolérant : on accepte les champs partiels (l'hôte peut envoyer 1 seule clé).
  // On rejette uniquement les types clairement faux.
  if (s.themes !== undefined && !Array.isArray(s.themes)) return false;
  if (s.rounds !== undefined && !Array.isArray(s.rounds)) return false;
  if (s.difficulty !== undefined && typeof s.difficulty !== 'string') return false;
  if (s.teamMode !== undefined && typeof s.teamMode !== 'boolean') return false;
  if (s.numTeams !== undefined && (!Number.isInteger(s.numTeams) || s.numTeams < 2 || s.numTeams > 4)) return false;
  if (s.questionsPerRound !== undefined && (typeof s.questionsPerRound !== 'object' || Array.isArray(s.questionsPerRound))) return false;
  return true;
}

// ── Rate-limit Socket.io (F4) ─────────────────────────────────
// Stockage mémoire (single-instance OK sur Render free tier).
const socketRateLimits = new Map();    // socket.id -> { chatCount, chatResetAt, actionCount, actionResetAt }
const ipRoomCreations  = new Map();    // ip -> { count, resetAt }

function getClientIp(socket) {
  // Derrière un proxy (Render), socket.handshake.address pointe sur le proxy.
  // L'IP réelle est dans x-forwarded-for.
  const xff = socket.handshake.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return socket.handshake.address || '';
}
function getOrInitRate(socket) {
  let d = socketRateLimits.get(socket.id);
  if (!d) {
    const now = Date.now();
    d = { chatCount: 0, chatResetAt: now + 10000, actionCount: 0, actionResetAt: now + 1000 };
    socketRateLimits.set(socket.id, d);
  }
  return d;
}
function checkChatRate(socket) {
  const d = getOrInitRate(socket);
  const now = Date.now();
  if (now > d.chatResetAt) { d.chatCount = 0; d.chatResetAt = now + 10000; }
  if (d.chatCount >= 5) { socket.emit('rate_limited', { until: d.chatResetAt }); return false; }
  d.chatCount++;
  return true;
}
function checkActionRate(socket) {
  const d = getOrInitRate(socket);
  const now = Date.now();
  if (now > d.actionResetAt) { d.actionCount = 0; d.actionResetAt = now + 1000; }
  if (d.actionCount >= 10) { socket.emit('rate_limited', { until: d.actionResetAt }); return false; }
  d.actionCount++;
  return true;
}
function checkIpRoomCreate(socket) {
  const ip = getClientIp(socket);
  const now = Date.now();
  let d = ipRoomCreations.get(ip) || { count: 0, resetAt: now + 60000 };
  if (now > d.resetAt) { d.count = 0; d.resetAt = now + 60000; }
  if (d.count >= 3) { socket.emit('join_error', 'Trop de salons créés. Réessayez dans 1 minute.'); return false; }
  d.count++;
  ipRoomCreations.set(ip, d);
  return true;
}

// ── Helpers jeu ───────────────────────────────────────────────

function checkAllAnswered(code) {
  const room = rooms[code];
  if (!room || room.nextScheduled || room.players.length === 0) return;

  let allDone = false;
  if (room.settings.teamMode) {
    const answeredTeams = new Set(Object.keys(room.teamAnswers));
    allDone = answeredTeams.size >= room.teams.length;
  } else {
    const answeredCount = room.players.filter(p => room.answers[p.name] !== undefined).length;
    allDone = answeredCount >= room.players.length;
  }
  if (allDone) endQuestion(code);
}

// Enregistre la question terminée dans l'historique de la partie (récap de fin de quiz).
function recordQuestionHistory(room, round, q) {
  if (!Array.isArray(room.history)) room.history = [];
  const isGeo = q.type === 'geomap';
  const qk = qKey(q, room.currentQuestion);
  const results = room.players.map(p => {
    const a = room.answers[p.name];
    const entry = {
      name:    p.name,
      avatar:  p.avatar,
      answered: a !== undefined,
      correct: !!a?.correct,
      points:  a?.points || 0,
    };
    if (isGeo) {
      entry.distance = (a && a.distance != null) ? Math.round(a.distance) : null;
    } else {
      // Le récap (room.history) est partagé et rendu en ordre CANONIQUE
      // (correctIndex + translations d'origine). L'answerIndex du joueur est en
      // ordre MÉLANGÉ → on le reconvertit en index canonique via sa permutation
      // (perm[display] = index d'origine choisi). Sinon le récap afficherait la
      // mauvaise réponse pour les joueurs ayant eu un mélange.
      const map  = room.optionOrders?.[p.name]?.[qk];
      const disp = a?.answerIndex;
      const canonical = (map && disp != null && map.permutation[disp] != null)
        ? map.permutation[disp]
        : (disp ?? null);
      entry.answerIndex = canonical;
      entry.answer      = (canonical != null) ? q.options?.[canonical] : null;
    }
    return entry;
  });
  room.history.push({
    questionId:    q.id || null,
    round:         round.name,
    type:          q.type || 'normal',
    correctIndex:  q.correctIndex ?? null,
    question:      q.question,
    correctAnswer: isGeo ? (q.label || q.country || '—') : (q.options?.[q.correctIndex] ?? '—'),
    translations:  q.translations || null,
    results,
  });
}

// Termine la question en cours (appelé soit par checkAllAnswered, soit par le force-timeout).
// Émet le reveal puis bascule sur l'écran de résultats, puis ATTEND le host avant d'avancer.
function endQuestion(code) {
  const room = rooms[code];
  if (!room || room.nextScheduled) return;
  room.nextScheduled = true;

  const round = currentRound(room);
  const q = round?.questions[room.currentQuestion];
  if (q) recordQuestionHistory(room, round, q);

  // 1. Reveal de la question (selon le type) — diffusé à TOUTE la room
  //    pour que chacun (même ceux qui n'ont pas répondu) voie la correction,
  //    l'anecdote et le statut juste/faux des avatars.
  if (q?.type === 'geomap') {
    io.to(code).emit('geomap_reveal', {
      questionId:   q.id || null,
      correctLat:   q.lat,
      correctLng:   q.lng,
      correctLabel: q.label,
      country:      q.country,
      explanation:  q.explanation || '',
      translations: q.translations || null,
      guesses: room.players.map(p => ({
        name:     p.name,
        avatar:   p.avatar,
        lat:      room.answers[p.name]?.lat,
        lng:      room.answers[p.name]?.lng,
        distance: room.answers[p.name]?.distance,
        points:   room.answers[p.name]?.points || 0,
        correct:  !!room.answers[p.name]?.correct,
        answered: room.answers[p.name] !== undefined,
      })),
    });
  } else if (q) {
    // Reveal PAR JOUEUR : chacun reçoit l'index correct DANS SON ORDRE propre
    // (displayedCorrectIndex) + ses translations mélangées, pour que le
    // surlignage vert tombe juste même si les ordres diffèrent.
    const qk = qKey(q, room.currentQuestion);
    const results = room.players.map(p => ({
      name:     p.name,
      answered: room.answers[p.name] !== undefined,
      correct:  !!room.answers[p.name]?.correct,
    }));
    for (const p of room.players) {
      const map = room.optionOrders?.[p.name]?.[qk];
      const dci = map ? map.displayedCorrectIndex : (q.correctIndex ?? null);
      const trP = map ? shuffledTranslations(q.translations, map.permutation) : (q.translations || null);
      io.to(p.id).emit('question_reveal', {
        questionId:    q.id || null,
        question:      q.question,
        correctIndex:  dci,
        correctAnswer: q.options?.[q.correctIndex] ?? '',
        explanation:   q.explanation || '',
        translations:  trP,
        results,
      });
    }
  }

  room.phase = 'scores';
  room.questionStartTime = null;

  // 2. Après une courte pause pour laisser voir le reveal, on bascule sur l'écran de transition
  //    et on attend l'hôte
  const revealPause = q?.type === 'geomap' ? 2500 : 800;
  setTimeout(() => {
    if (!rooms[code]) return;
    const isLastInRound = room.currentQuestion + 1 >= round.questions.length;
    const isLastRound   = room.currentRound + 1 >= room.roundPlan.length;
    const isGameOver    = isLastInRound && isLastRound;

    // Pour les questions classiques : on affiche un écran de scores intermédiaire
    // (la carte geomap reste affichée avec son propre reveal)
    if (q?.type !== 'geomap') {
      if (isLastInRound && !isGameOver) {
        // Fin de manche intermédiaire : intermezzo (les scores y sont)
        const nextRound = room.roundPlan[room.currentRound + 1];
        io.to(code).emit('round_ended', {
          roundName:    round.name,
          nextRound:    nextRound.name,
          nextRoundIdx: room.currentRound + 1,
          totalRounds:  room.roundPlan.length,
          players:      publicPlayers(room),
          teams:        room.teams,
          teamMode:     room.settings.teamMode,
        });
      } else {
        // Mid-round (ou dernière question d'un game) : screen-scores
        io.to(code).emit('scores_update', {
          players:  publicPlayers(room),
          teams:    room.teams,
          teamMode: room.settings.teamMode,
        });
      }
    } else if (isLastInRound && !isGameOver) {
      // Geomap fin de manche intermédiaire : on émet round_ended pour switch sur intermezzo
      const nextRound = room.roundPlan[room.currentRound + 1];
      io.to(code).emit('round_ended', {
        roundName:    round.name,
        nextRound:    nextRound.name,
        nextRoundIdx: room.currentRound + 1,
        totalRounds:  room.roundPlan.length,
        players:      publicPlayers(room),
        teams:        room.teams,
        teamMode:     room.settings.teamMode,
      });
    }
    // Geomap mid-round ou dernière de la partie : on reste sur screen-geomap

    awaitHost(code);
  }, revealPause);
}

// Attend que l'hôte clique "Suivante" (ou fallback 30s)
function awaitHost(code) {
  const room = rooms[code];
  if (!room) return;
  const round = currentRound(room);
  if (!round) return;

  const isLastInRound = room.currentQuestion + 1 >= round.questions.length;
  const isLastRound   = room.currentRound + 1 >= room.roundPlan.length;
  const isGameOver    = isLastInRound && isLastRound;

  let label = 'Question suivante';
  if (isGameOver)        label = '🏆 Voir le classement';
  else if (isLastInRound) label = '➡️ Manche suivante';

  room.waitingForHost  = true;
  room.awaitingPayload = { label, isGameOver, isLastInRound };
  io.to(code).emit('awaiting_host', room.awaitingPayload);

  if (room.hostTimeout) clearTimeout(room.hostTimeout);
  room.hostTimeout = setTimeout(() => {
    if (rooms[code]?.waitingForHost) advance(code);
  }, 30000);
}

// Déclenche le passage à la suite (host click ou fallback)
function advance(code) {
  const room = rooms[code];
  if (!room || !room.waitingForHost) return;
  if (room.hostTimeout) { clearTimeout(room.hostTimeout); room.hostTimeout = null; }
  room.waitingForHost = false;

  const round = currentRound(room);
  if (!round) return;
  const wasLastInRound = room.currentQuestion + 1 >= round.questions.length;
  const wasLastRound   = room.currentRound + 1 >= room.roundPlan.length;

  // Manche raccourcie (réservoir épuisé) : on signale discrètement au client.
  if (wasLastInRound && round.qCount && round.questions.length < round.qCount) {
    io.to(code).emit('round_exhausted', { roundName: round.name });
  }

  if (wasLastInRound && wasLastRound) {
    doGameOver(code);
  } else if (wasLastInRound) {
    room.currentRound++;
    room.currentQuestion = 0;
    startRound(code, room.currentRound);
  } else {
    room.currentQuestion++;
    sendQuestion(code);
  }
}

function doGameOver(code) {
  const room = rooms[code];
  if (!room) return;
  finalizeGameSession(room);   // endedAt = now (traçabilité, fire-and-forget)
  const ranking = room.settings.teamMode
    ? [...room.teams].sort((a, b) => b.score - a.score)
    : [...room.players].sort((a, b) => b.score - a.score).map(publicPlayer);
  room.phase = 'over';
  io.to(code).emit('game_over', {
    ranking,
    teamMode: room.settings.teamMode,
    history:  room.history || [],
  });
  // Persistance des résultats (leaderboard/profil) AVANT la remise à zéro des
  // scores plus bas. Fire-and-forget, n'impacte jamais le gameflow.
  recordGameResults(room, code);
  // On garde la room en vie pour permettre le retour au lobby et rejouer
  room.started           = false;
  room.currentRound      = 0;
  room.currentQuestion   = 0;
  room.roundPlan         = [];
  room.answers           = {};
  room.teamAnswers       = {};
  room.questionStartTime = null;
  room.pariMiserDone     = {};
  room.waitingForHost    = false;
  room.phase             = null;
  room.optionOrders      = {};   // purge des permutations de réponses
  room.players.forEach(p => { p.score = 0; });
  if (room.teams) room.teams.forEach(t => { t.score = 0; });
  console.log(`🔁 Room ${code} : partie terminée, retour au lobby possible`);
}

// Enregistre un GamePlayerResult par joueur + incrémente les stats agrégées des
// comptes connectés. Règles : parties solo (< 2 joueurs) NON comptées ;
// userId vient TOUJOURS du serveur (player.userId), jamais du client.
// Fire-and-forget : try/catch, n'impacte jamais le jeu.
function recordGameResults(room, code) {
  if (!room || !Array.isArray(room.players) || room.players.length < 2) return;
  const teamMode = !!room.settings.teamMode;

  // Détermine l'équipe gagnante (sans victoire en cas d'égalité d'équipes).
  let winningTeamId = null;
  if (teamMode && Array.isArray(room.teams) && room.teams.length) {
    const maxT = Math.max(...room.teams.map(t => t.score || 0));
    const top  = room.teams.filter(t => (t.score || 0) === maxT);
    if (maxT > 0 && top.length === 1) winningTeamId = top[0].id;
  }
  const maxScore = Math.max(...room.players.map(p => p.score || 0));

  const rows = room.players.map(p => ({
    pseudo:    p.name,
    pseudoKey: String(p.name || '').trim().toLowerCase(),
    score:     p.score || 0,
    won:       teamMode
                 ? (winningTeamId !== null && p.teamId === winningTeamId)
                 : (maxScore > 0 && (p.score || 0) === maxScore),
    roomCode:  code,
    userId:    p.userId || null,
  }));

  (async () => {
    try {
      const ops = [prisma.gamePlayerResult.createMany({ data: rows })];
      for (const r of rows) {
        if (!r.userId) continue;
        ops.push(prisma.user.update({
          where: { id: r.userId },
          data: {
            gamesPlayed: { increment: 1 },
            gamesWon:    r.won ? { increment: 1 } : undefined,
            totalScore:  { increment: r.score },
          },
        }));
      }
      await prisma.$transaction(ops);
      const verifiedCount = rows.filter(r => r.userId).length;
      console.log(`📊 Résultats enregistrés : ${rows.length} joueur(s) (${verifiedCount} vérifié(s)) — room ${code}`);
    } catch (err) {
      console.warn(`[GameResult] enregistrement échoué (room ${code}):`, err.message);
    }
  })();
}

// ── Traçabilité GameSession (fire-and-forget : ne bloque JAMAIS le jeu) ───────
// L'autorité anti-répétition reste room.servedQuestionIds (mémoire). Ici on ne
// fait QUE tracer en base, sans jamais propager une erreur DB au gameflow.
// roomCode est @unique au schéma → on suffixe d'un timestamp pour avoir UNE
// GameSession par partie (une même room peut enchaîner plusieurs parties).
function ensureGameSession(room, code) {
  if (!room || room.gameSessionKey) return;
  const key = `${code}-${Date.now()}`;
  room.gameSessionKey = key;
  room.gsReady = prisma.gameSession.create({
    data: {
      roomCode:    key,
      playerNames: (room.players || []).map(p => p.name),
      settings:    room.settings || {},
      questionIds: [...(room.servedOrder || [])],
    },
  }).catch(err => console.warn(`[GameSession] create ${key} fail:`, err.message));
}

function persistServedQuestion(room, code) {
  if (!room) return;
  ensureGameSession(room, code);
  const key = room.gameSessionKey;
  const ids = [...(room.servedOrder || [])];   // cumul → pas de read-modify-write
  room.gsReady = (room.gsReady || Promise.resolve())
    .then(() => prisma.gameSession.update({ where: { roomCode: key }, data: { questionIds: ids } }))
    .catch(err => console.warn(`[GameSession] update ${key} fail:`, err.message));
}

function finalizeGameSession(room) {
  if (!room || !room.gameSessionKey) return;
  const key = room.gameSessionKey;
  const ids = [...(room.servedOrder || [])];
  room.gsReady = (room.gsReady || Promise.resolve())
    .then(() => prisma.gameSession.update({ where: { roomCode: key }, data: { endedAt: new Date(), questionIds: ids } }))
    .catch(err => console.warn(`[GameSession] finalize ${key} fail:`, err.message));
}

function buildRoundPlan(settings) {
  const plan       = [];
  const rounds     = settings.rounds || ['culture'];
  const qpr        = settings.questionsPerRound || {};
  const userThemes = settings.themes || ['general'];

  for (const round of rounds) {
    const raw   = Number(qpr[round]);
    const count = Number.isFinite(raw) && raw > 0 ? Math.min(20, Math.floor(raw)) : defaultQCount(round);
    if (round === 'pixel') {
      plan.push({ type: 'pixel', name: 'pixel', qCount: count, questions: [] });
    } else if (round === 'geo') {
      plan.push({ type: 'geomap', name: 'geo', qCount: count, questions: [] });
    } else {
      plan.push({ type: 'normal', name: round, qCount: count, questions: [], themes: userThemes });
    }
  }
  console.log(`🗂️  Plan: ${plan.map(r => `${r.name}×${r.qCount}`).join(' | ')}`);
  return plan;
}

function defaultQCount(round) {
  return { culture: 10, geo: 5, pari: 3, pixel: 5 }[round] || 5;
}

// `served` : Set d'ids déjà servis dans la partie. On charge les manches l'une
// après l'autre en l'EXCLUANT puis en y ajoutant les ids choisis → aucune
// répétition possible entre manches (culture/pixel/géo/pari), même si plusieurs
// manches partagent le même type (ex : culture + pari = tous deux des QCM).
async function loadRoundQuestions(plan, difficulty, served, codeForLog, softExclude) {
  const ex   = served instanceof Set ? served : new Set();
  const soft = softExclude instanceof Set ? softExclude : new Set();
  for (const round of plan) {
    if (round.type === 'pixel') {
      round.questions = getPixelQuestions({ count: round.qCount, exclude: ex, softExclude: soft });
    } else if (round.type === 'geomap') {
      round.questions = getGeoQuestions({ count: round.qCount, exclude: ex, softExclude: soft });
    } else {
      round.questions = await getQuestions({
        themes:     round.themes,
        difficulty: difficulty || 'medium',
        count:      round.qCount,
        exclude:    ex,
        softExclude: soft,
      });
    }
    // Réserve les ids choisis AVANT toute émission → pas de doublon ni de race.
    for (const q of round.questions) if (q && q.id) ex.add(q.id);
    if (round.questions.length < round.qCount) {
      console.warn(`[anti-rep] ${codeForLog || ''} manche "${round.name}" : ${round.questions.length}/${round.qCount} chargée(s) (réservoir épuisé, servedIds=${ex.size})`);
    } else {
      console.log(`📚 Manche "${round.name}" : ${round.qCount} demandée(s), ${round.questions.length} chargée(s)`);
    }
  }
}

function currentRound(room) {
  return room.roundPlan[room.currentRound];
}

// ── Mélange des réponses (par joueur, par question) ───────────
// SÉCURITÉ : l'ordre mélangé ET l'index de la bonne réponse dans ce nouvel ordre
// sont calculés CÔTÉ SERVEUR. On mémorise par room :
//   room.optionOrders[playerName][qKey] = { permutation, displayedCorrectIndex }
// (clé par nom de joueur = stable à travers les reconnexions dans la room).
// Le client ne reçoit JAMAIS l'index correct avant le reveal.
function makePermutation(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function applyPerm(arr, perm) {
  return Array.isArray(arr) ? perm.map(i => arr[i]) : arr;
}
function qKey(q, idx) { return q.id || ('idx-' + idx); }

// ── Anti-répétition niveau 2 : historique par joueur connecté ──
// Charge les exclusions (questions vues récemment) d'UN joueur connecté.
async function loadOnePlayerExclusion(room, userId) {
  if (!userId) return;
  room.playerExclusions = room.playerExclusions || new Map();
  try {
    const cutoff = new Date(Date.now() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const rows = await prisma.userQuestionHistory.findMany({
      where:  { userId, seenAt: { gte: cutoff } },
      select: { questionId: true },
    });
    room.playerExclusions.set(userId, new Set(rows.map(r => r.questionId)));
  } catch (err) {
    // Tolérant : si la requête échoue, on continue sans exclusions pour ce joueur.
    if (!room.playerExclusions.has(userId)) room.playerExclusions.set(userId, new Set());
    console.warn(`[anti-rep L2] chargement historique échoué (user ${userId}):`, err.message);
  }
}

// Charge les exclusions de TOUS les joueurs connectés de la room (début de partie).
async function loadPlayerExclusions(room) {
  room.playerExclusions = new Map();
  const connected = room.players.filter(p => p.userId);
  await Promise.all(connected.map(p => loadOnePlayerExclusion(room, p.userId)));
}

// Union des exclusions historiques des joueurs connectés présents (soft exclude).
function buildSoftExclude(room) {
  const soft = new Set();
  if (!room.playerExclusions) return soft;
  for (const p of room.players) {
    if (!p.userId) continue;
    const set = room.playerExclusions.get(p.userId);
    if (set) for (const id of set) soft.add(id);
  }
  return soft;
}

// À chaque question servie : enregistre l'historique des joueurs CONNECTÉS
// (fire-and-forget). Les anonymes n'ont pas d'identité stable → aucun historique.
function recordSeenForConnected(room, q) {
  if (!q || !q.id) return;
  for (const p of room.players) {
    if (!p.userId) continue;
    const userId = p.userId;
    // Tient le cache d'exclusions à jour pour les manches suivantes de CETTE partie.
    if (room.playerExclusions) {
      const set = room.playerExclusions.get(userId) || new Set();
      set.add(q.id);
      room.playerExclusions.set(userId, set);
    }
    prisma.userQuestionHistory.upsert({
      where:  { userId_questionId: { userId, questionId: q.id } },
      create: { userId, questionId: q.id },
      update: { seenAt: new Date() },
    }).catch(err => console.warn('[anti-rep L2] upsert historique échoué:', err.message));
  }
}

function shuffledTranslations(translations, perm) {
  if (!translations) return null;
  const out = {};
  for (const lang of Object.keys(translations)) {
    const t0 = translations[lang];
    out[lang] = (t0 && Array.isArray(t0.options)) ? { ...t0, options: applyPerm(t0.options, perm) } : t0;
  }
  return out;
}

// Construit (et mémorise) le payload new_question mélangé pour un joueur. Pas de
// mélange pour le géo. Réutilise la permutation existante si déjà calculée pour
// ce joueur + cette question (reconnexion → même ordre).
function shuffledQuestionPayload(room, q, qk, base, playerName) {
  const shuffleable = q.type !== 'geomap'
    && Array.isArray(q.options) && q.options.length > 1
    && Number.isInteger(q.correctIndex);
  if (!shuffleable) return base;
  room.optionOrders = room.optionOrders || {};
  room.optionOrders[playerName] = room.optionOrders[playerName] || {};
  let map = room.optionOrders[playerName][qk];
  if (!map) {
    const perm = makePermutation(q.options.length);
    map = { permutation: perm, displayedCorrectIndex: perm.indexOf(q.correctIndex) };
    room.optionOrders[playerName][qk] = map;
  }
  const out = { ...base, options: applyPerm(q.options, map.permutation) };
  if (q.translations) out.translations = shuffledTranslations(q.translations, map.permutation);
  return out;
}

function sendQuestion(code) {
  const room  = rooms[code];
  if (!room) return;
  const round = currentRound(room);
  if (!round) return;

  room.answers       = {};
  room.teamAnswers   = {};
  room.nextScheduled = false;
  room.questionStartTime = Date.now();
  room.phase         = 'question';

  const questionIndex   = room.currentQuestion;
  const currentRoundIdx = room.currentRound;
  const q               = round.questions[questionIndex];

  // Sécurité réservoir épuisé : aucune question à cet index → on ne répète JAMAIS,
  // on termine proprement (manche suivante ou fin de partie) plutôt que planter.
  if (!q) {
    console.warn(`[anti-rep] ${code} sendQuestion sans question (manche="${round.name}", idx=${questionIndex})`);
    finishExhaustedRound(code, round);
    return;
  }
  // Anti-répétition : id marqué « servi » AVANT l'émission (pas de race).
  if (q.id) {
    room.servedQuestionIds.add(q.id);
    room.servedOrder = room.servedOrder || [];
    room.servedOrder.push(q.id);
  }

  const payload = {
    questionId: q.id || null,
    index:     questionIndex,
    total:     round.questions.length,
    question:  q.question,
    options:   q.options,
    translations: q.translations || null,
    timeLimit: 15,
    type:      q.type || 'normal',
    roundName: round.name,
    roundIndex: room.currentRound,
    totalRounds: room.roundPlan.length,
  };
  if (q.type === 'pixel')  {
    payload.imageUrl = q.imageUrl;
    // Client : 10s de dépixellisation + 10s de timer = 20s. Marge serveur.
    payload.timeLimit = 25;
  }
  if (q.type === 'geomap') {
    // Pas de question/options classiques : juste un lieu à placer
    payload.options = [];   // pas d'options A/B/C/D
    payload.timeLimit = 20; // 20s pour cliquer sur la carte
  }
  if (round.name === 'pari') {
    payload.isPari = true;
    // Client : phase de mise libre + 15s après "Miser et voir". Marge serveur généreuse.
    payload.timeLimit = 45;
  }

  // Émission PAR JOUEUR : chacun reçoit les options dans un ordre mélangé
  // propre (le géo n'est pas mélangé). Le mapping est mémorisé sur la room.
  const qk = qKey(q, questionIndex);
  for (const p of room.players) {
    io.to(p.id).emit('new_question', shuffledQuestionPayload(room, q, qk, payload, p.name));
  }
  // Historique par joueur connecté (anti-répétition niveau 2, fire-and-forget).
  recordSeenForConnected(room, q);
  // Stat fire-and-forget : on incrémente timesShown pour la question diffusée.
  if (q.id) recordShown(q.id);
  // Traçabilité GameSession (fire-and-forget, n'impacte pas le gameflow).
  persistServedQuestion(room, code);

  if (round.name === 'pari') {
    // Pari : pas de timeout d'avance immédiat. On attend le "miser et voir" de chaque joueur,
    // OU au max 25s de phase de mise. Ensuite startPariAnswerPhase déclenche les 15s de réponse.
    room.pariMiserDone = {};
    if (room.pariCap) clearTimeout(room.pariCap);
    room.pariCap = setTimeout(() => {
      if (rooms[code] === room && room.currentQuestion === questionIndex
          && room.currentRound === currentRoundIdx) {
        startPariAnswerPhase(code, questionIndex, currentRoundIdx);
      }
    }, 25000);
  } else {
    // Marge serveur : +300ms standard, +1500ms pour geomap (laisse le temps à l'auto-submit
    // côté client d'arriver avant que le serveur force le reveal sans la dernière réponse)
    const grace = q.type === 'geomap' ? 1500 : 300;
    const limit = payload.timeLimit * 1000 + grace;
    setTimeout(() => {
      if (rooms[code] && rooms[code].currentQuestion === questionIndex &&
          rooms[code].currentRound === currentRoundIdx &&
          !rooms[code].nextScheduled && rooms[code].players.length > 0) {
        // Passe par endQuestion pour gérer le geomap_reveal même quand personne ne répond
        endQuestion(code);
      }
    }, limit);
  }
}

function startPariAnswerPhase(code, questionIndex, roundIndex) {
  const room = rooms[code];
  if (!room) return;
  if (room.pariCap) { clearTimeout(room.pariCap); room.pariCap = null; }
  if (room.currentQuestion !== questionIndex || room.currentRound !== roundIndex) return;

  // Reset le compteur de question : les 15s commencent maintenant pour TOUS les joueurs
  room.questionStartTime = Date.now();
  io.to(code).emit('pari_reveal', { timeLimit: 15 });

  setTimeout(() => {
    if (rooms[code] && rooms[code].currentQuestion === questionIndex &&
        rooms[code].currentRound === roundIndex &&
        !rooms[code].nextScheduled && rooms[code].players.length > 0) {
      endQuestion(code);
    }
  }, 16000);
}

// Réservoir épuisé pour la manche en cours : on la termine proprement et on
// enchaîne (manche suivante ou fin de partie via le flux normal). Jamais de
// doublon, jamais de crash. Émet round_exhausted (toast i18n côté client).
function finishExhaustedRound(code, round) {
  const room = rooms[code];
  if (!room) return;
  io.to(code).emit('round_exhausted', { roundName: round ? round.name : null });
  if (room.currentRound + 1 >= room.roundPlan.length) {
    doGameOver(code);
  } else {
    room.currentRound++;
    room.currentQuestion = 0;
    startRound(code, room.currentRound);
  }
}

// Annonce dramatique d'une manche, puis lance sa première question
function startRound(code, roundIndex) {
  const room = rooms[code];
  if (!room) return;
  const round = room.roundPlan[roundIndex];
  if (!round) return;

  // Anti-répétition : si le réservoir était déjà épuisé au chargement, la manche
  // n'a aucune question → on la saute proprement (pas d'intro vide, pas de crash).
  if (!round.questions || round.questions.length === 0) {
    console.warn(`[anti-rep] ${code} manche "${round.name}" vide → sautée`);
    finishExhaustedRound(code, round);
    return;
  }

  room.phase = 'intro';
  room.questionStartTime = null;

  io.to(code).emit('round_intro', {
    roundName:   round.name,
    roundIndex,
    totalRounds: room.roundPlan.length,
    qCount:      round.questions.length,
  });
  io.to(code).emit('round_started', { roundName: round.name, roundIndex });

  setTimeout(() => {
    if (rooms[code] && rooms[code].phase === 'intro') sendQuestion(code);
  }, 3500);
}

// ── Socket.io ─────────────────────────────────────────────────

// Identité Google du socket, lue depuis la SESSION (jamais depuis le client).
// Renvoie l'objet User (DB) si connecté, sinon null.
function socketUser(socket) {
  const u = socket.request && socket.request.user;
  return (u && u.id) ? u : null;
}

// Vue « publique » d'un joueur envoyée aux autres clients : on retire les champs
// d'autorité serveur (userId/gName/gAvatar) et on n'expose qu'un booléen
// `verified`. JAMAIS d'email ni d'identifiant Google côté room.
function publicPlayer(p) {
  const { userId, gName, gAvatar, ...safe } = p;
  return { ...safe, verified: !!userId };
}
function publicPlayers(room) {
  return (room.players || []).map(publicPlayer);
}

io.on('connection', (socket) => {
  console.log(`✅ Connecté : ${socket.id}`);

  socket.on('create_room', ({ playerName, settings, avatar }) => {
    // F4 : cap IP avant tout (3 rooms / minute)
    if (!checkIpRoomCreate(socket)) return;
    // Identité éventuelle (session) — sert d'autorité, jamais le client.
    const gu = socketUser(socket);
    // Compte connecté AVEC pseudo → on FORCE son pseudo (identité figée par le
    // compte ; le client ne peut pas le changer). Fallback displayName si pas
    // encore de pseudo (ne devrait pas arriver : le client gate la création).
    if (gu && gu.pseudo) playerName = gu.pseudo;
    else if ((!playerName || !String(playerName).trim()) && gu) playerName = gu.displayName;
    // F3 + profanity : pseudo valide ?
    const pseudoCheck = validatePseudo(playerName);
    if (!pseudoCheck.ok) return socket.emit('join_error', pseudoCheck.reason);
    if (!validSettingsObj(settings)) return socket.emit('join_error', 'Paramètres invalides.');
    if (avatar !== undefined && !validAvatar(avatar)) return socket.emit('join_error', 'Avatar invalide.');

    const name  = String(playerName).trim();
    const code  = generateCode();
    const teams = settings.teamMode ? buildTeams(settings.numTeams || 2) : [];
    rooms[code] = {
      code,
      host:     socket.id,
      hostName: name,
      players:  [{ id: socket.id, name, score: 0, teamId: null, avatar: avatar || defaultAvatar(), inLobby: true,
                   userId: gu?.id || null, gName: gu?.displayName || null, gAvatar: gu?.avatarUrl || null }],
      settings,
      teams,
      started:      false,
      currentRound: 0,
      currentQuestion: 0,
      answers:      {},
      teamAnswers:  {},
      nextScheduled: false,
      questionStartTime: null,
      roundPlan:    [],
      history:      [],
      // Anti-répétition : ids des questions déjà servies dans la partie en cours
      // (toutes manches confondues). Autorité en mémoire. Vidé à chaque relance.
      servedQuestionIds: new Set(),
      servedOrder:       [],     // ordre des ids réellement servis (traçabilité GameSession)
      gameSessionKey:    null,   // clé unique de la GameSession de la partie en cours
      gsReady:           null,   // chaîne de promesses DB (fire-and-forget)
    };
    socket.join(code);
    console.log(`🎮 Room créée : ${code} par ${name}${gu ? ' (compte vérifié)' : ''}`);
    socket.emit('room_created', { code, players: publicPlayers(rooms[code]), settings, teams });
  });

  socket.on('join_room', ({ code, playerName, avatar }) => {
    if (!validRoomCode(code)) return socket.emit('join_error', 'Code invalide.');
    const gu = socketUser(socket);
    if (gu && gu.pseudo) playerName = gu.pseudo;   // pseudo de compte figé
    else if ((!playerName || !String(playerName).trim()) && gu) playerName = gu.displayName;
    const pseudoCheck = validatePseudo(playerName);
    if (!pseudoCheck.ok) return socket.emit('join_error', pseudoCheck.reason);
    if (avatar !== undefined && !validAvatar(avatar)) return socket.emit('join_error', 'Avatar invalide.');

    const room = rooms[code];
    if (!room)                    return socket.emit('join_error', 'Partie introuvable.');
    if (room.started)             return socket.emit('join_error', 'Partie déjà commencée.');
    if (room.players.length >= 8) return socket.emit('join_error', 'Partie pleine (8/8).');
    const name = String(playerName).trim();
    if (room.players.find(p => p.name === name))
      return socket.emit('join_error', 'Ce pseudo est déjà pris.');

    room.players.push({ id: socket.id, name, score: 0, teamId: null, avatar: avatar || defaultAvatar(), inLobby: true,
                        userId: gu?.id || null, gName: gu?.displayName || null, gAvatar: gu?.avatarUrl || null });
    socket.join(code);
    socket.emit('room_joined', { code, players: publicPlayers(room), settings: room.settings, teams: room.teams });
    emitPlayersUpdate(code);
  });

  socket.on('lobby_sync', ({ code, playerName, avatar, fromLobby }) => {
    if (!validRoomCode(code)) return socket.emit('join_error', 'Code invalide.');
    const gu = socketUser(socket);
    if (gu && gu.pseudo) playerName = gu.pseudo;   // identité figée par le compte
    const pseudoCheck = validatePseudo(playerName);
    if (!pseudoCheck.ok) return socket.emit('join_error', pseudoCheck.reason);
    if (avatar !== undefined && !validAvatar(avatar)) avatar = undefined;
    const room = rooms[code];
    if (!room) return socket.emit('join_error', 'Partie introuvable.');

    // Annuler le timer de suppression du lobby vide si le joueur revient
    if (room._emptyTimer) { clearTimeout(room._emptyTimer); room._emptyTimer = null; }

    let player = room.players.find(p => p.name === playerName);
    if (player) {
      // Joueur trouvé : mettre à jour son socket ID
      const oldId = player.id;
      player.id   = socket.id;
      if (room.host === oldId) room.host = socket.id;
      // Rafraîchir l'identité depuis la session (au cas où il s'est connecté
      // entre-temps). Toujours dérivée du serveur, jamais du client.
      player.userId  = gu?.id || null;
      player.gName   = gu?.displayName || null;
      player.gAvatar = gu?.avatarUrl || null;
      // Si le sync vient de lobby.html, le joueur est revenu au salon (post-game / refresh)
      if (fromLobby) player.inLobby = true;
    } else if (!room.started) {
      // Joueur supprimé par le timer de déconnexion avant que lobby.html charge
      player = { id: socket.id, name: playerName, score: 0, teamId: null, avatar: avatar || defaultAvatar(), inLobby: true,
                 userId: gu?.id || null, gName: gu?.displayName || null, gAvatar: gu?.avatarUrl || null };
      const isOriginalHost = room.hostName === playerName;
      if (isOriginalHost) {
        room.players.unshift(player); // L'hôte reste toujours en première position
        room.host = socket.id;
      } else {
        room.players.push(player);
      }
      console.log(`♻️  ${playerName} ré-ajouté dans ${code} (reconnexion tardive)`);
    }
    socket.join(code);
    // Anti-répétition niveau 2 : un joueur connecté qui (re)joint une partie EN
    // COURS → on (re)charge ses exclusions pour les manches à venir. Tolérant.
    if (room.started && player && player.userId) loadOnePlayerExclusion(room, player.userId);
    emitPlayersUpdate(code);
    // Direct delivery to the connecting socket — guarantees they see themselves
    // even if the room broadcast has a timing edge case
    socket.emit('players_update', {
      players:  publicPlayers(room),
      teams:    room.teams,
      hostName: room.hostName,
    });
    // Pour les joueurs (ré)entrant au lobby : pousser les settings courants
    // afin qu'ils voient l'état actuel des pickers (manches, thèmes, difficulté…),
    // même si l'hôte les a modifiés avant qu'ils n'ouvrent lobby.html.
    if (!room.started) {
      socket.emit('settings_updated', { settings: room.settings, teams: room.teams });
    }

    // Renvoi d'état pour les rejoineurs (host qui passe lobby→game inclus)
    if (room.started && room.roundPlan.length > 0) {
      const round = currentRound(room);
      if (!round) return;

      if (room.phase === 'intro') {
        // En cours d'annonce de manche : renvoyer le jingle
        socket.emit('round_intro', {
          roundName:   round.name,
          roundIndex:  room.currentRound,
          totalRounds: room.roundPlan.length,
          qCount:      round.questions.length,
        });
        socket.emit('round_started', { roundName: round.name, roundIndex: room.currentRound });
      } else if (room.phase === 'question' && room.questionStartTime
                 && room.currentQuestion < round.questions.length) {
        const q = round.questions[room.currentQuestion];
        const alreadyAnswered = player && room.answers[player.name] !== undefined;
        if (!alreadyAnswered) {
          const elapsed   = (Date.now() - room.questionStartTime) / 1000;
          const base      = q.type === 'pixel' ? 25 : (round.name === 'pari' ? 45 : 15);
          const remaining = Math.max(3, base - Math.floor(elapsed));
          const rejoinBase = {
            questionId: q.id || null,
            index: room.currentQuestion, total: round.questions.length,
            question: q.question, options: q.options, timeLimit: remaining,
            translations: q.translations || null,
            type: q.type || 'normal', imageUrl: q.imageUrl,
            roundName: round.name, roundIndex: room.currentRound, totalRounds: room.roundPlan.length,
            isPari: round.name === 'pari' || undefined,
          };
          // Réutilise la permutation déjà mémorisée pour ce joueur (même ordre
          // qu'avant la déconnexion) ; sinon en génère une (cas marginal).
          socket.emit('new_question', shuffledQuestionPayload(room, q, qKey(q, room.currentQuestion), rejoinBase, player.name));
        }
      }
      // phase 'scores' / 'between' : ne renvoie rien, le prochain événement viendra
    }
  });

  // Hôte met à jour les settings depuis le lobby (nb questions, mode équipe, etc.)
  socket.on('update_settings', ({ code, settings }) => {
    if (!validRoomCode(code) || !validSettingsObj(settings)) return;
    if (!checkActionRate(socket)) return;
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;

    const wasTeamMode = !!room.settings.teamMode;
    const oldNumTeams = room.settings.numTeams;
    room.settings = { ...room.settings, ...settings };
    const isTeamMode = !!room.settings.teamMode;
    const newNumTeams = room.settings.numTeams || 2;

    // Reconstruire les équipes ET nettoyer player.teamId quand on bascule
    // entre solo/équipe ou qu'on change le nombre d'équipes — sinon les anciens
    // teamId pointent vers des équipes qui n'existent plus (badge fantôme).
    if (wasTeamMode !== isTeamMode || (isTeamMode && oldNumTeams !== newNumTeams)) {
      room.teams = isTeamMode ? buildTeams(newNumTeams) : [];
      room.players.forEach(p => { p.teamId = null; });
    }

    io.to(code).emit('settings_updated', { settings: room.settings, teams: room.teams });
    emitPlayersUpdate(code);
  });

  // Joueur choisit une équipe
  socket.on('choose_team', ({ code, teamId }) => {
    if (!validRoomCode(code)) return;
    if (teamId !== null && !Number.isInteger(teamId)) return;
    if (!checkActionRate(socket)) return;
    const room   = rooms[code];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    // L'équipe doit exister dans la room (sinon badge fantôme)
    if (teamId !== null && !room.teams.some(t => t.id === teamId)) return;
    player.teamId = teamId;
    emitPlayersUpdate(code);
  });

  socket.on('start_game', async ({ code }) => {
    if (!validRoomCode(code)) return;
    if (!checkActionRate(socket)) return;
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;

    // Tous les joueurs doivent être revenus au lobby (sinon ils ratent l'intro)
    const stragglers = room.players.filter(p => p.inLobby === false).map(p => p.name);
    if (stragglers.length > 0) {
      socket.emit('start_blocked', { stragglers });
      return;
    }

    room.started = true;
    // Une fois la partie lancée, plus personne n'est "dans le lobby"
    room.players.forEach(p => { p.inLobby = false; });
    try {
      room.roundPlan    = buildRoundPlan(room.settings);
      room.currentRound = 0;
      room.currentQuestion = 0;
      room.history      = [];
      // Nouveau cycle de manches → on vide la mémoire anti-répétition et on
      // prépare une NOUVELLE GameSession (traçabilité) pour cette partie.
      room.servedQuestionIds = new Set();
      room.servedOrder       = [];
      room.optionOrders      = {};   // mélange des réponses : reparti à neuf
      room.gameSessionKey    = null;
      room.gsReady           = null;
      // Anti-répétition niveau 2 : exclusions historiques des joueurs connectés.
      await loadPlayerExclusions(room);
      await loadRoundQuestions(room.roundPlan, room.settings.difficulty, room.servedQuestionIds, code, buildSoftExclude(room));

      const first = room.roundPlan[0];
      io.to(code).emit('game_started', {
        totalRounds: room.roundPlan.length,
        firstRound:  first ? first.name : 'culture',
        teamMode:    room.settings.teamMode,
        teams:       room.teams,
        players:     publicPlayers(room),
      });
      startRound(code, 0);
    } catch (err) {
      console.error(err);
      socket.emit('join_error', 'Erreur lors du chargement.');
      room.started = false;
    }
  });

  socket.on('submit_answer', ({ code, answerIndex, betAmount, lat, lng }) => {
    if (!validRoomCode(code)) return;
    if (!checkActionRate(socket)) return;
    const room = rooms[code];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    if (room.answers[player.name] !== undefined) return;

    const round = currentRound(room);
    if (!round) return;
    const q = round.questions[room.currentQuestion];

    // ── GEOMAP : score basé sur la distance au point correct ─────
    if (q.type === 'geomap') {
      const guessLat = Number(lat), guessLng = Number(lng);
      let points = 0, dist = null;
      if (!validLatLng(guessLat, guessLng)) {
        // Réponse vide / hors-plage : on enregistre 0 point
        room.answers[player.name] = { lat: null, lng: null, distance: null, correct: false, points: 0 };
        io.to(code).emit('player_answered', { name: player.name });
        checkAllAnswered(code);
        return;
      }
      if (Number.isFinite(guessLat) && Number.isFinite(guessLng)) {
        dist   = distanceKm(guessLat, guessLng, q.lat, q.lng);
        points = geoScore(dist);
      }
      const correct = points >= 500;
      room.answers[player.name] = { lat: guessLat, lng: guessLng, distance: dist, correct, points };
      if (room.settings.teamMode && player.teamId !== null) {
        const team = room.teams.find(t => t.id === player.teamId);
        if (team) team.score += points;
      } else {
        player.score = Math.max(0, player.score + points);
      }
      socket.emit('answer_result', {
        correct, points, distance: dist,
        correctLat: q.lat, correctLng: q.lng, correctLabel: q.label,
      });
      io.to(code).emit('player_answered', { name: player.name });
      checkAllAnswered(code);
      return;
    }

    // ── Manches classiques (culture, pixel, pari) ────────────────
    if (!validAnswerIndex(answerIndex)) return;
    if (round.name === 'pari' && betAmount !== undefined) {
      // betAmount doit être un entier dans [0, score du joueur]
      const maxBet = room.settings.teamMode
        ? (room.teams.find(t => t.id === player.teamId)?.score ?? 0)
        : (player.score ?? 0);
      if (!validBet(betAmount, Math.max(maxBet, 0))) return;
    }
    // L'index reçu correspond à CE QUE LE JOUEUR VOIT (ordre mélangé). On compare
    // au displayedCorrectIndex mémorisé pour ce joueur (fallback : correctIndex
    // global si aucun mapping — reconnexion marginale).
    const omap = room.optionOrders?.[player.name]?.[qKey(q, room.currentQuestion)];
    const effectiveCorrectIndex = omap ? omap.displayedCorrectIndex : q.correctIndex;
    const correct = answerIndex === effectiveCorrectIndex;
    // Stat fire-and-forget : on incrémente timesCorrect quand la réponse est juste.
    if (correct && q.id) recordCorrect(q.id);
    let points = 0;
    if (correct) {
      if (round.name === 'pari' && betAmount !== undefined) {
        points = betAmount;
      } else if (q.type === 'pixel') {
        const elapsed = (Date.now() - room.questionStartTime) / 1000;
        if (elapsed < 6)       points = 500;
        else if (elapsed < 12) points = 400;
        else if (elapsed < 18) points = 300;
        else if (elapsed < 24) points = 200;
        else                   points = 100;
        const allAnswers = Object.values(room.answers);
        const correctSoFar = allAnswers.filter(a => a.correct).length;
        if (correctSoFar === 0) points += 100;
      } else {
        points = 100;
      }
    } else if (round.name === 'pari' && betAmount !== undefined) {
      points = -betAmount;
    }

    room.answers[player.name] = { answerIndex, correct, points };

    if (room.settings.teamMode && player.teamId !== null) {
      const team = room.teams.find(t => t.id === player.teamId);
      if (team && !room.teamAnswers[player.teamId]) {
        room.teamAnswers[player.teamId] = { answerIndex, correct, points };
        if (correct) team.score += points;
      }
    } else {
      if (correct) player.score = Math.max(0, player.score + points);
    }

    socket.emit('answer_result', { correct, correctIndex: effectiveCorrectIndex, points });
    io.to(code).emit('player_answered', { name: player.name });
    checkAllAnswered(code);
  });

  socket.on('host_advance', ({ code }) => {
    if (!validRoomCode(code)) return;
    if (!checkActionRate(socket)) return;
    const room = rooms[code];
    if (!room) return;
    if (room.host !== socket.id) return;       // Seul l'hôte peut déclencher
    if (!room.waitingForHost) return;          // Pas dans une phase d'attente
    advance(code);
  });

  // L'hôte lègue son rôle à un autre joueur (depuis le lobby ou en cours de partie).
  socket.on('transfer_host', ({ code, targetName }) => {
    if (!validRoomCode(code)) return;
    if (typeof targetName !== 'string') return;
    if (!checkActionRate(socket)) return;
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    const target = room.players.find(p => p.name === targetName);
    if (!target || target.id === socket.id) return;

    const oldHostName = room.hostName;
    room.host     = target.id;
    room.hostName = target.name;
    // Convention : l'hôte est en première position de la liste players.
    const idx = room.players.findIndex(p => p.id === target.id);
    if (idx > 0) {
      const [p] = room.players.splice(idx, 1);
      room.players.unshift(p);
    }
    console.log(`👑 ${oldHostName} → ${target.name} (transfert d'hôte dans ${code})`);

    io.to(code).emit('host_changed', { hostName: room.hostName });
    emitPlayersUpdate(code);
    io.to(code).emit('chat_message', {
      name: '🔔 Système',
      text: `👑 ${oldHostName} a légué le rôle d'hôte à ${target.name}.`,
    });
    // Si on attendait justement le clic de l'hôte, relancer l'invite pour le nouvel hôte
    if (room.waitingForHost && room.awaitingPayload) {
      io.to(code).emit('awaiting_host', room.awaitingPayload);
    }
  });

  // L'hôte exclut un joueur du lobby (uniquement avant le démarrage de la partie).
  socket.on('kick_player', ({ code, targetName }) => {
    if (!validRoomCode(code)) return;
    if (typeof targetName !== 'string') return;
    if (!checkActionRate(socket)) return;
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    if (room.started) return; // Pas de kick en pleine partie
    const target = room.players.find(p => p.name === targetName);
    if (!target || target.id === socket.id) return;

    const targetSocket = io.sockets.sockets.get(target.id);
    room.players = room.players.filter(p => p.name !== targetName);
    if (targetSocket) {
      targetSocket.emit('kicked', { by: room.hostName });
      targetSocket.leave(code);
    }
    console.log(`🚫 ${target.name} exclu de ${code} par ${room.hostName}`);
    emitPlayersUpdate(code);
    io.to(code).emit('chat_message', {
      name: '🔔 Système',
      text: `🚫 ${target.name} a été exclu du lobby.`,
    });
  });

  socket.on('pari_miser_done', ({ code, betAmount }) => {
    if (!validRoomCode(code)) return;
    if (!Number.isInteger(betAmount) || betAmount < 0 || betAmount > 1000000) return;
    if (!checkActionRate(socket)) return;
    const room = rooms[code];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    const round = currentRound(room);
    if (!round || round.name !== 'pari') return;

    if (!room.pariMiserDone) room.pariMiserDone = {};
    room.pariMiserDone[player.name] = { bet: Number(betAmount) || 0 };

    // Tous les joueurs ont fait leur miser → lance la phase de réponse
    if (Object.keys(room.pariMiserDone).length >= room.players.length) {
      startPariAnswerPhase(code, room.currentQuestion, room.currentRound);
    }
  });

  socket.on('chat_message', ({ code, name, text }) => {
    if (!validRoomCode(code)) return;
    const room = rooms[code];
    if (!room) return;
    // F7 : l'émetteur doit être dans la room (pas n'importe quel socket connecté)
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    // On force le nom diffusé = nom serveur (pas celui du payload, qui pourrait être usurpé)
    const displayName = player.name;

    if (!checkChatRate(socket)) return;

    const chatCheck = validateChatMessage(text);
    if (!chatCheck.ok) {
      socket.emit('chat_blocked', { reason: chatCheck.reason });
      console.log(`[FILTER] room=${code} user=${displayName} reason="${chatCheck.reason}" original="${String(text || '').slice(0, 50)}"`);
      return;
    }
    io.to(code).emit('chat_message', { name: displayName, text: chatCheck.cleaned });
  });

  // Joueur quitte volontairement la partie en cours (bouton "Quitter")
  socket.on('leave_game', ({ code }) => {
    if (!validRoomCode(code)) return;
    const room = rooms[code];
    if (!room) return;
    const idx = room.players.findIndex(p => p.id === socket.id);
    if (idx === -1) return;

    const name    = room.players[idx].name;
    const wasHost = room.host === socket.id;
    room.players.splice(idx, 1);
    socket.leave(code);
    console.log(`🚪 ${name} a quitté volontairement ${code}`);

    if (room.players.length === 0) {
      if (room.hostTimeout)  clearTimeout(room.hostTimeout);
      if (room._emptyTimer)  clearTimeout(room._emptyTimer);
      delete rooms[code];
      console.log(`🗑️  Room ${code} supprimée (plus de joueurs)`);
      return;
    }

    // Réattribution de l'hôte si l'hôte vient de partir
    let newHostName = null;
    if (wasHost) {
      room.host     = room.players[0].id;
      room.hostName = room.players[0].name;
      newHostName   = room.hostName;
      io.to(code).emit('host_changed', { hostName: room.hostName });
      // Si on attendait justement le clic de l'hôte, on relance l'invite pour le nouvel hôte
      if (room.waitingForHost && room.awaitingPayload) {
        io.to(code).emit('awaiting_host', room.awaitingPayload);
      }
    }
    // Pop-up dédiée aux clients (toast immédiat) — séparée du chat_message
    io.to(code).emit('player_left', { name, wasHost, newHostName });
    emitPlayersUpdate(code);
    io.to(code).emit('chat_message', { name: '🔔 Système', text: `${name} a quitté la partie.` });
    if (room.started) checkAllAnswered(code);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Déconnecté : ${socket.id}`);
    // F4 : libérer la mémoire du rate-limiter
    socketRateLimits.delete(socket.id);
    setTimeout(() => {
      for (const code in rooms) {
        const room = rooms[code];
        const idx  = room.players.findIndex(p => p.id === socket.id);
        if (idx === -1) continue;

        const name    = room.players[idx].name;
        const wasHost = room.host === socket.id;
        room.players.splice(idx, 1);
        console.log(`👋 ${name} parti de ${code}`);

        if (room.players.length === 0) {
          if (room.started) {
            // Partie lancée et plus personne : supprimer immédiatement
            delete rooms[code];
          } else {
            // Lobby vide : attendre 60s avant de supprimer (laisse le temps de se reconnecter)
            room._emptyTimer = setTimeout(() => {
              if (rooms[code] && rooms[code].players.length === 0) {
                delete rooms[code];
                console.log(`🗑️  Room ${code} supprimée (lobby vide 60s)`);
              }
            }, 60000);
            console.log(`⏳ Room ${code} vide — sera supprimée dans 60s si personne ne revient`);
          }
        } else {
          // Annuler le timer de suppression si d'autres joueurs sont là
          if (room._emptyTimer) { clearTimeout(room._emptyTimer); room._emptyTimer = null; }
          // Si l'hôte vient de partir, transférer le rôle au joueur suivant
          let newHostName = null;
          if (wasHost) {
            room.host     = room.players[0].id;
            room.hostName = room.players[0].name;
            newHostName   = room.hostName;
            io.to(code).emit('host_changed', { hostName: room.hostName });
            if (room.waitingForHost && room.awaitingPayload) {
              io.to(code).emit('awaiting_host', room.awaitingPayload);
            }
          }
          io.to(code).emit('player_left', { name, wasHost, newHostName });
          emitPlayersUpdate(code);
          io.to(code).emit('chat_message', { name: '🔔 Système', text: `${name} a quitté la partie.` });
          if (room.started) checkAllAnswered(code);
        }
      }
    }, 8000);
  });
});

// ── Helpers ───────────────────────────────────────────────────
function emitPlayersUpdate(code) {
  const room = rooms[code];
  if (!room) return;
  io.to(code).emit('players_update', {
    players:  publicPlayers(room),
    teams:    room.teams,
    hostName: room.hostName,
  });
}

function buildTeams(n) {
  const names  = ['Violet', 'Orange', 'Teal', 'Rose'];
  const colors = ['#6C3FCF', '#F97316', '#14B8A6', '#EC4899'];
  return Array.from({ length: n }, (_, i) => ({ id: i, name: `Équipe ${names[i]}`, color: colors[i], score: 0 }));
}

function defaultAvatar() { return { colorIdx: 0, emoji: '🎮' }; }

// ── Bootstrap : charge le cache DB AVANT d'accepter du trafic ──
(async () => {
  try {
    await initQuestionStore(prisma);
  } catch (err) {
    console.error('❌ Impossible de charger la DB :', err);
    process.exit(1);
  }
  server.listen(PORT, () => {
    console.log(`\n🎮 SquizzGame → http://localhost:${PORT}\n`);
  });
})();

// Clean shutdown — referme la connexion Prisma pour ne pas laisser de
// connexions ouvertes côté Neon (limite stricte sur le free tier).
async function shutdown(signal) {
  console.log(`\n${signal} reçu — arrêt propre…`);
  try { await prisma.$disconnect(); } catch (e) {}
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

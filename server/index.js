// server/index.js — Serveur principal QuizzRoom
const express     = require('express');
const http        = require('http');
const { Server }  = require('socket.io');
const path        = require('path');
const crypto      = require('crypto');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
require('dotenv').config();

const { validatePseudo, validateChatMessage } = require('./profanity-filter');

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

const { getQuestions }    = require('./questions');
const { getPixelQuestions } = require('./pixel-images');
const { getGeoQuestions, distanceKm, geoScore } = require('./geo-questions');

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
  const { theme = 'general', difficulty = 'medium', count = 10 } = req.query;
  try {
    const questions = await getQuestions({ themes: theme, difficulty, count: Number(count) });
    res.json({ ok: true, questions });
  } catch (err) {
    // Ne JAMAIS exposer err.message en clair (peut leaker des chemins / SQL / etc.)
    console.error('[/api/questions]', err);
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
      entry.answer = (a && a.answerIndex != null) ? q.options?.[a.answerIndex] : null;
    }
    return entry;
  });
  room.history.push({
    round:         round.name,
    type:          q.type || 'normal',
    question:      q.question,
    correctAnswer: isGeo ? (q.label || q.country || '—') : (q.options?.[q.correctIndex] ?? '—'),
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
      correctLat:   q.lat,
      correctLng:   q.lng,
      correctLabel: q.label,
      country:      q.country,
      explanation:  q.explanation || '',
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
    io.to(code).emit('question_reveal', {
      question:      q.question,
      correctIndex:  q.correctIndex,
      correctAnswer: q.options?.[q.correctIndex] ?? '',
      explanation:   q.explanation || '',
      results: room.players.map(p => ({
        name:     p.name,
        answered: room.answers[p.name] !== undefined,
        correct:  !!room.answers[p.name]?.correct,
      })),
    });
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
          players:      room.players,
          teams:        room.teams,
          teamMode:     room.settings.teamMode,
        });
      } else {
        // Mid-round (ou dernière question d'un game) : screen-scores
        io.to(code).emit('scores_update', {
          players:  room.players,
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
        players:      room.players,
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
  const ranking = room.settings.teamMode
    ? [...room.teams].sort((a, b) => b.score - a.score)
    : [...room.players].sort((a, b) => b.score - a.score);
  room.phase = 'over';
  io.to(code).emit('game_over', {
    ranking,
    teamMode: room.settings.teamMode,
    history:  room.history || [],
  });
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
  room.players.forEach(p => { p.score = 0; });
  if (room.teams) room.teams.forEach(t => { t.score = 0; });
  console.log(`🔁 Room ${code} : partie terminée, retour au lobby possible`);
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

async function loadRoundQuestions(plan, difficulty) {
  for (const round of plan) {
    if (round.type === 'pixel') {
      round.questions = getPixelQuestions({ count: round.qCount });
    } else if (round.type === 'geomap') {
      round.questions = getGeoQuestions({ count: round.qCount });
    } else {
      round.questions = await getQuestions({
        themes:     round.themes,
        difficulty: difficulty || 'medium',
        count:      round.qCount,
      });
    }
    console.log(`📚 Manche "${round.name}" : ${round.qCount} demandée(s), ${round.questions.length} chargée(s)`);
  }
}

function currentRound(room) {
  return room.roundPlan[room.currentRound];
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

  const payload = {
    index:     questionIndex,
    total:     round.questions.length,
    question:  q.question,
    options:   q.options,
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

  io.to(code).emit('new_question', payload);

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

// Annonce dramatique d'une manche, puis lance sa première question
function startRound(code, roundIndex) {
  const room = rooms[code];
  if (!room) return;
  const round = room.roundPlan[roundIndex];
  if (!round) return;

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
io.on('connection', (socket) => {
  console.log(`✅ Connecté : ${socket.id}`);

  socket.on('create_room', ({ playerName, settings, avatar }) => {
    // F4 : cap IP avant tout (3 rooms / minute)
    if (!checkIpRoomCreate(socket)) return;
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
      players:  [{ id: socket.id, name, score: 0, teamId: null, avatar: avatar || defaultAvatar(), inLobby: true }],
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
    };
    socket.join(code);
    console.log(`🎮 Room créée : ${code} par ${name}`);
    socket.emit('room_created', { code, players: rooms[code].players, settings, teams });
  });

  socket.on('join_room', ({ code, playerName, avatar }) => {
    if (!validRoomCode(code)) return socket.emit('join_error', 'Code invalide.');
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

    room.players.push({ id: socket.id, name, score: 0, teamId: null, avatar: avatar || defaultAvatar(), inLobby: true });
    socket.join(code);
    socket.emit('room_joined', { code, players: room.players, settings: room.settings, teams: room.teams });
    emitPlayersUpdate(code);
  });

  socket.on('lobby_sync', ({ code, playerName, avatar, fromLobby }) => {
    if (!validRoomCode(code)) return socket.emit('join_error', 'Code invalide.');
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
      // Si le sync vient de lobby.html, le joueur est revenu au salon (post-game / refresh)
      if (fromLobby) player.inLobby = true;
    } else if (!room.started) {
      // Joueur supprimé par le timer de déconnexion avant que lobby.html charge
      player = { id: socket.id, name: playerName, score: 0, teamId: null, avatar: avatar || defaultAvatar(), inLobby: true };
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
    emitPlayersUpdate(code);
    // Direct delivery to the connecting socket — guarantees they see themselves
    // even if the room broadcast has a timing edge case
    socket.emit('players_update', {
      players:  room.players,
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
          socket.emit('new_question', {
            index: room.currentQuestion, total: round.questions.length,
            question: q.question, options: q.options, timeLimit: remaining,
            type: q.type || 'normal', imageUrl: q.imageUrl,
            roundName: round.name, roundIndex: room.currentRound, totalRounds: room.roundPlan.length,
            isPari: round.name === 'pari' || undefined,
          });
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
      await loadRoundQuestions(room.roundPlan, room.settings.difficulty);

      const first = room.roundPlan[0];
      io.to(code).emit('game_started', {
        totalRounds: room.roundPlan.length,
        firstRound:  first ? first.name : 'culture',
        teamMode:    room.settings.teamMode,
        teams:       room.teams,
        players:     room.players,
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
    const correct = answerIndex === q.correctIndex;
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

    socket.emit('answer_result', { correct, correctIndex: q.correctIndex, points });
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
    players:  room.players,
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

server.listen(PORT, () => {
  console.log(`\n🎮 QuizzRoom → http://localhost:${PORT}\n`);
});

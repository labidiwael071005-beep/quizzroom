// public/js/game.js — Logique de la page de jeu

// ── Sécurité : échappement HTML pour toute donnée user-controlled ────
// (pseudos, emojis avatar) avant injection via innerHTML. Les questions de la
// banque sont aussi échappées par défense en profondeur.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const roomCode   = sessionStorage.getItem('qr_room');
const playerData = JSON.parse(sessionStorage.getItem('qr_player') || '{}');
const settings   = JSON.parse(sessionStorage.getItem('qr_settings') || '{}');
let   isHost     = sessionStorage.getItem('qr_host') === 'true';

if (!roomCode || !playerData.name) window.location.href = 'index.html';

// ── État local ────────────────────────────────────────────────
let myScore        = 0;
let answered       = false;
let timerInterval  = null;
let countdownTimer = null;
let currentPlayers = [];
let currentTeams   = [];
let teamMode       = false;
let pariBalance    = 0;
let pariRevealed   = false;
let currentQ       = null;
let pixelLevelMax  = 4;
let pixelRevealCount = 0;
let roundIntroJustShown = false;
let gameHistory    = [];

const LETTERS      = ['A','B','C','D'];

// Libellé de manche résolu À L'AFFICHAGE via i18n (pas une constante figée au
// chargement, sinon il ne suivrait pas la langue choisie). Fallback FR intégré.
const ROUND_LABEL_KEYS = {
  culture: ['game.round.culture', 'Culture G'],
  geo:     ['game.round.geo',     'GéoQuizz'],
  geomap:  ['game.round.geo',     'GéoQuizz'],
  pixel:   ['game.round.pixel',   'Manche Pixel'],
  pari:    ['game.round.pari',    'Manche Pari'],
};
function roundLabel(roundName) {
  const e = ROUND_LABEL_KEYS[roundName];
  return e ? t(e[0], e[1]) : (roundName || '');
}

// Méta de manche « Manche X/Y — N question(s) », pluriel géré simplement.
function roundMeta(roundIndex, totalRounds, qCount) {
  const word = qCount > 1
    ? t('game.round.questions', 'questions')
    : t('game.round.question', 'question');
  return t('game.round.meta', 'Manche {n}/{total} — {count} {questions}', {
    n: roundIndex + 1, total: totalRounds, count: qCount, questions: word,
  });
}

// Résout la traduction d'une question dans la langue active du joueur.
// La fonction se contente de réécrire les champs legacy (question, options,
// explanation, label, country) avec leur version traduite, avec fallback
// preferred → fr → en → première dispo. Si translations est absent ou vide,
// on renvoie data tel quel : les champs legacy serviront de fallback ultime.
function localizeQuestion(data) {
  if (!data || !data.translations) return data;
  const tr = (typeof window.pickQuestionTranslation === 'function')
    ? window.pickQuestionTranslation(data.translations, (window.getLang && window.getLang()) || 'fr')
    : null;
  if (!tr) return data;
  if (tr.text)        data.question    = tr.text;
  if (tr.options)     data.options     = tr.options;
  if (tr.explanation) data.explanation = tr.explanation;
  if (tr.label)       data.label       = tr.label;
  if (tr.country)     data.country     = tr.country;
  return data;
}

// Libellés de statut affichés sous chaque avatar — résolus à l'affichage via i18n
// (clés avatar.status.*) avec fallback FR intégré.
const AV_STATUS_KEYS = {
  thinking:    ['avatar.status.thinking', '🤔 Réfléchit…'],
  answered:    ['avatar.status.answered', '✏️ A répondu'],
  correct:     ['avatar.status.correct',  '✅ Juste !'],
  wrong:       ['avatar.status.wrong',    '❌ Faux'],
  'no-answer': ['avatar.status.noanswer', '💤 Absent'],
};
function avStatusLabel(status) {
  const e = AV_STATUS_KEYS[status];
  return e ? t(e[0], e[1]) : '';
}
let currentScreenId = '';

// ── Affichage ─────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.game-screen').forEach(s => s.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
  currentScreenId = id;

  // Le sablier vit normalement dans .stage-main (top-right absolute). Pour la manche geomap
  // on le déplace dans la sidebar pour éviter qu'il chevauche le bouton/hint.
  const hg = document.getElementById('hourglass-wrap');
  const slot = document.getElementById('hourglass-slot');
  const stage = document.querySelector('.stage-main');
  if (id === 'screen-geomap' && slot && hg.parentElement !== slot) {
    slot.appendChild(hg);
  } else if (id !== 'screen-geomap' && stage && hg.parentElement !== stage) {
    stage.appendChild(hg);
  }

  // Sablier : auto pour screen-question + screen-geomap.
  // Pixel et pari le gèrent eux-mêmes (caché pendant reveal/mise, visible pendant la réponse)
  if (id === 'screen-question' || id === 'screen-geomap') {
    hg.style.display = 'flex';
  } else if (id !== 'screen-pixel' && id !== 'screen-pari') {
    hg.style.display = 'none';
  }
}

function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'toast ' + type;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ── Countdown ─────────────────────────────────────────────────
function runCountdown(from, cb) {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  showScreen('screen-countdown');
  const el = document.getElementById('countdown-num');
  let n = from;
  el.textContent = n;
  countdownTimer = setInterval(() => {
    n--;
    if (n <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      cb();
    } else {
      el.style.animation = 'none';
      el.offsetHeight;
      el.style.animation = '';
      el.textContent = n;
    }
  }, 1000);
}

// ── Timer : anneau de progression ─────────────────────────────
// VISUEL uniquement : la logique (durée serveur, décompte 1s, fin de temps,
// urgence ≤5s, callback d'expiration) est rigoureusement identique à avant —
// on remplace seulement le sablier par un anneau qui se vide.
let onTimerExpireCb = null;
const RING_C = 2 * Math.PI * 44;   // circonférence de l'anneau (r=44 dans le viewBox)

function startTimer(seconds, onExpire = null) {
  clearInterval(timerInterval);
  onTimerExpireCb = onExpire;
  const num  = document.getElementById('timer-num');
  const ring = document.getElementById('timer-ring-fill');
  const wrap = document.getElementById('hourglass-wrap');

  let remaining = seconds;
  if (num)  num.classList.remove('urgent');
  if (wrap) wrap.classList.remove('urgent');
  if (ring) {
    ring.style.strokeDasharray = RING_C.toFixed(2);
    // Pose initiale "plein" sans animation (évite un balayage parasite au démarrage)
    ring.style.transition = 'none';
    ring.style.strokeDashoffset = '0';
    void ring.getBoundingClientRect();
    ring.style.transition = '';
  }

  function tick() {
    if (num) num.textContent = Math.max(0, remaining);
    const pct = Math.max(0, Math.min(1, remaining / seconds));
    // offset : 0 = plein, C = vide → l'anneau se vide en glissant (transition CSS 1s linéaire)
    if (ring) ring.style.strokeDashoffset = (RING_C * (1 - pct)).toFixed(2);

    if (remaining <= 5) { if (num) num.classList.add('urgent'); if (wrap) wrap.classList.add('urgent'); }

    if (remaining <= 0) {
      clearInterval(timerInterval);
      const cb = onTimerExpireCb; onTimerExpireCb = null;
      if (cb) try { cb(); } catch(e) { console.error('[timer] expire cb', e); }
      return;
    }
    remaining--;
  }
  tick();
  timerInterval = setInterval(tick, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  onTimerExpireCb = null;     // un stop volontaire annule le callback d'expiration
}

// ── Panneau d'avatars (joueurs autour du plateau) ─────────────
function renderAvatarsPanel(players) {
  const panel = document.getElementById('avatars-panel');
  if (!panel) return;
  panel.innerHTML = (players || []).map(p => {
    const av    = p.avatar || { colorIdx: 0, emoji: '🎮' };
    const isMe  = p.name === playerData.name;
    const team  = currentTeams.find(t => t.id === p.teamId);
    const ring  = team ? `border-color:${team.color}` : '';
    const reportBtn = isMe ? '' :
      `<button class="av-report-btn" data-action="report" data-name="${escapeHtml(p.name)}" title="${escapeHtml(t('report.player.menu', '🚩 Signaler'))}" aria-label="${escapeHtml(t('report.player.title', 'Signaler ce joueur'))}">⋮</button>`;
    return `
      <div class="av-player-slot ${isMe ? 'me' : ''}" id="av-slot-${sanitizeId(p.name)}">
        ${reportBtn}
        <div class="av-player-icon thinking" id="av-icon-${sanitizeId(p.name)}"
             style="${getAvatarStyle(av)};${ring}">
          ${escapeHtml(av.emoji)}
        </div>
        <div class="av-player-name">${isMe ? '★ ' : ''}${escapeHtml(p.name)}</div>
        <div class="av-player-status thinking" id="av-status-${sanitizeId(p.name)}">${escapeHtml(avStatusLabel('thinking'))}</div>
        <div class="av-player-score" id="av-score-${sanitizeId(p.name)}">${p.score || 0} pts</div>
      </div>`;
  }).join('');
  // Bouton « Signaler » par joueur (autres que soi) → modale partagée.
  panel.querySelectorAll('[data-action="report"]').forEach(b => {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (typeof openPlayerReport === 'function') openPlayerReport(b.dataset.name, roomCode);
    });
  });
  sizeAvatarBar(panel, (players || []).length);
}

// Barre joueurs horizontale : taille d'avatar adaptative pour que TOUS tiennent
// sur la largeur sans débordement ni scroll. Combine une borne par nombre de
// joueurs (64px à 2 → 32px à 8) ET la largeur réellement disponible.
function sizeAvatarBar(panel, n) {
  if (!panel || !n) return;
  const countSize = Math.max(32, Math.min(64, Math.round(64 - (n - 2) * (64 - 32) / 6)));
  const avail     = panel.clientWidth || window.innerWidth || 360;
  const gap       = 8;
  const widthSize = Math.floor((avail - gap * (n + 1)) / n) - 10; // marge pour le pseudo
  const size      = Math.max(26, Math.min(countSize, widthSize, 64));
  panel.style.setProperty('--avatar-size', size + 'px');
}

// Recalcule la taille des avatars au redimensionnement (pas de scroll horizontal).
window.addEventListener('resize', () => {
  const panel = document.getElementById('avatars-panel');
  if (panel && currentPlayers && currentPlayers.length) sizeAvatarBar(panel, currentPlayers.length);
});

function sanitizeId(name) { return (name || '').replace(/[^a-zA-Z0-9]/g, '_'); }

function setAvatarStatus(playerName, status) {
  const icon = document.getElementById(`av-icon-${sanitizeId(playerName)}`);
  if (icon) {
    icon.className = `av-player-icon ${status}`;
    const badge = { correct: '✅', wrong: '❌', answered: '✏️', 'no-answer': '💤' }[status];
    const existing = icon.querySelector('.av-status-badge');
    if (existing) existing.remove();
    if (badge) {
      const b = document.createElement('span');
      b.className   = 'av-status-badge';
      b.textContent = badge;
      icon.appendChild(b);
    }
  }
  const txt = document.getElementById(`av-status-${sanitizeId(playerName)}`);
  if (txt) {
    txt.textContent = avStatusLabel(status);
    txt.className   = `av-player-status ${status}`;
  }
}

function resetAvatarStatuses() {
  document.querySelectorAll('.av-player-icon').forEach(el => {
    el.className = 'av-player-icon thinking';
    const b = el.querySelector('.av-status-badge');
    if (b) b.remove();
  });
  document.querySelectorAll('.av-player-status').forEach(el => {
    el.textContent = avStatusLabel('thinking');
    el.className   = 'av-player-status thinking';
  });
}

function updateAvatarScores(players) {
  (players || []).forEach(p => {
    const el = document.getElementById(`av-score-${sanitizeId(p.name)}`);
    if (el) el.textContent = `${p.score || 0} pts`;
  });
}

// ── Annonce de manche (effet plateau TV) ──────────────────────
function displayRoundIntro({ roundName, roundIndex, totalRounds, qCount }) {
  document.getElementById('round-intro-name').textContent = roundLabel(roundName);
  document.getElementById('round-intro-meta').textContent = roundMeta(roundIndex, totalRounds, qCount);
  // Trigger animation reset
  const wrap = document.querySelector('.round-intro-wrap');
  if (wrap) { wrap.style.animation = 'none'; void wrap.offsetWidth; wrap.style.animation = ''; }
  showScreen('screen-round-intro');
  roundIntroJustShown = true;
}

// ── Question normale ──────────────────────────────────────────
function displayQuestion(data) {
  // Localisation : applique translations[locale] (fallback locale → fr → en → 1ʳᵉ dispo).
  localizeQuestion(data);
  const { index, total, question, options, timeLimit, roundName } = data;
  answered  = false;
  currentQ  = { index, total, question, options, timeLimit };

  document.getElementById('hud-q-index').textContent = index + 1;
  document.getElementById('hud-q-total').textContent  = total;
  document.getElementById('hud-round').textContent    = roundLabel(roundName);
  document.getElementById('progress-bar').style.width = (index / total * 100) + '%';
  document.getElementById('q-theme').textContent      = roundLabel(roundName);
  document.getElementById('question-text').textContent = question;

  const grid = document.getElementById('answers-grid');
  grid.innerHTML = options.map((opt, i) => `
    <button class="answer-btn" data-index="${i}" onclick="submitAnswer(${i})">
      <span class="answer-letter">${LETTERS[i]}</span>${escapeHtml(opt)}
    </button>`).join('');

  resetAvatarStatuses();
  showScreen('screen-question');
  startTimer(timeLimit);
}

function submitAnswer(index) {
  if (answered) return;
  answered = true;
  // Le sablier se cache pour ce joueur (les autres voient toujours le leur tourner)
  stopTimer();
  document.getElementById('hourglass-wrap').style.display = 'none';

  // Cibler uniquement le grid actif (sinon on tape dans answers-grid caché en mode pari)
  const gridSelector = pariRevealed ? '#pari-answers-grid .answer-btn' : '#answers-grid .answer-btn';
  document.querySelectorAll(gridSelector).forEach((btn, i) => {
    btn.disabled = true;
    if (i === index) btn.classList.add('selected');
  });

  setAvatarStatus(playerData.name, 'answered');
  const bet = pariRevealed ? getCurrentBet() : undefined;
  socket.emit('submit_answer', { code: roomCode, answerIndex: index, betAmount: bet });
}

// ── Manche Pixel ─────────────────────────────────────────────
function displayPixelQuestion(data) {
  // Localisation : applique translations[locale] (fallback locale → fr → en → 1ʳᵉ dispo).
  localizeQuestion(data);
  const { index, total, question, options, imageUrl } = data;
  answered       = false;
  pixelRevealCount = 0;

  document.getElementById('hud-q-index').textContent = index + 1;
  document.getElementById('hud-q-total').textContent  = total;
  document.getElementById('hud-round').textContent    = roundLabel('pixel');
  document.getElementById('progress-bar').style.width = (index / total * 100) + '%';

  const grid = document.getElementById('pixel-answers-grid');
  grid.innerHTML = options.map((opt, i) => `
    <button class="answer-btn" data-index="${i}" onclick="submitPixelAnswer(${i})">
      <span class="answer-letter">${LETTERS[i]}</span>${escapeHtml(opt)}
    </button>`).join('');

  resetAvatarStatuses();
  showScreen('screen-pixel');

  // Cache le sablier pendant la dépixellisation : il n'apparaît que quand l'image est claire
  document.getElementById('hourglass-wrap').style.display = 'none';
  document.getElementById('pixel-level-fill').style.width = '12%';

  // Init canvas APRÈS showScreen pour que les dimensions soient calculées
  initPixelCanvas('pixel-canvas');
  console.log('[pixel] loading image:', imageUrl);
  loadPixelImage(imageUrl, () => {
    console.log('[pixel] image ready, starting reveal');
    // 4 niveaux × 2,5s = 10s de dépixellisation, puis timer 10s
    startPixelReveal(() => {
      console.log('[pixel] image fully revealed → 10s timer');
      document.getElementById('hourglass-wrap').style.display = 'flex';
      startTimer(10);
    });
  });

  // Barre de progression de la dépixellisation (synchro avec REVEAL_INTERVAL=2500)
  const levelTimer = setInterval(() => {
    pixelRevealCount++;
    const pct = Math.min(100, (pixelRevealCount / pixelLevelMax) * 100);
    document.getElementById('pixel-level-fill').style.width = pct + '%';
    if (pixelRevealCount >= pixelLevelMax) clearInterval(levelTimer);
  }, 2500);
}

function submitPixelAnswer(index) {
  if (answered) return;
  answered = true;
  stopTimer();
  document.getElementById('hourglass-wrap').style.display = 'none';

  document.querySelectorAll('#pixel-answers-grid .answer-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (i === index) btn.classList.add('selected');
  });

  setAvatarStatus(playerData.name, 'answered');
  socket.emit('submit_answer', { code: roomCode, answerIndex: index });
}

// ── Manche Geo (carte interactive) ────────────────────────────
function displayGeomapQuestion(data) {
  // Localisation : applique translations[locale] (fallback locale → fr → en → 1ʳᵉ dispo).
  localizeQuestion(data);
  const { index, total, question, timeLimit } = data;
  answered = false;
  currentQ = { index, total, question, timeLimit };

  document.getElementById('hud-q-index').textContent  = index + 1;
  document.getElementById('hud-q-total').textContent  = total;
  document.getElementById('hud-round').textContent    = roundLabel('geo');
  document.getElementById('progress-bar').style.width = (index / total * 100) + '%';

  document.getElementById('geomap-question').textContent = question;
  document.getElementById('geomap-hint').innerHTML       = `<i class="ti ti-pointer"></i><span>${escapeHtml(t('game.geo.hint', 'Clique sur la carte pour placer ton point'))}</span>`;
  document.getElementById('geomap-hint').style.display   = 'flex';
  document.getElementById('geomap-results-panel').style.display = 'none';
  const btn = document.getElementById('geo-validate-btn');
  btn.disabled = true;
  btn.innerHTML = `<i class="ti ti-check"></i><span>${escapeHtml(t('game.geo.validate', 'Valider !'))}</span>`;

  resetAvatarStatuses();
  showScreen('screen-geomap');
  // Init carte APRÈS l'affichage du screen pour que les dimensions soient calculées
  setTimeout(() => {
    initGeoMap('geo-map');
    // Force un refresh de la taille (Leaflet bug courant en flex / display:none)
    setTimeout(invalidateGeoMapSize, 100);
  }, 50);

  // À l'expiration du timer : si l'user a placé un point sans valider, on auto-soumet.
  // Sinon il sera dans le reveal en "pas de réponse"
  startTimer(timeLimit || 20, () => {
    if (answered) return;
    const guess = getGeoGuess();
    if (guess) {
      console.log('[geo] auto-submit du marker placé non validé');
      submitGeoAnswer(true);   // true = isAuto → toast affiché
    }
  });
}

function submitGeoAnswer(isAuto = false) {
  if (answered) return;
  const guess = getGeoGuess();
  if (!guess) return;
  answered = true;
  stopTimer();
  document.getElementById('hourglass-wrap').style.display = 'none';
  lockGeoAnswer();
  setAvatarStatus(playerData.name, 'answered');
  socket.emit('submit_answer', { code: roomCode, lat: guess.lat, lng: guess.lng });
  if (isAuto) showToast(t('game.geo.autosubmit', '⏰ Temps écoulé — ton point a été envoyé automatiquement'), 'success');
}

// ── Manche Pari ───────────────────────────────────────────────
function displayPariQuestion(data) {
  // Localisation : applique translations[locale] (fallback locale → fr → en → 1ʳᵉ dispo).
  localizeQuestion(data);
  const { index, total, question, options, timeLimit } = data;
  answered     = false;
  pariRevealed = false;
  pariBalance  = myScore;
  currentQ     = { index, total, question, options, timeLimit };

  document.getElementById('hud-q-index').textContent = index + 1;
  document.getElementById('hud-q-total').textContent  = total;
  document.getElementById('hud-round').textContent    = roundLabel('pari');
  document.getElementById('progress-bar').style.width = (index / total * 100) + '%';

  document.getElementById('pari-question-text').textContent = question;
  document.getElementById('pari-balance').textContent = pariBalance;

  // Reset complet du slider (était disabled si Q précédente)
  const slider = document.getElementById('pari-slider');
  slider.disabled = false;
  slider.max      = Math.max(pariBalance, 1);
  slider.value    = Math.floor(pariBalance * 0.5);
  updatePariDisplay();

  // Reset bouton + grid + waiting indicator (résidus de la Q précédente)
  document.getElementById('pari-answers-grid').style.display = 'none';
  document.getElementById('pari-answers-grid').innerHTML     = '';
  document.getElementById('pari-reveal-btn').style.display   = 'block';
  document.getElementById('pari-waiting')?.remove();

  resetAvatarStatuses();
  showScreen('screen-pari');
  // Sablier caché pendant la phase de mise — il apparaîtra quand pari_reveal arrive
  document.getElementById('hourglass-wrap').style.display = 'none';
}

function updatePariDisplay() {
  const slider = document.getElementById('pari-slider');
  const bet    = parseInt(slider.value);
  document.getElementById('pari-bet-pts').textContent = bet;
  const pct = pariBalance > 0 ? (bet / pariBalance * 100) : 0;
  slider.style.setProperty('--pct', pct + '%');
}

function getCurrentBet() {
  return parseInt(document.getElementById('pari-slider')?.value || 0);
}

function revealPariAnswers() {
  pariRevealed = true;
  document.getElementById('pari-reveal-btn').style.display = 'none';

  // Bloquer le slider pour figer la mise
  const slider = document.getElementById('pari-slider');
  if (slider) slider.disabled = true;

  // Indicateur d'attente
  const waitMsg = document.createElement('div');
  waitMsg.id = 'pari-waiting';
  waitMsg.style.cssText = 'text-align:center;color:var(--text-muted);font-size:14px;margin-top:8px';
  waitMsg.textContent = t('game.pari.waiting', '⏳ En attente des autres joueurs...');
  document.querySelector('.pari-wrap')?.appendChild(waitMsg);

  // Dit au serveur "j'ai misé X" — il déclenchera pari_reveal pour tous quand tous prêts
  socket.emit('pari_miser_done', { code: roomCode, betAmount: getCurrentBet() });
}

// ── Résultat ──────────────────────────────────────────────────
// Colore les boutons de réponse : la bonne en vert, la sélection erronée en rouge.
function colorAnswerButtons(correctIndex) {
  ['answers-grid','pixel-answers-grid','pari-answers-grid'].forEach(id => {
    document.querySelectorAll(`#${id} .answer-btn`).forEach((btn, i) => {
      btn.disabled = true;
      if (i === correctIndex) btn.classList.add('correct');
      else if (btn.classList.contains('selected')) btn.classList.add('wrong');
    });
  });
}

// ── Écran « Le savais-tu ? » (affiché entre chaque question et chaque manche)
function displayRevealScreen({ question, correctAnswer, explanation }) {
  document.getElementById('reveal-screen-question').textContent = question || '';
  document.getElementById('reveal-screen-answer').textContent   = correctAnswer || '—';
  const txt = (explanation || '').trim()
    ? explanation
    : t('game.reveal.noanecdote', "Pas encore d'anecdote pour cette question — elle arrivera bientôt !");
  document.getElementById('reveal-screen-text').textContent = txt;
  showScreen('screen-reveal');
}

function displayResult({ correct, correctIndex, points }) {
  colorAnswerButtons(correctIndex);
  setAvatarStatus(playerData.name, correct ? 'correct' : 'wrong');

  if (correct) {
    myScore += points || 100;
  } else if (points && points < 0) {
    // Pari perdu
    myScore = Math.max(0, myScore + points);
  }
  // Update immédiat de mon score sur l'avatar (les autres joueurs verront via scores_update / round_ended)
  const myScoreEl = document.getElementById(`av-score-${sanitizeId(playerData.name)}`);
  if (myScoreEl) myScoreEl.textContent = `${myScore} pts`;
}

// ── Scores ────────────────────────────────────────────────────
function displayScores({ players, teams: teamsArr, teamMode: tm }) {
  currentPlayers = players;
  currentTeams   = teamsArr || [];
  teamMode       = tm || false;

  // Mettre à jour les scores affichés sur les avatars
  updateAvatarScores(players);

  if (tm && teamsArr && teamsArr.length > 0) {
    const sorted = [...teamsArr].sort((a, b) => b.score - a.score);
    document.getElementById('scores-list').innerHTML = sorted.map((team, i) => `
      <div class="team-score-item" style="animation-delay:${i*0.08}s">
        <div class="team-color-bar" style="background:${team.color}"></div>
        <span class="team-score-name">${escapeHtml(team.name)}</span>
        <span class="team-score-pts">${team.score} pts</span>
      </div>`).join('');
  } else {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    document.getElementById('scores-list').innerHTML = sorted.map((p, i) => {
      const isMe   = p.name === playerData.name;
      const rankEl = ['🥇','🥈','🥉'][i] || `<span class="score-rank">${i+1}</span>`;
      const av     = p.avatar || { colorIdx: i % 8, emoji: '🎮' };
      return `
        <div class="score-item ${isMe ? 'me' : ''}" style="animation-delay:${i*0.08}s">
          <div style="font-size:22px;min-width:28px;text-align:center">${rankEl}</div>
          <span class="av-inline av-sm" style="${getAvatarStyle(av)}">${escapeHtml(av.emoji)}</span>
          <span class="score-name">${escapeHtml(p.name)}${isMe ? ' <span style="color:var(--orange);font-size:11px">(toi)</span>' : ''}</span>
          <span class="score-pts">${p.score} pts</span>
        </div>`;
    }).join('');
  }

  showScreen('screen-scores');
}

// ── Game Over ─────────────────────────────────────────────────
function displayGameOver(ranking, tm) {
  stopTimer();
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  stopPixelReveal();

  const medals = ['🥇','🥈','🥉'];
  document.getElementById('gameover-ranking').innerHTML = ranking.map((item, i) => {
    const isMe = item.name === playerData.name;
    const av   = item.avatar;
    const avHtml = av ? `<span class="av-inline av-sm" style="${getAvatarStyle(av)}">${escapeHtml(av.emoji)}</span>` : '';
    return `
      <div class="score-item ${isMe ? 'me' : ''}" style="animation-delay:${i*0.1}s">
        <span style="font-size:22px;min-width:28px;text-align:center">
          ${medals[i] || `<span class="score-rank">${i+1}</span>`}
        </span>
        ${tm && item.color ? `<span class="team-dot" style="background:${item.color};width:12px;height:12px;border-radius:50%"></span>` : avHtml}
        <span class="score-name">${escapeHtml(item.name)}${isMe ? ' (toi)' : ''}</span>
        <span class="score-pts">${item.score} pts</span>
      </div>`;
  }).join('');

  showScreen('screen-gameover');
  // ⚠️ Ne PAS clear sessionStorage : le joueur peut retourner au lobby
}

function goHome() {
  sessionStorage.clear();
  window.location.href = 'index.html';
}

// ── Récap de partie (historique question par question) ───────
function displayGameHistory() {
  const list = document.getElementById('history-list');
  if (!gameHistory.length) {
    list.innerHTML = `<p style="text-align:center;color:var(--text-muted)">${escapeHtml(t('game.history.empty', 'Aucun historique disponible.'))}</p>`;
  } else {
    const lang = (window.getLang && window.getLang()) || 'fr';
    list.innerHTML = gameHistory.map((h, qi) => {
      const roundLbl = roundLabel(h.round);
      // Résolution multilingue : on prend la version traduite si dispo,
      // sinon fallback sur les champs legacy.
      const tr = (h.translations && typeof window.pickQuestionTranslation === 'function')
        ? window.pickQuestionTranslation(h.translations, lang)
        : null;
      const qText      = tr?.text          || h.question      || '';
      const correctTxt = (tr?.options && Number.isInteger(h.correctIndex)
                          && tr.options[h.correctIndex] != null)
                          ? tr.options[h.correctIndex]
                          : (h.correctAnswer || '—');
      const rows = h.results.map(r => {
        const av   = r.avatar || { colorIdx: 0, emoji: '🎮' };
        const isMe = r.name === playerData.name;
        let answerHtml;
        if (!r.answered) {
          answerHtml = `<span class="hist-noanswer">${escapeHtml(t('game.history.noanswer', 'pas de réponse'))}</span>`;
        } else if (h.type === 'geomap') {
          answerHtml = `${r.distance != null ? r.distance + ' km' : '—'}`;
        } else if (tr?.options && Number.isInteger(r.answerIndex)
                   && tr.options[r.answerIndex] != null) {
          answerHtml = escapeHtml(tr.options[r.answerIndex]);
        } else {
          answerHtml = r.answer != null ? escapeHtml(r.answer) : '—';
        }
        const mark   = !r.answered ? '⛔' : (r.correct ? '✅' : '❌');
        const ptsCls = r.points > 0 ? 'pos' : (r.points < 0 ? 'neg' : '');
        const ptsTxt = (r.points > 0 ? '+' : '') + r.points + ' pts';
        return `
          <div class="hist-player-row ${isMe ? 'me' : ''}">
            <span class="av-inline av-xs" style="${getAvatarStyle(av)}">${escapeHtml(av.emoji)}</span>
            <span class="hist-player-name">${escapeHtml(r.name)}</span>
            <span class="hist-player-answer">${answerHtml}</span>
            <span class="hist-mark">${mark}</span>
            <span class="hist-pts ${ptsCls}">${ptsTxt}</span>
          </div>`;
      }).join('');
      const qid = h.questionId ? escapeHtml(h.questionId) : '';
      const reportTitle = escapeHtml(t('report.title', 'Signaler cette question'));
      const reportBtn = qid
        ? `<button class="hist-report-btn" data-action="report" data-qid="${qid}" title="${reportTitle}" aria-label="${reportTitle}">
             <i class="ti ti-flag"></i>
           </button>`
        : '';
      return `
        <div class="hist-card" style="animation-delay:${Math.min(qi, 12) * 0.04}s">
          <div class="hist-card-head">
            <span class="badge badge-purple">${escapeHtml(roundLbl)}</span>
            <span class="hist-qnum">${escapeHtml(t('game.history.qnum', 'Question {n}', { n: qi + 1 }))}</span>
            ${reportBtn}
          </div>
          <div class="hist-question">${escapeHtml(qText)}</div>
          <div class="hist-correct">✔ ${escapeHtml(t('game.history.correct', 'Bonne réponse :'))} <strong>${escapeHtml(correctTxt)}</strong></div>
          <div class="hist-players">${rows}</div>
        </div>`;
    }).join('');
    // Branche les boutons de signalement (Phase 5)
    list.querySelectorAll('[data-action="report"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof window.openReportModal === 'function') {
          window.openReportModal(btn.dataset.qid, btn);
        }
      });
    });
  }
  showScreen('screen-history');
}

function backToGameOver() {
  showScreen('screen-gameover');
}

// ── Modal de signalement (Phase 5) ───────────────────────────
const reportedQuestions = new Set();
let reportCurrentQid     = null;
let reportCurrentBtn     = null;

function openReportModal(questionId, originBtn) {
  if (!questionId) return;
  if (reportedQuestions.has(questionId)) return;
  reportCurrentQid = questionId;
  reportCurrentBtn = originBtn || null;

  // Reset du formulaire à chaque ouverture
  document.querySelectorAll('#report-cats input[name="report-cat"]').forEach(r => { r.checked = false; });
  document.querySelectorAll('#report-cats .report-cat').forEach(l => l.classList.remove('selected'));
  document.getElementById('report-comment').value = '';
  document.getElementById('report-send').disabled = true;

  document.getElementById('report-overlay').classList.add('show');
}

function closeReportModal() {
  document.getElementById('report-overlay').classList.remove('show');
  reportCurrentQid = null;
  reportCurrentBtn = null;
}

async function sendReport() {
  if (!reportCurrentQid) return;
  const selected = document.querySelector('#report-cats input[name="report-cat"]:checked');
  if (!selected) return;
  const category = selected.value;
  const comment  = document.getElementById('report-comment').value.trim();
  const language = (window.getLang && window.getLang()) || 'fr';
  const sendBtn  = document.getElementById('report-send');
  sendBtn.disabled = true;

  try {
    const r = await fetch('/api/report', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: reportCurrentQid,
        category,
        comment:  comment || undefined,
        language,
        roomCode: roomCode || undefined,
      }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.ok) {
      showToast(t('report.error', 'Erreur :') + ' ' + (json.error || t('report.error.send', 'envoi impossible')), 'error');
      sendBtn.disabled = false;
      return;
    }
    reportedQuestions.add(reportCurrentQid);
    if (reportCurrentBtn) {
      reportCurrentBtn.classList.add('sent');
      reportCurrentBtn.innerHTML = '<i class="ti ti-check"></i>';
      reportCurrentBtn.title = t('report.sent', 'Signalement envoyé');
    }
    showToast(t('report.thanks', 'Merci, signalement envoyé'), 'success');
    closeReportModal();
  } catch (err) {
    showToast(t('report.error.network', 'Erreur réseau'), 'error');
    sendBtn.disabled = false;
  }
}

// Branche les listeners une seule fois au boot
(function initReportModal() {
  const overlay = document.getElementById('report-overlay');
  if (!overlay) return;
  // Toggle visuel + activation du bouton Envoyer quand une catégorie est cochée
  document.querySelectorAll('#report-cats .report-cat').forEach(label => {
    label.addEventListener('click', () => {
      // Délai 0 pour laisser le radio se cocher avant qu'on lise l'état
      setTimeout(() => {
        document.querySelectorAll('#report-cats .report-cat').forEach(l => l.classList.remove('selected'));
        const checked = document.querySelector('#report-cats input[name="report-cat"]:checked');
        if (checked) {
          checked.closest('.report-cat').classList.add('selected');
          document.getElementById('report-send').disabled = false;
        }
      }, 0);
    });
  });
  document.getElementById('report-cancel').addEventListener('click', closeReportModal);
  document.getElementById('report-cancel-x')?.addEventListener('click', closeReportModal);
  document.getElementById('report-send').addEventListener('click', sendReport);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeReportModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('show')) closeReportModal();
  });
})();

window.openReportModal = openReportModal;

// ── Quitter la partie en cours ───────────────────────────────
function leaveGame() {
  if (!confirm(t('game.leave.confirm', 'Quitter la partie en cours ? Tu retourneras à l\'accueil.'))) return;
  socket.emit('leave_game', { code: roomCode });
  sessionStorage.clear();
  window.location.href = 'index.html';
}

// ── Contrôle hôte : bouton "Suivante" ─────────────────────────
// Le serveur envoie { label, isGameOver, isLastInRound } : on (re)traduit le
// libellé côté client à partir des flags pour qu'il suive la langue choisie,
// avec fallback sur le `label` brut du serveur si les flags sont absents.
function hostControlLabel({ label, isGameOver, isLastInRound } = {}) {
  if (isGameOver)        return t('game.host.ranking',   '🏆 Voir le classement');
  if (isLastInRound)     return t('game.host.nextround', '➡️ Manche suivante');
  if (label === undefined) return t('game.host.next', 'Suivante');
  return t('game.host.nextq', 'Question suivante');
}

function showHostControl(info) {
  const btn = document.getElementById('host-control');
  const msg = document.getElementById('host-waiting-msg');
  if (isHost) {
    document.getElementById('host-control-label').textContent = hostControlLabel(info);
    btn.classList.add('visible');
    msg.classList.remove('visible');
  } else {
    msg.classList.add('visible');
    btn.classList.remove('visible');
  }
}

function hideHostControl() {
  document.getElementById('host-control')?.classList.remove('visible');
  document.getElementById('host-waiting-msg')?.classList.remove('visible');
}

function hostAdvance() {
  socket.emit('host_advance', { code: roomCode });
  hideHostControl();
}

// ── Socket.io ─────────────────────────────────────────────────
const socket = io();

socket.on('connect', () => {
  socket.emit('lobby_sync', { code: roomCode, playerName: playerData.name });
});

socket.on('awaiting_host', (info) => {
  showHostControl(info);
});

socket.on('round_intro', (data) => {
  stopTimer();
  stopPixelReveal();
  hideHostControl();
  displayRoundIntro(data);
});

socket.on('geomap_reveal', (data) => {
  // Tous les joueurs ont placé leur point → afficher la révélation sur la carte
  stopTimer();
  // Localisation du label/country/explanation pour le panneau de résultat
  if (data.translations) {
    const tr = (typeof window.pickQuestionTranslation === 'function')
      ? window.pickQuestionTranslation(data.translations, (window.getLang && window.getLang()) || 'fr')
      : null;
    if (tr) {
      if (tr.label)       data.correctLabel = tr.label;
      if (tr.country)     data.country      = tr.country;
      if (tr.explanation) data.explanation  = tr.explanation;
    }
  }
  // Statut juste/faux sur les avatars (selon la proximité du point)
  (data.guesses || []).forEach(g => {
    setAvatarStatus(g.name, !g.answered ? 'no-answer' : (g.correct ? 'correct' : 'wrong'));
  });
  showGeoReveal(data);
});

socket.on('pari_reveal', ({ timeLimit }) => {
  // Tous les joueurs ont misé (ou cap atteint) → afficher les réponses + timer 15s synchronisé
  document.getElementById('pari-waiting')?.remove();
  document.getElementById('pari-answers-grid').style.display = 'grid';
  document.getElementById('hourglass-wrap').style.display = 'flex';

  const opts = currentQ?.options || [];
  const grid = document.getElementById('pari-answers-grid');
  grid.innerHTML = opts.map((opt, i) => `
    <button class="answer-btn" data-index="${i}" onclick="submitAnswer(${i})">
      <span class="answer-letter">${LETTERS[i]}</span>${escapeHtml(opt)}
    </button>`).join('');

  startTimer(timeLimit || 15);
});

socket.on('new_question', (data) => {
  stopTimer();
  stopPixelReveal();
  hideHostControl();

  // Localisation : chaque fonction d'affichage (displayQuestion, displayPixelQuestion,
  // displayGeomapQuestion, displayPariQuestion) appelle localizeQuestion(data) en
  // tête, qui remplace question/options/explanation/label/country par leur version
  // dans la langue active (fallback locale → fr → en → 1ʳᵉ dispo). Si pas de
  // translations (vieille question pas encore migrée), on garde les champs legacy.
  roundIntroJustShown = false;

  const showQuestion = () => {
    if (data.type === 'pixel')        displayPixelQuestion(data);
    else if (data.type === 'geomap')  displayGeomapQuestion(data);
    else if (data.isPari)             displayPariQuestion(data);
    else                              displayQuestion(data);
  };

  // Transition rideaux : ferme (~0.5s) → échange le contenu → ouvre (~0.6s).
  // Le contenu est TOUJOURS affiché (rideaux ou pas) → OK 1ʳᵉ question & reconnexion.
  runQuestionTransition(showQuestion);
});

// ── Rideaux à chaque nouvelle question ────────────────────────
function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function runQuestionTransition(swapFn) {
  const cur   = document.getElementById('game-curtains');
  const stage = document.getElementById('stage');
  // Pas de rideaux dispo ou reduced-motion → échange instantané (jamais bloquant).
  if (!cur || prefersReducedMotion()) { swapFn(); return; }
  clearTimeout(cur._closeT); clearTimeout(cur._openT);
  cur.classList.remove('opening');
  cur.classList.add('closing');                 // fermeture (~0.5s)
  if (stage) stage.classList.add('curtains-busy');   // masque la carte géo pendant la fermeture
  cur._closeT = setTimeout(() => {
    swapFn();                                    // échange pendant que c'est fermé
    if (stage) stage.classList.remove('curtains-busy');  // carte ré-affichée (encore couverte par les rideaux)
    cur.classList.remove('closing');
    cur.classList.add('opening');                // ouverture (~0.6s) → options cliquables
    cur._openT = setTimeout(() => cur.classList.remove('opening'), 620);
  }, 520);
}

socket.on('answer_result', (data) => {
  displayResult(data);
});

// Un joueur vient de répondre → son avatar passe en « a répondu »
// (sans dévoiler s'il a juste ou faux : ça reste pour le reveal).
socket.on('player_answered', ({ name }) => {
  const icon = document.getElementById(`av-icon-${sanitizeId(name)}`);
  if (icon && (icon.classList.contains('correct') || icon.classList.contains('wrong'))) return;
  setAvatarStatus(name, 'answered');
});

// Reveal de fin de question (diffusé à tous) : statut juste/faux sur les avatars,
// puis bascule sur l'écran dédié « Le savais-tu ? » (anecdote + bonne réponse).
socket.on('question_reveal', ({ question, correctIndex, correctAnswer, explanation, results, translations }) => {
  colorAnswerButtons(correctIndex);  // sous-jacent ; l'écran-question est masqué par le switch
  (results || []).forEach(r => {
    setAvatarStatus(r.name, !r.answered ? 'no-answer' : (r.correct ? 'correct' : 'wrong'));
  });
  // Localisation du reveal : on remplace question/correctAnswer/explanation
  // par leur version traduite si dispo, sinon fallback aux champs legacy.
  if (translations) {
    const tr = (typeof window.pickQuestionTranslation === 'function')
      ? window.pickQuestionTranslation(translations, (window.getLang && window.getLang()) || 'fr')
      : null;
    if (tr) {
      if (tr.text)                                   question      = tr.text;
      if (tr.explanation)                            explanation   = tr.explanation;
      if (tr.options && Number.isInteger(correctIndex)
          && tr.options[correctIndex] != null)        correctAnswer = tr.options[correctIndex];
    }
  }
  displayRevealScreen({ question, correctAnswer, explanation });
});

socket.on('scores_update', (data) => {
  // Pas d'écran scores intermédiaire : on met juste à jour les scores sur les avatars.
  // La question reste affichée (avec ses boutons colorés) jusqu'à ce que l'hôte clique Suivante.
  if (data.players) updateAvatarScores(data.players);
});

socket.on('round_ended', (data) => {
  // Plus d'écran de classement intermédiaire : la question (ou la carte geomap)
  // et sa carte « Le savais-tu ? » restent affichées jusqu'à ce que l'hôte
  // lance la manche suivante. On met juste à jour les scores des avatars.
  if (data.players) updateAvatarScores(data.players);
});

socket.on('round_started', ({ roundName }) => {
  document.getElementById('hud-round').textContent = roundLabel(roundName);
});

// Anti-répétition : réservoir épuisé pour une manche → message discret, sans
// bloquer le passage à la manche suivante (géré par le serveur).
socket.on('round_exhausted', () => {
  showToast(t('game.round.exhausted', 'Plus de questions disponibles pour cette manche'), '');
});

socket.on('players_update', ({ players, teams: teamsArr }) => {
  currentPlayers = players;
  currentTeams   = teamsArr || [];
  renderAvatarsPanel(players);
});

socket.on('game_started', ({ teamMode: tm, teams: teamsArr, players: p }) => {
  teamMode     = tm || false;
  currentTeams = teamsArr || [];
  if (p) {
    currentPlayers = p;
    renderAvatarsPanel(p);
  }
});

socket.on('game_over', ({ ranking, teamMode: tm, history }) => {
  hideHostControl();
  gameHistory = Array.isArray(history) ? history : [];
  if (Array.isArray(ranking)) updateAvatarScores(ranking);
  setTimeout(() => displayGameOver(ranking, tm), 600);
});

socket.on('host_changed', ({ hostName }) => {
  if (hostName === playerData.name && !isHost) {
    isHost = true;
    sessionStorage.setItem('qr_host', 'true');
    showToast(t('toast.nowhost', '👑 Tu es maintenant l\'hôte de la partie'), 'success');
  }
});

socket.on('join_error', () => {
  showToast('❌ ' + (t('toast.not.found') || 'Partie introuvable'), 'error');
  setTimeout(() => window.location.href = 'index.html', 2000);
});

// L'hôte m'a exclu (peut survenir après la fin de partie si je suis resté sur le récap)
socket.on('kicked', ({ by }) => {
  showToast(t('toast.kicked', '🚫 Tu as été exclu du lobby par {by}', { by: by || t('lobby.host', "l'hôte") }), 'error');
  sessionStorage.clear();
  setTimeout(() => { window.location.href = 'index.html'; }, 1800);
});

// ── Init ──────────────────────────────────────────────────────
showScreen('screen-round-intro');
document.getElementById('round-intro-name').textContent = '...';
document.getElementById('round-intro-meta').textContent = t('game.round.preparing', 'Préparation');

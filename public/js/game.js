// public/js/game.js — Logique de la page de jeu

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

const ROUND_LABELS = { culture:'Culture G', geo:'GéoQuizz', pixel:'Manche Pixel', pari:'Manche Pari', geomap:'GéoQuizz' };
const LETTERS      = ['A','B','C','D'];

// Libellés de statut affichés sous chaque avatar
const AV_STATUS_LABELS = {
  thinking:    '🤔 Réfléchit…',
  answered:    '✏️ A répondu',
  correct:     '✅ Juste !',
  wrong:       '❌ Faux',
  'no-answer': '💤 Absent',
};
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

// ── Sablier animé ─────────────────────────────────────────────
let onTimerExpireCb = null;

function startTimer(seconds, onExpire = null) {
  clearInterval(timerInterval);
  onTimerExpireCb = onExpire;
  const sandTop = document.getElementById('hg-sand-top');
  const sandBot = document.getElementById('hg-sand-bot');
  const num     = document.getElementById('timer-num');
  const svg     = document.getElementById('hourglass-svg');

  // Dimensions cohérentes avec le viewBox 100x140 du SVG
  const TOP_BASE_Y = 16, TOP_FULL_H = 49;   // bulbe haut : y=16→65
  const BOT_BASE_Y = 124, BOT_FULL_H = 49;  // bulbe bas  : y=75→124

  let remaining = seconds;
  num.classList.remove('urgent');
  svg.classList.remove('urgent');
  svg.classList.add('flowing');

  // Mini "flip" pour signifier le démarrage
  svg.classList.remove('flip');
  void svg.offsetWidth;
  svg.classList.add('flip');

  function tick() {
    num.textContent = Math.max(0, remaining);
    const pct = Math.max(0, Math.min(1, remaining / seconds));

    const topH = TOP_FULL_H * pct;
    sandTop.setAttribute('y', TOP_BASE_Y + (TOP_FULL_H - topH));
    sandTop.setAttribute('height', topH);

    const botH = BOT_FULL_H * (1 - pct);
    sandBot.setAttribute('y', BOT_BASE_Y - botH);
    sandBot.setAttribute('height', botH);

    if (remaining <= 5) { num.classList.add('urgent'); svg.classList.add('urgent'); }

    if (remaining <= 0) {
      svg.classList.remove('flowing');
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
  document.getElementById('hourglass-svg')?.classList.remove('flowing');
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
    return `
      <div class="av-player-slot ${isMe ? 'me' : ''}" id="av-slot-${sanitizeId(p.name)}">
        <div class="av-player-icon thinking" id="av-icon-${sanitizeId(p.name)}"
             style="${getAvatarStyle(av)};${ring}">
          ${av.emoji}
        </div>
        <div class="av-player-name">${isMe ? '★ ' : ''}${p.name}</div>
        <div class="av-player-status thinking" id="av-status-${sanitizeId(p.name)}">${AV_STATUS_LABELS.thinking}</div>
        <div class="av-player-score" id="av-score-${sanitizeId(p.name)}">${p.score || 0} pts</div>
      </div>`;
  }).join('');
}

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
    txt.textContent = AV_STATUS_LABELS[status] || '';
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
    el.textContent = AV_STATUS_LABELS.thinking;
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
  document.getElementById('round-intro-name').textContent = ROUND_LABELS[roundName] || roundName;
  document.getElementById('round-intro-meta').textContent =
    `Manche ${roundIndex + 1}/${totalRounds} — ${qCount} question${qCount > 1 ? 's' : ''}`;
  // Trigger animation reset
  const wrap = document.querySelector('.round-intro-wrap');
  if (wrap) { wrap.style.animation = 'none'; void wrap.offsetWidth; wrap.style.animation = ''; }
  showScreen('screen-round-intro');
  roundIntroJustShown = true;
}

// ── Question normale ──────────────────────────────────────────
function displayQuestion({ index, total, question, options, timeLimit, roundName }) {
  answered  = false;
  currentQ  = { index, total, question, options, timeLimit };

  document.getElementById('hud-q-index').textContent = index + 1;
  document.getElementById('hud-q-total').textContent  = total;
  document.getElementById('hud-round').textContent    = ROUND_LABELS[roundName] || roundName;
  document.getElementById('progress-bar').style.width = (index / total * 100) + '%';
  document.getElementById('q-theme').textContent      = ROUND_LABELS[roundName] || roundName;
  document.getElementById('question-text').textContent = question;

  const grid = document.getElementById('answers-grid');
  grid.innerHTML = options.map((opt, i) => `
    <button class="answer-btn" data-index="${i}" onclick="submitAnswer(${i})">
      <span class="answer-letter">${LETTERS[i]}</span>${opt}
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
function displayPixelQuestion({ index, total, question, options, imageUrl }) {
  answered       = false;
  pixelRevealCount = 0;

  document.getElementById('hud-q-index').textContent = index + 1;
  document.getElementById('hud-q-total').textContent  = total;
  document.getElementById('hud-round').textContent    = 'Manche Pixel';
  document.getElementById('progress-bar').style.width = (index / total * 100) + '%';

  const grid = document.getElementById('pixel-answers-grid');
  grid.innerHTML = options.map((opt, i) => `
    <button class="answer-btn" data-index="${i}" onclick="submitPixelAnswer(${i})">
      <span class="answer-letter">${LETTERS[i]}</span>${opt}
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
function displayGeomapQuestion({ index, total, question, timeLimit }) {
  answered = false;
  currentQ = { index, total, question, timeLimit };

  document.getElementById('hud-q-index').textContent  = index + 1;
  document.getElementById('hud-q-total').textContent  = total;
  document.getElementById('hud-round').textContent    = 'GéoQuizz';
  document.getElementById('progress-bar').style.width = (index / total * 100) + '%';

  document.getElementById('geomap-question').textContent = question;
  document.getElementById('geomap-hint').innerHTML       = '<i class="ti ti-pointer"></i><span>Clique sur la carte pour placer ton point</span>';
  document.getElementById('geomap-hint').style.display   = 'flex';
  document.getElementById('geomap-results-panel').style.display = 'none';
  const btn = document.getElementById('geo-validate-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-check"></i><span>Valider !</span>';

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
  if (isAuto) showToast("⏰ Temps écoulé — ton point a été envoyé automatiquement", 'success');
}

// ── Manche Pari ───────────────────────────────────────────────
function displayPariQuestion({ index, total, question, options, timeLimit }) {
  answered     = false;
  pariRevealed = false;
  pariBalance  = myScore;
  currentQ     = { index, total, question, options, timeLimit };

  document.getElementById('hud-q-index').textContent = index + 1;
  document.getElementById('hud-q-total').textContent  = total;
  document.getElementById('hud-round').textContent    = 'Manche Pari';
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
  waitMsg.textContent = '⏳ En attente des autres joueurs...';
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
    : "Pas encore d'anecdote pour cette question — elle arrivera bientôt !";
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
        <span class="team-score-name">${team.name}</span>
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
          <span class="av-inline av-sm" style="${getAvatarStyle(av)}">${av.emoji}</span>
          <span class="score-name">${p.name}${isMe ? ' <span style="color:var(--orange);font-size:11px">(toi)</span>' : ''}</span>
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
    const avHtml = av ? `<span class="av-inline av-sm" style="${getAvatarStyle(av)}">${av.emoji}</span>` : '';
    return `
      <div class="score-item ${isMe ? 'me' : ''}" style="animation-delay:${i*0.1}s">
        <span style="font-size:22px;min-width:28px;text-align:center">
          ${medals[i] || `<span class="score-rank">${i+1}</span>`}
        </span>
        ${tm && item.color ? `<span class="team-dot" style="background:${item.color};width:12px;height:12px;border-radius:50%"></span>` : avHtml}
        <span class="score-name">${item.name}${isMe ? ' (toi)' : ''}</span>
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
    list.innerHTML = '<p style="text-align:center;color:var(--text-muted)">Aucun historique disponible.</p>';
  } else {
    list.innerHTML = gameHistory.map((h, qi) => {
      const roundLabel = ROUND_LABELS[h.round] || h.round;
      const rows = h.results.map(r => {
        const av   = r.avatar || { colorIdx: 0, emoji: '🎮' };
        const isMe = r.name === playerData.name;
        let answerHtml;
        if (!r.answered) {
          answerHtml = '<span class="hist-noanswer">pas de réponse</span>';
        } else if (h.type === 'geomap') {
          answerHtml = `${r.distance != null ? r.distance + ' km' : '—'}`;
        } else {
          answerHtml = r.answer != null ? r.answer : '—';
        }
        const mark   = !r.answered ? '⛔' : (r.correct ? '✅' : '❌');
        const ptsCls = r.points > 0 ? 'pos' : (r.points < 0 ? 'neg' : '');
        const ptsTxt = (r.points > 0 ? '+' : '') + r.points + ' pts';
        return `
          <div class="hist-player-row ${isMe ? 'me' : ''}">
            <span class="av-inline av-xs" style="${getAvatarStyle(av)}">${av.emoji}</span>
            <span class="hist-player-name">${r.name}</span>
            <span class="hist-player-answer">${answerHtml}</span>
            <span class="hist-mark">${mark}</span>
            <span class="hist-pts ${ptsCls}">${ptsTxt}</span>
          </div>`;
      }).join('');
      return `
        <div class="hist-card" style="animation-delay:${Math.min(qi, 12) * 0.04}s">
          <div class="hist-card-head">
            <span class="badge badge-purple">${roundLabel}</span>
            <span class="hist-qnum">Question ${qi + 1}</span>
          </div>
          <div class="hist-question">${h.question}</div>
          <div class="hist-correct">✔ Bonne réponse : <strong>${h.correctAnswer}</strong></div>
          <div class="hist-players">${rows}</div>
        </div>`;
    }).join('');
  }
  showScreen('screen-history');
}

function backToGameOver() {
  showScreen('screen-gameover');
}

// ── Quitter la partie en cours ───────────────────────────────
function leaveGame() {
  if (!confirm('Quitter la partie en cours ? Tu retourneras à l\'accueil.')) return;
  socket.emit('leave_game', { code: roomCode });
  sessionStorage.clear();
  window.location.href = 'index.html';
}

// ── Contrôle hôte : bouton "Suivante" ─────────────────────────
function showHostControl(label) {
  const btn = document.getElementById('host-control');
  const msg = document.getElementById('host-waiting-msg');
  if (isHost) {
    document.getElementById('host-control-label').textContent = label || 'Suivante';
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

socket.on('awaiting_host', ({ label }) => {
  showHostControl(label);
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
      <span class="answer-letter">${LETTERS[i]}</span>${opt}
    </button>`).join('');

  startTimer(timeLimit || 15);
});

socket.on('new_question', (data) => {
  stopTimer();
  stopPixelReveal();
  hideHostControl();

  // Si on vient d'afficher l'intro de manche, on enchaîne directement (déjà 3,5s d'attente)
  const skipCountdown = roundIntroJustShown;
  roundIntroJustShown = false;

  const showQuestion = () => {
    if (data.type === 'pixel')        displayPixelQuestion(data);
    else if (data.type === 'geomap')  displayGeomapQuestion(data);
    else if (data.isPari)             displayPariQuestion(data);
    else                              displayQuestion(data);
  };

  if (skipCountdown) showQuestion();
  else               runCountdown(3, showQuestion);
});

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
socket.on('question_reveal', ({ question, correctIndex, correctAnswer, explanation, results }) => {
  colorAnswerButtons(correctIndex);  // sous-jacent ; l'écran-question est masqué par le switch
  (results || []).forEach(r => {
    setAvatarStatus(r.name, !r.answered ? 'no-answer' : (r.correct ? 'correct' : 'wrong'));
  });
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
  document.getElementById('hud-round').textContent = ROUND_LABELS[roundName] || roundName;
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
    showToast('👑 Tu es maintenant l\'hôte de la partie', 'success');
  }
});

socket.on('join_error', () => {
  showToast('❌ ' + (t('toast.not.found') || 'Partie introuvable'), 'error');
  setTimeout(() => window.location.href = 'index.html', 2000);
});

// L'hôte m'a exclu (peut survenir après la fin de partie si je suis resté sur le récap)
socket.on('kicked', ({ by }) => {
  showToast(`🚫 Tu as été exclu du lobby par ${by || 'l\'hôte'}`, 'error');
  sessionStorage.clear();
  setTimeout(() => { window.location.href = 'index.html'; }, 1800);
});

// ── Init ──────────────────────────────────────────────────────
showScreen('screen-round-intro');
document.getElementById('round-intro-name').textContent = '...';
document.getElementById('round-intro-meta').textContent = 'Préparation';

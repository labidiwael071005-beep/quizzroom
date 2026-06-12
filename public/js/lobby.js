// public/js/lobby.js — Salon d'attente

// ── Sécurité : échappement HTML pour TOUTE donnée user-controlled ────
// À utiliser systématiquement pour les pseudos, messages chat, etc. injectés
// via innerHTML. Pour les attributs (data-name="${...}") c'est aussi requis.
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
let   isHost     = sessionStorage.getItem('qr_host') === 'true';
let   settings   = JSON.parse(sessionStorage.getItem('qr_settings') || '{}');
let   teams      = [];
let   numTeams   = settings.numTeams || 2;
let   teamMode   = settings.teamMode || false;
let   myTeamId   = null;
// Déclaré ici (pas en bas du fichier) pour éviter la temporal-dead-zone :
// initHostPickers() est appelé pendant l'init avant le `let` plus bas dans le fichier.
let   pickerHandlersAttached = false;

if (!roomCode || !playerData.name) window.location.href = 'index.html';

// ── Afficher infos statiques ──────────────────────────────────
document.getElementById('room-code').textContent = roomCode;

const themeLabels = {
  general:'Culture G', science:'Science', geographie:'Géographie',
  histoire:'Histoire', sport:'Sport', cinema:'Cinéma',
  musique:'Musique', tech:'Tech', nature:'Nature', art:'Art',
  litterature:'Littérature', gastronomie:'Gastronomie',
};
// Icône + clé i18n (résolue à l'affichage pour suivre la langue) par manche.
const roundIcons = {
  culture:  { icon:'ti-brain',   key:'game.round.culture', label:'Culture G'   },
  geo:      { icon:'ti-map-pin', key:'game.round.geo',     label:'GéoQuizz'     },
  pixel:    { icon:'ti-photo',   key:'game.round.pixel',   label:'Manche Pixel' },
  pari:     { icon:'ti-coins',   key:'game.round.pari',    label:'Manche Pari'  },
};

// Applique l'état des pickers (boutons actifs, valeurs qcount, mode équipe)
// à partir de `settings`. Appelé à l'init et à chaque settings_updated.
function renderPickersState() {
  const activeRounds = new Set(settings.rounds || ['culture']);
  document.querySelectorAll('#rounds-pick .round-pick').forEach(btn => {
    btn.classList.toggle('active', activeRounds.has(btn.dataset.round));
  });
  const activeThemes = new Set(settings.themes || ['general']);
  document.querySelectorAll('#themes-pick .theme-pick').forEach(btn => {
    btn.classList.toggle('active', activeThemes.has(btn.dataset.theme));
  });
  const currentDiff = settings.difficulty || 'medium';
  document.querySelectorAll('#diff-pick .diff-pick-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === currentDiff);
  });
  (settings.rounds || ['culture']).forEach(r => {
    const el = document.getElementById(`qv-${r}`);
    if (el) el.textContent = settings.questionsPerRound?.[r] || defaultQ[r] || 5;
  });
  const tm = !!settings.teamMode;
  document.querySelectorAll('.team-toggle-btn').forEach((b, i) =>
    b.classList.toggle('active', i === (tm ? 1 : 0))
  );
  const tc = document.getElementById('team-config');
  if (tc) tc.style.display = tm ? 'block' : 'none';
  const nt = document.getElementById('num-teams-val');
  if (nt) nt.textContent = settings.numTeams || 2;
}

// ── QCount par manche ─────────────────────────────────────────
const defaultQ = { culture:10, geo:5, pixel:5, pari:3 };
if (!settings.questionsPerRound) settings.questionsPerRound = {};

// Tous les joueurs voient les mêmes cartes (manches, thèmes, difficulté, qcount,
// équipes). Seul l'hôte attache des handlers de modification ; les invités
// ont la classe `is-guest` qui désactive visuellement les contrôles.
buildQCountControls();
renderPickersState();

if (isHost) {
  document.getElementById('host-actions').style.display  = 'block';
  document.getElementById('guest-waiting').style.display = 'none';
  initHostPickers();
} else {
  document.querySelector('.lobby-main').classList.add('is-guest');
}

// ── Pickers hôte : manches / thèmes / difficulté ──────────────
// L'état actif initial est posé par renderPickersState() ; ici on n'attache
// que les click-handlers, réservés à l'hôte. Le flag `pickerHandlersAttached`
// (déclaré en tête de fichier) le rend idempotent — utile en cas de transfert d'hôte.
function initHostPickers() {
  if (pickerHandlersAttached) return;
  pickerHandlersAttached = true;
  document.querySelectorAll('#rounds-pick .round-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const sel = [...document.querySelectorAll('#rounds-pick .round-pick.active')]
                    .map(b => b.dataset.round);
      if (sel.length === 0) { btn.classList.add('active'); return; } // au moins 1 manche
      settings.rounds = sel;
      buildQCountControls();   // re-render qcount pour les nouvelles manches
      pushSettings();
    });
  });

  document.querySelectorAll('#themes-pick .theme-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const sel = [...document.querySelectorAll('#themes-pick .theme-pick.active')]
                    .map(b => b.dataset.theme);
      if (sel.length === 0) { btn.classList.add('active'); return; } // au moins 1 thème
      settings.themes = sel;
      pushSettings();
    });
  });

  document.querySelectorAll('#diff-pick .diff-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#diff-pick .diff-pick-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.difficulty = btn.dataset.diff;
      pushSettings();
    });
  });
}

function buildQCountControls() {
  const list = document.getElementById('qcount-list');
  list.innerHTML = '';
  (settings.rounds || ['culture']).forEach(r => {
    const val = settings.questionsPerRound[r] || defaultQ[r] || 5;
    settings.questionsPerRound[r] = val;
    const info = roundIcons[r] || { icon:'ti-help', label:r };
    const label = info.key ? t(info.key, info.label) : info.label;
    list.innerHTML += `
      <div class="qcount-item">
        <span class="qcount-label"><i class="ti ${info.icon}"></i>${escapeHtml(label)}</span>
        <div class="qcount-controls">
          <button class="qcount-btn" onclick="changeQ('${r}',-1)">−</button>
          <span class="qcount-val" id="qv-${r}">${val}</span>
          <button class="qcount-btn" onclick="changeQ('${r}',1)">+</button>
        </div>
      </div>`;
  });
}

function changeQ(round, delta) {
  if (!isHost) return;
  const min = 1, max = 20;
  const cur = settings.questionsPerRound[round] || defaultQ[round] || 5;
  const nv  = Math.max(min, Math.min(max, cur + delta));
  settings.questionsPerRound[round] = nv;
  document.getElementById(`qv-${round}`).textContent = nv;
  pushSettings();
}

// ── Mode équipe ───────────────────────────────────────────────
function setTeamMode(on) {
  if (!isHost) return;
  teamMode = on;
  document.querySelectorAll('.team-toggle-btn').forEach((b,i) => b.classList.toggle('active', i === (on ? 1 : 0)));
  document.getElementById('team-config').style.display = on ? 'block' : 'none';
  pushSettings();
}

function changeNumTeams(delta) {
  if (!isHost) return;
  numTeams = Math.max(2, Math.min(4, numTeams + delta));
  document.getElementById('num-teams-val').textContent = numTeams;
  pushSettings();
}

function pushSettings() {
  socket.emit('update_settings', {
    code: roomCode,
    settings: { ...settings, teamMode, numTeams },
  });
}

function renderTeamConfig() {
  // appelé lors de settings_updated aussi
}

function renderTeams(teamsData) {
  teams = teamsData || [];
  const grid = document.getElementById('teams-display');
  if (!grid) return;
  grid.innerHTML = teams.map(team => {
    const members = currentPlayers.filter(p => p.teamId === team.id);
    const joined  = members.some(p => p.name === playerData.name);
    // team.name vient du serveur (whitelist côté serveur), team.color aussi —
    // mais pour défense en profondeur on échappe quand même.
    return `
      <div class="team-card ${joined ? 'joined' : ''}">
        <div class="team-card-name">
          <span class="team-dot" style="background:${team.color}"></span>
          ${escapeHtml(team.name)}
        </div>
        <div class="team-members">${members.map(m => escapeHtml(m.name)).join(', ') || '—'}</div>
        <button class="team-join-btn" data-action="join-team" data-team-id="${team.id}">
          <span data-i18n="lobby.team.join">Rejoindre</span>
        </button>
      </div>`;
  }).join('');

  // Bind les boutons "Rejoindre" via addEventListener (pas d'inline onclick).
  grid.querySelectorAll('[data-action="join-team"]').forEach(btn => {
    const teamId = Number(btn.dataset.teamId);
    btn.addEventListener('click', () => joinTeam(teamId));
  });
}

function joinTeam(teamId) {
  myTeamId = teamId;
  socket.emit('choose_team', { code: roomCode, teamId });
}

// ── Socket ────────────────────────────────────────────────────
// Affichage immédiat de soi-même depuis sessionStorage (avant toute réponse serveur)
let currentPlayers = [{
  id: 'self', name: playerData.name, score: 0, teamId: null,
  avatar: playerData.avatar || { colorIdx: 0, emoji: '🎮' },
}];
let currentHostName = isHost ? playerData.name : '';
updatePlayers(currentPlayers);

const socket = io();

socket.on('connect', () => {
  // fromLobby:true → le serveur marque ce joueur "revenu au salon" (vs. resync depuis game.html)
  socket.emit('lobby_sync', { code: roomCode, playerName: playerData.name, avatar: playerData.avatar, fromLobby: true });
});

socket.on('players_update', ({ players, teams: teamsArr, hostName }) => {
  if (Array.isArray(players)) currentPlayers = players;
  if (hostName) currentHostName = hostName;
  if (teamsArr) teams = teamsArr;
  updatePlayers(currentPlayers);
  if (teamsArr) renderTeams(teamsArr);
});

socket.on('settings_updated', ({ settings: s, teams: teamsArr }) => {
  settings = s;
  teams    = teamsArr || [];
  teamMode = s.teamMode;
  numTeams = s.numTeams || 2;
  // Re-sync l'affichage pour TOUS les joueurs (hôte + invités).
  // Les invités voient ainsi les changements de l'hôte en temps réel.
  buildQCountControls();
  renderPickersState();
  if (teamsArr) renderTeams(teamsArr);
});

// Transfert du rôle d'hôte (volontaire via transferHost, ou auto si l'hôte quitte)
socket.on('host_changed', ({ hostName }) => {
  currentHostName = hostName;
  const amNewHost = hostName === playerData.name;
  if (amNewHost !== isHost) {
    isHost = amNewHost;
    sessionStorage.setItem('qr_host', amNewHost ? 'true' : 'false');
    document.getElementById('host-actions').style.display  = amNewHost ? 'block' : 'none';
    document.getElementById('guest-waiting').style.display = amNewHost ? 'none'  : '';
    document.querySelector('.lobby-main').classList.toggle('is-guest', !amNewHost);
    if (amNewHost) {
      initHostPickers();   // idempotent grâce au flag
      showToast(t('toast.nowhost', '👑 Tu es maintenant l\'hôte de la partie'), 'success');
    } else {
      showToast(t('toast.newhost', 'ℹ️ {name} est maintenant l\'hôte', { name: hostName }), '');
    }
  }
  updatePlayers(currentPlayers);   // re-render pour les boutons « léguer »
});

socket.on('game_started', () => {
  showToast('🚀 ' + t('toast.started'), 'success');
  setTimeout(() => { window.location.href = 'game.html'; }, 600);
});

socket.on('join_error', (msg) => {
  showToast('❌ ' + msg, 'error');
  setTimeout(() => { window.location.href = 'index.html'; }, 2000);
});

// Démarrage refusé par le serveur tant que certains joueurs n'ont pas regagné le lobby
socket.on('start_blocked', ({ stragglers }) => {
  const btn = document.getElementById('btn-start');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<i class="ti ti-player-play"></i> <span data-i18n="lobby.start">${escapeHtml(t('lobby.start', 'Lancer la partie'))}</span>`;
  }
  showToast('⏳ ' + t('lobby.waitingfor', 'En attente de : {names}', { names: (stragglers || []).join(', ') }), 'error');
});

// Un joueur (peut-être l'hôte) vient de quitter : pop-up immédiate pour les autres
socket.on('player_left', ({ name, wasHost, newHostName }) => {
  if (name === playerData.name) return; // ignorer son propre départ
  if (wasHost) {
    showToast(t('lobby.left.host', '🚪 {name} (hôte) a quitté — 👑 {newHost} prend la main',
      { name, newHost: newHostName || '???' }), 'error');
  } else {
    showToast(t('lobby.left', '🚪 {name} a quitté le lobby', { name }), '');
  }
});

// L'hôte m'a exclu du lobby
socket.on('kicked', ({ by }) => {
  showToast(t('toast.kicked', '🚫 Tu as été exclu du lobby par {by}', { by: by || t('lobby.host', "l'hôte") }), 'error');
  sessionStorage.clear();
  setTimeout(() => { window.location.href = 'index.html'; }, 1800);
});

socket.on('chat_message', ({ name, text }) => addChatMsg(name, text));

// Message bloqué côté serveur (profanity, spam, trop long, etc.)
socket.on('chat_blocked', ({ reason }) => {
  showToast('❌ ' + (reason || t('lobby.chat.blocked', 'Message refusé')), 'error');
});

// F4 : rate-limit serveur — affiche un toast de cool-down
socket.on('rate_limited', ({ until }) => {
  const wait = Math.max(1, Math.ceil((Number(until) - Date.now()) / 1000));
  showToast(t('toast.ratelimited', '⏳ Doucement ! Réessaye dans {wait}s.', { wait }), 'error');
});

// ── Rendu joueurs ─────────────────────────────────────────────
function updatePlayers(players) {
  document.getElementById('player-count').textContent = `${players.length}/8`;

  const list = document.getElementById('players-list');
  // ⚠️ TOUTE donnée venant d'un user (pseudo, emoji avatar) doit passer par
  // escapeHtml() avant injection. On utilise data-name="..." + addEventListener
  // plutôt que des onclick inline qui sont des vecteurs XSS classiques.
  list.innerHTML = players.map((p, i) => {
    const isMe    = p.name === playerData.name;
    const isHostP = p.name === currentHostName;
    const av      = p.avatar || { colorIdx: i % 8, emoji: '🎮' };
    const team    = teams.find(t => t.id === p.teamId);
    const teamBadge = team
      ? `<span class="player-team-badge" style="background:${team.color}20;color:${team.color};border:1px solid ${team.color}40">${escapeHtml(team.name)}</span>`
      : '';
    const isWaiting = p.inLobby === false;
    const nameAttr  = escapeHtml(p.name);
    const showKebab = (isHost && !isHostP && !isMe);
    const kebab = showKebab
      ? `<div class="player-menu">
           <button class="player-menu-btn" data-action="menu" data-name="${nameAttr}" title="Actions" aria-label="Actions">⋮</button>
           <div class="player-menu-dropdown" id="menu-${sanitizeNameId(p.name)}">
             <button class="player-menu-item" data-action="promote" data-name="${nameAttr}">${escapeHtml(t('lobby.menu.promote', '👑 Léguer l\'hôte'))}</button>
             <button class="player-menu-item danger" data-action="kick" data-name="${nameAttr}">${escapeHtml(t('lobby.menu.kick', '🚫 Exclure'))}</button>
           </div>
         </div>`
      : '';
    return `
      <div class="player-item ${isWaiting ? 'is-waiting' : ''}">
        <span class="av-inline av-sm" style="${getAvatarStyle(av)}">${escapeHtml(av.emoji)}</span>
        <span class="player-name">
          ${escapeHtml(p.name)}
          ${isMe ? `<span class="player-you">${escapeHtml(t('lobby.you', '(toi)'))}</span>` : ''}
          ${teamBadge}
          ${isWaiting ? `<span class="player-waiting-label">${escapeHtml(t('lobby.player.waiting', '⏳ En attente du joueur'))}</span>` : ''}
        </span>
        ${isHostP ? `<span class="host-badge">${escapeHtml(t('lobby.player.host', '👑 Hôte'))}</span>` : ''}
        ${kebab}
        <div class="player-status"></div>
      </div>`;
  }).join('');

  // Bind les actions (menu / promote / kick) en addEventListener — pas d'onclick inline.
  list.querySelectorAll('[data-action]').forEach(btn => {
    const action = btn.dataset.action;
    const name   = btn.dataset.name;
    btn.addEventListener('click', (e) => {
      if (action === 'menu')         togglePlayerMenu(e, name);
      else if (action === 'promote') transferHost(name);
      else if (action === 'kick')    kickPlayer(name);
    });
  });

  const emptySlots = document.getElementById('empty-slots');
  emptySlots.innerHTML = Array(8 - players.length).fill(0).map(() => `
    <div class="empty-slot">
      <div class="empty-avatar"><i class="ti ti-user"></i></div>
      <span class="empty-name" data-i18n="lobby.waiting">En attente...</span>
    </div>`).join('');

  refreshStartButtonState(players);
}

function sanitizeNameId(name) { return (name || '').replace(/[^a-zA-Z0-9]/g, '_'); }

// Bouton "Lancer la partie" désactivé tant que certains joueurs n'ont pas regagné le lobby
// (post-game : ils sont encore sur le récap / classement).
function refreshStartButtonState(players) {
  const btn  = document.getElementById('btn-start');
  const hint = document.querySelector('#host-actions .start-hint');
  if (!btn) return;
  const waiting = players.filter(p => p.inLobby === false);
  if (waiting.length > 0) {
    btn.disabled = true;
    btn.classList.add('is-blocked');
    if (hint) {
      const names = waiting.map(p => p.name).join(', ');
      hint.textContent = t('lobby.waitingfor', 'En attente de : {names}', { names });
    }
  } else {
    btn.disabled = false;
    btn.classList.remove('is-blocked');
    if (hint) hint.textContent = t('lobby.host.hint', "Tu es l'hôte — les autres attendent.");
  }
}

// ── Menu kebab (3 points) ─────────────────────────────────────
function togglePlayerMenu(evt, name) {
  evt.stopPropagation();
  const id = 'menu-' + sanitizeNameId(name);
  const target = document.getElementById(id);
  document.querySelectorAll('.player-menu-dropdown.open').forEach(el => {
    if (el !== target) el.classList.remove('open');
  });
  if (target) target.classList.toggle('open');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.player-menu')) {
    document.querySelectorAll('.player-menu-dropdown.open').forEach(el => el.classList.remove('open'));
  }
});

function kickPlayer(name) {
  if (!isHost) return;
  document.querySelectorAll('.player-menu-dropdown.open').forEach(el => el.classList.remove('open'));
  if (!confirm(t('lobby.confirm.kick', 'Exclure {name} du lobby ?', { name }))) return;
  socket.emit('kick_player', { code: roomCode, targetName: name });
}

// ── Chat ──────────────────────────────────────────────────────
function sendChat() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;
  socket.emit('chat_message', { code: roomCode, name: playerData.name, text });
  input.value = '';
}

// F1 : XSS stockée — construction DOM stricte, jamais d'innerHTML avec
// du texte utilisateur. textContent neutralise tout balisage / handler injecté.
function addChatMsg(name, text) {
  const msgs = document.getElementById('chat-messages');
  const div  = document.createElement('div');
  div.className = 'chat-msg';

  const author = document.createElement('span');
  author.className   = 'chat-author';
  author.textContent = String(name == null ? '' : name);

  const txt = document.createElement('span');
  txt.className   = 'chat-text';
  txt.textContent = String(text == null ? '' : text);

  div.appendChild(author);
  div.appendChild(txt);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

// ── Actions ───────────────────────────────────────────────────
function startGame() {
  const btn = document.getElementById('btn-start');
  btn.disabled = true;
  btn.innerHTML = `<i class="ti ti-loader"></i> ${t('lobby.start.loading')}`;
  socket.emit('start_game', { code: roomCode });
}

// L'hôte lègue son rôle à un autre joueur
function transferHost(name) {
  if (!isHost) return;
  document.querySelectorAll('.player-menu-dropdown.open').forEach(el => el.classList.remove('open'));
  if (!confirm(t('lobby.confirm.transfer', 'Léguer le rôle d\'hôte à {name} ? Tu redeviendras un joueur classique.', { name }))) return;
  socket.emit('transfer_host', { code: roomCode, targetName: name });
}

function leaveRoom() {
  if (confirm(t('lobby.leave.confirm'))) {
    // Avertir le serveur immédiatement (sinon il faut attendre le timeout de
    // déconnexion ~8s avant que les autres voient le départ + le transfert d'hôte).
    try { socket.emit('leave_game', { code: roomCode }); } catch (e) {}
    sessionStorage.clear();
    window.location.href = 'index.html';
  }
}

function copyCode() {
  navigator.clipboard.writeText(roomCode)
    .then(() => showToast('✅ ' + t('toast.copied') + ' ' + roomCode, 'success'));
}

function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'toast ' + type;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3000);
}

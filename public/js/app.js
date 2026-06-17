// public/js/app.js — Frontend principal QuizzRoom

function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'toast ' + type;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3000);
}

function showModal(name) { document.getElementById('modal-' + name).classList.add('open'); }
function hideModal(name) { document.getElementById('modal-' + name).classList.remove('open'); }
function closeModal(e) {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
}

function selMode(el) {
  document.querySelectorAll('.mode-opt').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
}
function selDiff(el) {
  document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

// (Les sélecteurs de thèmes/manches/difficulté ont été déplacés dans le lobby.
//  L'index ne contient plus que pseudo + avatar pour démarrer rapidement.)

// ── Socket ────────────────────────────────────────────────────
const socket = io();
socket.on('connect', () => console.log('✅ Socket :', socket.id));

// Capture le pseudo et l'avatar au moment de l'action (avant la réponse serveur)
let _pendingCreate = null;
let _pendingJoin   = null;

socket.on('room_created', ({ code, selfName, settings }) => {
  const { name, avatar } = _pendingCreate || {};
  sessionStorage.setItem('qr_room',     code);
  // `selfName` = nom interne assigné par le serveur (peut différer du pseudo saisi
  // en cas de coexistence anonyme/vérifié). C'est l'identité utilisée ensuite.
  sessionStorage.setItem('qr_player',   JSON.stringify({ name: selfName || name || '', avatar: avatar || getAvatar('create-avatar-picker') }));
  sessionStorage.setItem('qr_host',     'true');
  sessionStorage.setItem('qr_settings', JSON.stringify(settings));
  showToast(`🎮 ${t('toast.created')} — ${code}`, 'success');
  setTimeout(() => { window.location.href = 'lobby.html'; }, 600);
});

socket.on('room_joined', ({ code, selfName, settings }) => {
  const { name, avatar } = _pendingJoin || {};
  sessionStorage.setItem('qr_room',     code);
  // `selfName` = nom interne assigné par le serveur (identité de référence).
  sessionStorage.setItem('qr_player',   JSON.stringify({ name: selfName || name || '', avatar: avatar || getAvatar('create-avatar-picker') }));
  sessionStorage.setItem('qr_host',     'false');
  sessionStorage.setItem('qr_settings', JSON.stringify(settings));
  showToast(`✅ ${t('toast.joined')}`, 'success');
  setTimeout(() => { window.location.href = 'lobby.html'; }, 600);
});

socket.on('join_error', (msg) => { showToast('❌ ' + msg, 'error'); });

// ── Créer une partie ──────────────────────────────────────────
function createRoom() {
  const name = document.getElementById('create-name').value.trim();
  if (!name) { showToast('⚠️ ' + t('error.pseudo'), 'error'); return; }

  const avatar = getAvatar('create-avatar-picker');
  _pendingCreate = { name, avatar };

  // Settings par défaut — l'hôte les ajustera dans le lobby
  socket.emit('create_room', {
    playerName: name,
    avatar,
    settings: {
      themes:            ['general'],
      difficulty:        'medium',
      mode:              'public',
      rounds:            ['culture', 'geo', 'pari'],
      questionsPerRound: {},
      teamMode:          false,
      numTeams:          2,
    },
  });
}

// ── Rejoindre une partie ──────────────────────────────────────
// Normalisation live de l'input code : uppercase, ne garde que l'alphabet sûr
// (A-Z, 2-9), limite à 6 chars. Plus de préfixe « QR- » : un code = 6 caractères.
function normalizeCodeInput(raw) {
  return (raw || '')
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, 6);
}

const _codeInputEl = document.getElementById('join-code');
if (_codeInputEl) {
  _codeInputEl.addEventListener('input', () => {
    const cleaned = normalizeCodeInput(_codeInputEl.value);
    if (cleaned !== _codeInputEl.value) _codeInputEl.value = cleaned;
  });
}

function joinRoom() {
  // Accueil refondu : pseudo + avatar partagés avec la création (#create-name /
  // create-avatar-picker). Un fallback sur l'ancien #join-name est gardé au cas
  // où un autre écran réutiliserait ce flux.
  const nameEl = document.getElementById('create-name') || document.getElementById('join-name');
  const name = (nameEl ? nameEl.value : '').trim();
  const raw  = document.getElementById('join-code').value;
  const code = normalizeCodeInput(raw);
  if (!name) { showToast('⚠️ ' + t('error.pseudo'), 'error'); return; }
  if (code.length !== 6) { showToast('⚠️ ' + t('error.code'), 'error'); return; }

  const avatar = getAvatar('create-avatar-picker');
  _pendingJoin = { name, avatar };

  socket.emit('join_room', { code, playerName: name, avatar });
}

function refreshRooms() {
  const list = document.getElementById('rooms-list');
  if (list) list.innerHTML = `<div class="empty-state"><i class="ti ti-mood-empty"></i><span data-i18n="rooms.empty">Aucune partie — sois le premier !</span></div>`;
}

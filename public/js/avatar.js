// public/js/avatar.js — Système d'avatars personnalisables

const AVATAR_COLORS = [
  { idx: 0, bg: 'rgba(108,63,207,0.5)',  border: '#6C3FCF', text: '#C4B5FD' },
  { idx: 1, bg: 'rgba(249,115,22,0.45)', border: '#F97316', text: '#FED7AA' },
  { idx: 2, bg: 'rgba(20,184,166,0.4)',  border: '#14B8A6', text: '#99F6E4' },
  { idx: 3, bg: 'rgba(236,72,153,0.4)',  border: '#EC4899', text: '#F9A8D4' },
  { idx: 4, bg: 'rgba(250,204,21,0.35)', border: '#EAB308', text: '#FEF08A' },
  { idx: 5, bg: 'rgba(59,130,246,0.4)',  border: '#3B82F6', text: '#BAE6FD' },
  { idx: 6, bg: 'rgba(168,85,247,0.4)',  border: '#A855F7', text: '#E9D5FF' },
  { idx: 7, bg: 'rgba(34,197,94,0.35)',  border: '#22C55E', text: '#BBF7D0' },
];

const AVATAR_EMOJIS = [
  '🦊','🐻','🦁','🐯','🐺','🦄','🐸','🐧',
  '🦋','🦕','🤖','👾','🎮','🚀','⚡','🔥',
  '💎','🌟','🎯','🏆','🎪','🎭','🦈','🐉',
];

// Map containerId → { colorIdx, emoji }
const _pickerStates = {};
// Last picker that was interacted with (used by getAvatar())
let _activePicker = null;

function getAvatarStyle(avatar) {
  const c = AVATAR_COLORS[(avatar.colorIdx ?? 0) % AVATAR_COLORS.length];
  return `background:${c.bg};border:2px solid ${c.border};color:${c.text}`;
}

function buildAvatarPicker(containerId, onChangeCb) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // Initialize state for this picker (préserve un état existant si déjà choisi)
  if (!_pickerStates[containerId]) _pickerStates[containerId] = { colorIdx: 0, emoji: '🎮' };
  if (!_activePicker) _activePicker = containerId;

  const previewId = `av-preview-${containerId}`;
  const av = _pickerStates[containerId];
  const editLabel = (typeof t === 'function') ? t('lobby.editAvatar', "Modifier l'avatar") : "Modifier l'avatar";

  // UI COMPACTE : seulement l'avatar courant + un petit bouton « + » qui ouvre
  // la pop-up de personnalisation (couleurs + emojis).
  el.innerHTML = `
    <div class="avatar-compact">
      <div class="avatar-big" id="${previewId}" style="${getAvatarStyle(av)}">${av.emoji}</div>
      <button type="button" class="avatar-edit-btn" aria-label="${editLabel}" title="${editLabel}"
              onclick="openAvatarModal('${containerId}')">+</button>
    </div>
  `;

  el._onChangeCb = onChangeCb;
}

// ── Pop-up de personnalisation de l'avatar ────────────────────
let _avatarModalFor   = null;   // containerId en cours d'édition
let _avatarModalDraft = null;   // copie de travail { colorIdx, emoji }
let _avatarLastFocus  = null;   // élément à re-focus à la fermeture

function ensureAvatarModal() {
  if (document.getElementById('avatar-modal')) return;
  const ov = document.createElement('div');
  ov.className = 'avatar-modal-overlay';
  ov.id = 'avatar-modal';
  ov.hidden = true;
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-labelledby', 'avatar-modal-title');
  ov.innerHTML = `
    <div class="avatar-modal panel" role="document">
      <h3 id="avatar-modal-title" data-i18n="lobby.editAvatar">Modifier l'avatar</h3>
      <div class="avatar-modal-preview"><div class="avatar-big" id="avatar-modal-big"></div></div>
      <div class="avatar-section-label" data-i18n="avatar.color">Couleur</div>
      <div class="avatar-colors" id="avatar-modal-colors"></div>
      <div class="avatar-section-label" data-i18n="avatar.emoji">Emoji</div>
      <div class="avatar-emojis" id="avatar-modal-emojis"></div>
      <div class="avatar-modal-actions">
        <button type="button" class="btn btn--ghost" id="avatar-modal-cancel" data-i18n="avatar.cancel">Annuler</button>
        <button type="button" class="btn btn--primary" id="avatar-modal-ok" data-i18n="avatar.validate">Valider</button>
      </div>
    </div>`;
  document.body.appendChild(ov);

  // Sélection couleur / emoji → met à jour le brouillon + l'aperçu.
  ov.querySelector('#avatar-modal-colors').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]'); if (!b || !_avatarModalDraft) return;
    _avatarModalDraft.colorIdx = parseInt(b.dataset.color, 10);
    renderAvatarModal();
  });
  ov.querySelector('#avatar-modal-emojis').addEventListener('click', (e) => {
    const b = e.target.closest('[data-emoji]'); if (!b || !_avatarModalDraft) return;
    _avatarModalDraft.emoji = b.dataset.emoji;
    renderAvatarModal();
  });
  ov.querySelector('#avatar-modal-ok').addEventListener('click', commitAvatarModal);
  ov.querySelector('#avatar-modal-cancel').addEventListener('click', closeAvatarModal);
  // Clic en dehors de la carte → fermer.
  ov.addEventListener('click', (e) => { if (e.target === ov) closeAvatarModal(); });
  // Échap + piège à focus.
  ov.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeAvatarModal(); return; }
    if (e.key === 'Tab') {
      const f = ov.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

function renderAvatarModal() {
  const d = _avatarModalDraft; if (!d) return;
  const big = document.getElementById('avatar-modal-big');
  big.style.cssText = getAvatarStyle(d);
  big.textContent   = d.emoji;
  document.getElementById('avatar-modal-colors').innerHTML = AVATAR_COLORS.map(c =>
    `<button type="button" class="av-color-btn ${c.idx === d.colorIdx ? 'active' : ''}" data-color="${c.idx}"
             style="background:${c.bg};border-color:${c.border}" aria-label="Couleur ${c.idx + 1}"></button>`
  ).join('');
  document.getElementById('avatar-modal-emojis').innerHTML = AVATAR_EMOJIS.map(e =>
    `<button type="button" class="av-emoji-btn ${e === d.emoji ? 'active' : ''}" data-emoji="${e}">${e}</button>`
  ).join('');
}

function openAvatarModal(containerId) {
  ensureAvatarModal();
  _avatarModalFor   = containerId;
  const cur = _pickerStates[containerId] || { colorIdx: 0, emoji: '🎮' };
  _avatarModalDraft = { colorIdx: cur.colorIdx, emoji: cur.emoji };
  _avatarLastFocus  = document.activeElement;
  renderAvatarModal();
  if (typeof applyTranslations === 'function') applyTranslations();
  const ov = document.getElementById('avatar-modal');
  ov.hidden = false;
  document.body.classList.add('avatar-modal-open');
  // Focus initial dans la pop-up.
  setTimeout(() => { document.getElementById('avatar-modal-ok')?.focus(); }, 0);
}

function commitAvatarModal() {
  if (_avatarModalFor && _avatarModalDraft) {
    setAvatar(_avatarModalDraft, _avatarModalFor);   // applique + déclenche onChangeCb
    _activePicker = _avatarModalFor;
  }
  closeAvatarModal();
}

function closeAvatarModal() {
  const ov = document.getElementById('avatar-modal');
  if (ov) ov.hidden = true;
  document.body.classList.remove('avatar-modal-open');
  _avatarModalFor = null;
  _avatarModalDraft = null;
  if (_avatarLastFocus && _avatarLastFocus.focus) { try { _avatarLastFocus.focus(); } catch (e) {} }
}

function _pickColor(containerId, idx) {
  if (!_pickerStates[containerId]) return;
  _activePicker = containerId;
  _pickerStates[containerId].colorIdx = idx;

  // Only update buttons inside this picker
  const el = document.getElementById(containerId);
  if (!el) return;
  el.querySelectorAll('.av-color-btn').forEach(b => b.classList.remove('active'));
  el.querySelector(`.av-color-btn[data-idx="${idx}"]`)?.classList.add('active');
  _updatePreview(containerId);
}

function _pickEmoji(containerId, emoji) {
  if (!_pickerStates[containerId]) return;
  _activePicker = containerId;
  _pickerStates[containerId].emoji = emoji;

  const el = document.getElementById(containerId);
  if (!el) return;
  el.querySelectorAll('.av-emoji-btn').forEach(b => {
    b.classList.toggle('active', b.textContent === emoji);
  });
  _updatePreview(containerId);
}

function _updatePreview(containerId) {
  const av = _pickerStates[containerId];
  const preview = document.getElementById(`av-preview-${containerId}`);
  if (preview) {
    preview.style.cssText = getAvatarStyle(av);
    preview.textContent   = av.emoji;
  }
  const el = document.getElementById(containerId);
  if (el && el._onChangeCb) el._onChangeCb(av);
}

function getAvatar(pickerId) {
  // If a specific picker is requested, use it; otherwise use the last active one
  const id = pickerId || _activePicker || Object.keys(_pickerStates)[0];
  const av = _pickerStates[id];
  return av ? { ...av } : { colorIdx: 0, emoji: '🎮' };
}

function setAvatar(avatar, containerId) {
  const id = containerId || _activePicker || Object.keys(_pickerStates)[0];
  if (!id || !_pickerStates[id]) return;
  _pickerStates[id].colorIdx = avatar.colorIdx ?? 0;
  _pickerStates[id].emoji    = avatar.emoji    ?? '🎮';
  _updatePreview(id);
}

function avatarHtml(avatar, name, size = 'sm') {
  const a = avatar || { colorIdx: 0, emoji: '🎮' };
  return `<span class="av-inline av-${size}" style="${getAvatarStyle(a)}">${a.emoji}</span>`;
}

window._pickColor      = _pickColor;
window._pickEmoji      = _pickEmoji;
window.buildAvatarPicker = buildAvatarPicker;
window.openAvatarModal = openAvatarModal;
window.getAvatar      = getAvatar;
window.setAvatar      = setAvatar;
window.avatarHtml     = avatarHtml;
window.getAvatarStyle = getAvatarStyle;

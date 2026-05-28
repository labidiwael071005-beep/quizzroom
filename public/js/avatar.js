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

  // Initialize state for this picker
  _pickerStates[containerId] = { colorIdx: 0, emoji: '🎮' };
  if (!_activePicker) _activePicker = containerId;

  const previewId = `av-preview-${containerId}`;
  const av = _pickerStates[containerId];

  el.innerHTML = `
    <div class="avatar-preview-wrap">
      <div class="avatar-big" id="${previewId}" style="${getAvatarStyle(av)}">${av.emoji}</div>
    </div>
    <div class="avatar-section-label">Couleur</div>
    <div class="avatar-colors" data-picker="${containerId}">
      ${AVATAR_COLORS.map(c => `
        <button class="av-color-btn ${c.idx === av.colorIdx ? 'active' : ''}"
                data-idx="${c.idx}"
                style="background:${c.bg};border-color:${c.border}"
                onclick="_pickColor('${containerId}',${c.idx})"></button>
      `).join('')}
    </div>
    <div class="avatar-section-label">Emoji</div>
    <div class="avatar-emojis" data-picker="${containerId}">
      ${AVATAR_EMOJIS.map(e => `
        <button class="av-emoji-btn ${e === av.emoji ? 'active' : ''}"
                onclick="_pickEmoji('${containerId}','${e}')">${e}</button>
      `).join('')}
    </div>
  `;

  el._onChangeCb = onChangeCb;
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
window.getAvatar      = getAvatar;
window.setAvatar      = setAvatar;
window.avatarHtml     = avatarHtml;
window.getAvatarStyle = getAvatarStyle;

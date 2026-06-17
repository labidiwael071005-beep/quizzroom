// public/js/report-player.js — Modale « Signaler ce joueur » (lobby + partie).
// Émet via le socket global de la page (lobby.js / game.js). Anti-spam local :
// 5 min de cooldown par cible.
(function () {
  const COOLDOWN_MS = 5 * 60 * 1000;
  const cooldowns = new Map();   // targetName -> expiry (ms)
  let curTarget = null, curRoom = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function tr(k, fb) { return (typeof t === 'function') ? t(k, fb) : fb; }

  window.isPlayerReportCooldown = function (name) {
    const e = cooldowns.get(name);
    return !!(e && e > Date.now());
  };

  function ensureModal() {
    if (document.getElementById('preport-modal')) return;
    const ov = document.createElement('div');
    ov.className = 'preport-overlay';
    ov.id = 'preport-modal';
    ov.hidden = true;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'preport-title');
    ov.innerHTML = `
      <div class="preport-card panel" role="document">
        <h3 id="preport-title" data-i18n="report.player.title">Signaler ce joueur</h3>
        <div class="preport-target" id="preport-target"></div>
        <div class="preport-cats" role="radiogroup" aria-labelledby="preport-title">
          <label class="preport-cat"><input type="radio" name="preport-cat" value="pseudo"><span data-i18n="report.player.cat.pseudo">Pseudo</span></label>
          <label class="preport-cat"><input type="radio" name="preport-cat" value="chat"><span data-i18n="report.player.cat.chat">Chat</span></label>
          <label class="preport-cat"><input type="radio" name="preport-cat" value="behavior"><span data-i18n="report.player.cat.behavior">Comportement</span></label>
          <label class="preport-cat"><input type="radio" name="preport-cat" value="other"><span data-i18n="report.player.cat.other">Autre</span></label>
        </div>
        <textarea id="preport-comment" maxlength="500" data-i18n-placeholder="report.player.commentPlaceholder" placeholder="Détaille le problème (optionnel)…"></textarea>
        <div class="preport-actions">
          <button type="button" class="btn btn--ghost" id="preport-cancel" data-i18n="avatar.cancel">Annuler</button>
          <button type="button" class="btn btn--primary" id="preport-send" data-i18n="report.player.send">Envoyer</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ov.hidden) close(); });
    ov.querySelector('#preport-cancel').addEventListener('click', close);
    ov.querySelector('#preport-send').addEventListener('click', send);
    if (typeof applyTranslations === 'function') applyTranslations();
  }

  function open(targetName, roomCode) {
    if (!targetName) return;
    if (window.isPlayerReportCooldown(targetName)) return;   // anti-spam local
    ensureModal();
    curTarget = targetName; curRoom = roomCode;
    const ov = document.getElementById('preport-modal');
    ov.querySelector('#preport-target').textContent = '@' + targetName;
    ov.querySelectorAll('input[name="preport-cat"]').forEach((r, i) => { r.checked = (i === 3); }); // défaut « Autre »
    ov.querySelector('#preport-comment').value = '';
    ov.hidden = false;
    document.body.classList.add('preport-open');
    if (typeof applyTranslations === 'function') applyTranslations();
  }
  function close() {
    const ov = document.getElementById('preport-modal');
    if (ov) ov.hidden = true;
    document.body.classList.remove('preport-open');
  }
  function send() {
    const ov = document.getElementById('preport-modal');
    const checked = ov.querySelector('input[name="preport-cat"]:checked');
    const cat = checked ? checked.value : 'other';
    const comment = ov.querySelector('#preport-comment').value;
    if (typeof socket !== 'undefined' && socket) {
      socket.emit('report_player', { code: curRoom, targetName: curTarget, category: cat, comment });
    }
    cooldowns.set(curTarget, Date.now() + COOLDOWN_MS);   // 5 min côté UI
    close();
    if (typeof showToast === 'function') showToast(tr('report.player.sent', 'Signalement envoyé, merci'), 'success');
  }

  window.openPlayerReport = open;
})();

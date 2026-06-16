// public/js/pseudo.js — Choix / édition du pseudo unique (comptes connectés).
// Exposé via window.PseudoUI. Utilisé sur l'accueil (gate obligatoire) et /profil.
(function () {
  const SAFE = /^[a-zA-Z0-9._-]+$/;
  function tr(k, fb) { return (typeof t === 'function') ? t(k, fb) : fb; }

  // Miroir client de la validation serveur (feedback immédiat).
  function localCheck(v) {
    const p = String(v || '').trim();
    if (p.length < 3 || p.length > 16) return 'pseudo.err.length';
    if (!SAFE.test(p)) return 'pseudo.err.charset';
    return null;
  }

  function setFeedback(el, msg, ok) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.remove('ok', 'err');
    if (ok === true) el.classList.add('ok');
    else if (ok === false) el.classList.add('err');
  }

  let _debTimer = null;
  // Vérifie la dispo (debounced 300ms) → met à jour feedback + bouton + callback.
  function liveCheck(value, feedbackEl, okBtn, onState) {
    const local = localCheck(value);
    if (local) {
      setFeedback(feedbackEl, tr(local, ''), false);
      if (okBtn) okBtn.disabled = true;
      if (onState) onState(false);
      return;
    }
    setFeedback(feedbackEl, tr('pseudo.checking', '…'), null);
    if (okBtn) okBtn.disabled = true;
    clearTimeout(_debTimer);
    _debTimer = setTimeout(async () => {
      try {
        const r = await fetch('/api/me/pseudo/available?p=' + encodeURIComponent(value.trim()), { headers: { Accept: 'application/json' } });
        const d = await r.json();
        if (d.available) {
          setFeedback(feedbackEl, tr('pseudo.available', '✓'), true);
          if (okBtn) okBtn.disabled = false;
          if (onState) onState(true);
        } else {
          setFeedback(feedbackEl, tr(d.reason || 'pseudo.err.taken', ''), false);
          if (okBtn) okBtn.disabled = true;
          if (onState) onState(false);
        }
      } catch (e) {
        setFeedback(feedbackEl, tr('pseudo.err.server', ''), false);
        if (okBtn) okBtn.disabled = true;
        if (onState) onState(false);
      }
    }, 300);
  }

  async function submitPseudo(value) {
    try {
      const r = await fetch('/api/me/pseudo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudo: String(value || '').trim() }),
      });
      const d = await r.json().catch(() => ({ ok: false, reason: 'pseudo.err.server' }));
      return { ok: r.ok && d.ok, reason: d.reason, user: d.user };
    } catch (e) {
      return { ok: false, reason: 'pseudo.err.server' };
    }
  }

  // ── Gate obligatoire (1ère définition) — non dismissable ──
  let _gateOnSaved = null;
  function ensureGate() {
    if (document.getElementById('pseudo-gate')) return;
    const ov = document.createElement('div');
    ov.className = 'pseudo-gate-overlay';
    ov.id = 'pseudo-gate';
    ov.hidden = true;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'pseudo-gate-title');
    ov.innerHTML = `
      <div class="pseudo-gate panel" role="document">
        <h2 id="pseudo-gate-title" data-i18n="pseudo.choose.title">Choisis ton pseudo</h2>
        <p class="pseudo-gate-sub" data-i18n="pseudo.choose.sub">Les autres joueurs te verront sous ce nom. Il est unique.</p>
        <input type="text" id="pseudo-gate-input" class="home-input" maxlength="16"
               data-i18n-placeholder="pseudo.placeholder" placeholder="Ton pseudo" autocomplete="off" spellcheck="false">
        <div class="pseudo-feedback" id="pseudo-gate-feedback" aria-live="polite"></div>
        <button type="button" class="btn btn--primary btn--block" id="pseudo-gate-ok" data-i18n="pseudo.validate" disabled>Valider</button>
      </div>`;
    document.body.appendChild(ov);
    const input = ov.querySelector('#pseudo-gate-input');
    const fb = ov.querySelector('#pseudo-gate-feedback');
    const ok = ov.querySelector('#pseudo-gate-ok');
    input.addEventListener('input', () => liveCheck(input.value, fb, ok));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !ok.disabled) ok.click(); });
    ok.addEventListener('click', async () => {
      ok.disabled = true;
      const res = await submitPseudo(input.value);
      if (res.ok) { closeGate(); if (_gateOnSaved) _gateOnSaved(res.user); }
      else { setFeedback(fb, tr(res.reason || 'pseudo.err.server', ''), false); ok.disabled = false; }
    });
    if (typeof applyTranslations === 'function') applyTranslations();
  }

  function openGate(onSaved) {
    ensureGate();
    _gateOnSaved = onSaved;
    const ov = document.getElementById('pseudo-gate');
    ov.hidden = false;
    document.body.classList.add('pseudo-gate-open');
    setTimeout(() => document.getElementById('pseudo-gate-input')?.focus(), 0);
  }
  function closeGate() {
    const ov = document.getElementById('pseudo-gate');
    if (ov) ov.hidden = true;
    document.body.classList.remove('pseudo-gate-open');
  }

  window.PseudoUI = { openGate, closeGate, liveCheck, submitPseudo, localCheck };
})();

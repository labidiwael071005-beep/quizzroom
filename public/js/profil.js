// public/js/profil.js — Page profil (joueur connecté)

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _tr(key, fb, vars) { return (typeof t === 'function') ? t(key, fb, vars) : fb; }

const LANG_LABELS = { fr: 'Français', en: 'English', es: 'Español' };

async function initProfile() {
  const loggedOut = document.getElementById('profil-loggedout');
  const content   = document.getElementById('profil-content');

  // Bouton de connexion (état déconnecté) + déconnexion (état connecté).
  const btnG = document.getElementById('btn-google');
  if (btnG) btnG.addEventListener('click', () => { window.location.href = '/auth/google?returnTo=/profil'; });
  const btnOut = document.getElementById('btn-logout');
  if (btnOut) btnOut.addEventListener('click', async () => {
    try { await fetch('/auth/logout', { method: 'POST' }); } catch (e) {}
    window.location.href = '/';
  });

  let data = null;
  try {
    const r = await fetch('/api/me/profile', { headers: { Accept: 'application/json' } });
    if (r.status === 401) { loggedOut.hidden = false; content.hidden = true; return; }
    data = await r.json();
  } catch (e) {
    loggedOut.hidden = false; content.hidden = true; return;
  }
  if (!data || !data.ok) { loggedOut.hidden = false; content.hidden = true; return; }

  // Connecté : on RETIRE complètement le bandeau « Connecte-toi » (il n'a aucun
  // sens ici) plutôt que de le masquer — pas de doublon possible.
  if (loggedOut && loggedOut.parentNode) loggedOut.parentNode.removeChild(loggedOut);
  content.hidden = false;

  const u = data.user, s = data.stats;

  // Pas encore de pseudo (compte existant ou 1ère connexion) → gate obligatoire.
  if (!u.pseudo && window.PseudoUI) {
    window.PseudoUI.openGate(() => window.location.reload());
  }

  // Identité : pseudo en grand, nom Google en sous-texte discret.
  document.getElementById('p-name').textContent = u.pseudo || u.displayName || '';
  const gEl = document.getElementById('p-google');
  if (gEl) gEl.textContent = _tr('profile.googleAccount', 'Compte Google') + ' : ' + (u.displayName || '—');
  const av = document.getElementById('p-avatar');
  const bulb = document.getElementById('p-bulb');
  if (u.avatarUrl) { av.src = u.avatarUrl; av.alt = u.pseudo || u.displayName || ''; av.hidden = false; }
  // Ampoule « compte vérifié » sur l'avatar (le profil = compte connecté).
  if (bulb) { bulb.title = _tr('lobby.verifiedAccount', 'Compte vérifié'); bulb.hidden = false; }

  // Section « Modifier mon pseudo ».
  const pInput = document.getElementById('edit-pseudo-input');
  const pSave  = document.getElementById('edit-pseudo-save');
  const pFb    = document.getElementById('edit-pseudo-feedback');
  if (pInput && pSave && window.PseudoUI) {
    if (u.pseudo) pInput.value = u.pseudo;
    pInput.addEventListener('input', () => window.PseudoUI.liveCheck(pInput.value, pFb, pSave));
    pSave.addEventListener('click', async () => {
      pSave.disabled = true;
      const res = await window.PseudoUI.submitPseudo(pInput.value);
      if (res.ok) {
        document.getElementById('p-name').textContent = res.user.pseudo;
        pFb.textContent = _tr('pseudo.saved', 'Pseudo enregistré ✓');
        pFb.classList.remove('err'); pFb.classList.add('ok');
      } else {
        pFb.textContent = _tr(res.reason || 'pseudo.err.server', '');
        pFb.classList.remove('ok'); pFb.classList.add('err');
        pSave.disabled = false;
      }
    });
  }

  const lang = (document.documentElement.lang || 'fr');
  const since = document.getElementById('p-since');
  if (u.createdAt) {
    const dstr = new Date(u.createdAt).toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' });
    since.textContent = _tr('profile.memberSince', 'Membre depuis {date}', { date: dstr });
  }
  const langEl = document.getElementById('p-lang');
  if (u.preferredLocale && LANG_LABELS[u.preferredLocale]) {
    langEl.textContent = _tr('profile.lang', 'Langue préférée') + ' : ' + LANG_LABELS[u.preferredLocale];
  } else {
    langEl.hidden = true;
  }

  // KPI
  document.getElementById('k-played').textContent  = s.gamesPlayed;
  document.getElementById('k-won').textContent     = s.gamesWon;
  document.getElementById('k-winrate').textContent = s.winRate + '%';
  document.getElementById('k-score').textContent   = s.totalScore;

  // Dernières parties
  const tbody = document.getElementById('p-recent');
  const empty = document.getElementById('p-recent-empty');
  const rows  = data.recent || [];
  empty.hidden = rows.length > 0;
  tbody.innerHTML = rows.map(g => {
    const d = g.createdAt ? new Date(g.createdAt).toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
    const res = g.won
      ? '<span class="res-win">✓</span>'
      : '<span class="res-loss">✗</span>';
    return `<tr>
      <td>${_esc(d)}</td>
      <td>${_esc(g.roomCode || '—')}</td>
      <td>${g.score || 0}</td>
      <td>${res}</td>
    </tr>`;
  }).join('');
}

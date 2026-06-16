// public/js/leaderboard.js — Classement (accueil)
// Top 10 des victoires, filtrable Semaine/Mois et Vérifiés/Tous.
(function () {
  let scope  = 'verified';
  let period = 'week';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function medal(rank) {
    return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '#' + rank;
  }
  // Bouclier doré (cohérent avec le badge « compte vérifié »).
  const SHIELD = '<svg class="shield-ico" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">'
    + '<path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 8.6 8 11 4.6-2.4 8-6 8-11V5l-8-3Z"/>'
    + '<path fill="#1b3f9e" d="m10.7 14.4-2.4-2.4 1.1-1.1 1.3 1.3 3.2-3.2 1.1 1.1-4.3 4.3Z"/></svg>';

  function tr(key, fb) { return (typeof t === 'function') ? t(key, fb) : fb; }

  async function load() {
    const list  = document.getElementById('lb-list');
    const empty = document.getElementById('lb-empty');
    if (!list) return;
    try {
      const r = await fetch(`/api/leaderboard?scope=${scope}&period=${period}`, { headers: { Accept: 'application/json' } });
      const d = await r.json();
      const rows = (d && d.leaderboard) || [];
      empty.hidden = rows.length > 0;
      list.innerHTML = rows.map(e => {
        const av = e.avatarUrl
          ? `<img class="lb-avatar" src="${esc(e.avatarUrl)}" alt="${esc(e.pseudo)}" referrerpolicy="no-referrer">`
          : `<span class="lb-avatar lb-avatar-ph">${esc((e.pseudo || '?').slice(0, 1).toUpperCase())}</span>`;
        const badge = e.verified
          ? `<span class="lb-verified" title="${esc(tr('lobby.verifiedAccount', 'Compte vérifié'))}">${SHIELD}</span>`
          : '';
        return `<li class="lb-row">
          <span class="lb-rank lb-rank-${e.rank}">${medal(e.rank)}</span>
          ${av}
          <span class="lb-name">${esc(e.pseudo)}${badge}</span>
          <span class="lb-wins">${e.wins}&nbsp;<span data-i18n="lb.wins">${esc(tr('lb.wins', 'victoires'))}</span></span>
        </li>`;
      }).join('');
      if (typeof applyTranslations === 'function') applyTranslations();
    } catch (err) {
      if (empty) empty.hidden = false;
    }
  }

  function wireTabs(attr, setter) {
    document.querySelectorAll(`#leaderboard-card .lb-tab[data-${attr}]`).forEach(b => {
      b.addEventListener('click', () => {
        setter(b.dataset[attr]);
        document.querySelectorAll(`#leaderboard-card .lb-tab[data-${attr}]`)
          .forEach(x => x.classList.toggle('active', x === b));
        load();
      });
    });
  }

  window.initLeaderboard = function () {
    wireTabs('scope',  v => { scope  = v; });
    wireTabs('period', v => { period = v; });
    load();
  };
})();

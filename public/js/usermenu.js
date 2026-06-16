// public/js/usermenu.js — Menu utilisateur (cercle photo + dropdown) en haut à
// droite, à gauche du sélecteur de langue. Utilisé sur l'accueil et le lobby.
(function () {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function avatarHtml(user, name) {
    return user.avatarUrl
      ? `<img class="um-avatar" src="${esc(user.avatarUrl)}" alt="${esc(name)}" referrerpolicy="no-referrer">`
      : `<span class="um-avatar um-avatar-ph">${esc((name || '?').slice(0, 1).toUpperCase())}</span>`;
  }

  function render(container, user) {
    const name = user.pseudo || user.displayName || '';
    container.innerHTML = `
      <button type="button" class="um-trigger" id="um-trigger" aria-haspopup="true" aria-expanded="false" aria-label="${esc(name)}">
        ${avatarHtml(user, name)}
      </button>
      <div class="um-popover panel" id="um-popover" hidden role="menu">
        <div class="um-head">
          ${avatarHtml(user, name)}
          <div class="um-head-info">
            <span class="um-name">${esc(name)}</span>
            <span class="um-sub" data-i18n="profile.googleAccount">Compte Google</span>
          </div>
        </div>
        <a class="um-item" href="/profil" role="menuitem" data-i18n="auth.myProfile">Mon profil</a>
        <button type="button" class="um-item um-logout" id="um-logout" role="menuitem" data-i18n="auth.signOut">Se déconnecter</button>
      </div>`;

    const trigger = container.querySelector('#um-trigger');
    const pop     = container.querySelector('#um-popover');
    const close = () => { pop.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
    const open  = () => { pop.hidden = false; trigger.setAttribute('aria-expanded', 'true'); };

    trigger.addEventListener('click', (e) => { e.stopPropagation(); pop.hidden ? open() : close(); });
    container.querySelector('#um-logout').addEventListener('click', async () => {
      close();
      try { await fetch('/auth/logout', { method: 'POST' }); } catch (e) { /* on recharge quand même */ }
      window.location.reload();
    });
    // Fermeture : clic en dehors, Échap, clic sur le lien profil.
    document.addEventListener('click', (e) => { if (!container.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    pop.querySelector('a.um-item')?.addEventListener('click', close);

    if (typeof applyTranslations === 'function') applyTranslations();
  }

  // initUserMenu(containerId, user?) — si user non fourni, fetch /api/me.
  window.initUserMenu = async function (containerId, user) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let u = user;
    if (!u) {
      try {
        const d = await (await fetch('/api/me', { headers: { Accept: 'application/json' } })).json();
        if (d && d.authenticated) u = d.user;
      } catch (e) { /* no-op */ }
    }
    if (!u) { container.innerHTML = ''; container.hidden = true; return; }
    container.hidden = false;
    render(container, u);
  };
})();

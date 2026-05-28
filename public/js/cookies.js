// public/js/cookies.js — Bandeau consentement RGPD

function initCookieBanner() {
  if (localStorage.getItem('qr_cookies_consent')) return;

  const banner = document.createElement('div');
  banner.id        = 'cookie-banner';
  banner.className = 'cookie-banner';
  banner.innerHTML = `
    <div class="cookie-text">
      <span data-i18n="cookie.text">Nous utilisons des cookies essentiels au fonctionnement du site.</span>
      <a href="/legal/cookies.html" class="cookie-link" data-i18n="cookie.more">En savoir plus</a>
    </div>
    <div class="cookie-actions">
      <button class="btn btn-ghost btn-sm" onclick="cookieRefuse()" data-i18n="cookie.refuse">Refuser</button>
      <button class="btn btn-orange btn-sm" onclick="cookieAccept()" data-i18n="cookie.accept">Accepter</button>
    </div>
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner.classList.add('show'), 300);
}

function cookieAccept() {
  localStorage.setItem('qr_cookies_consent', 'accepted');
  hideCookieBanner();
}

function cookieRefuse() {
  localStorage.setItem('qr_cookies_consent', 'refused');
  hideCookieBanner();
}

function hideCookieBanner() {
  const b = document.getElementById('cookie-banner');
  if (b) { b.classList.remove('show'); setTimeout(() => b.remove(), 400); }
}

window.cookieAccept = cookieAccept;
window.cookieRefuse = cookieRefuse;

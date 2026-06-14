// public/js/theme.js — Décor « plateau TV » (purement visuel, additif).
// N'altère AUCUNE logique de jeu : injecte des calques décoratifs en
// arrière-plan (pointer-events:none) + l'ouverture de rideaux au chargement.
(function () {
  'use strict';
  if (window.__theatreThemeInit) return;
  window.__theatreThemeInit = true;

  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Détection de page (sans dépendre d'attributs : on lit le DOM existant).
  function isGame() { return !!(document.getElementById('stage') || document.querySelector('.hud')); }
  function isHome() { return !!document.querySelector('.hero'); }

  // ── Décor partagé : fond + spotlights + marquee ──────────────
  function injectDecor() {
    if (document.querySelector('.theatre-decor')) return;
    var decor = document.createElement('div');
    decor.className = 'theatre-decor' + (isGame() ? ' theatre-decor--dim' : '');
    decor.setAttribute('aria-hidden', 'true');
    decor.innerHTML =
      '<div class="theatre-spot theatre-spot--1"></div>' +
      '<div class="theatre-spot theatre-spot--2"></div>' +
      '<div class="theatre-marquee"></div>';
    // Premier enfant du body → toujours derrière le contenu (z-index:-1).
    document.body.insertBefore(decor, document.body.firstChild);
  }

  // ── Rideaux de velours (ouverture au chargement) ─────────────
  // Surtout sur l'accueil ; une fois par session ; jamais bloquant.
  function injectCurtains() {
    if (!isHome()) return;                 // lobby/game : entrée rapide, pas de rideaux
    if (reduce) return;                    // accessibilité : contenu visible direct
    try { if (sessionStorage.getItem('qr_curtains_shown')) return; } catch (e) {}
    try { sessionStorage.setItem('qr_curtains_shown', '1'); } catch (e) {}

    var wrap = document.createElement('div');
    wrap.className = 'theatre-curtains';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<div class="theatre-curtain theatre-curtain--left"></div>' +
      '<div class="theatre-curtain theatre-curtain--right"></div>';
    document.body.appendChild(wrap);

    // Deux frames pour garantir la pose fermée, puis ouverture animée.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { wrap.classList.add('is-open'); });
    });

    // Retrait complet après l'animation : ne doit PLUS jamais exister.
    var done = false;
    function remove() {
      if (done) return; done = true;
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }
    wrap.addEventListener('transitionend', remove);
    setTimeout(remove, 1800);   // filet de sécurité si transitionend manque
  }

  function init() {
    if (!document.body) return;
    injectDecor();
    injectCurtains();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

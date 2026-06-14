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

  function init() {
    if (!document.body) return;
    injectDecor();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

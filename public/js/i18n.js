// public/js/i18n.js — Système de traduction FR/EN/ES

const SUPPORTED = ['fr', 'en', 'es'];
let translations = {};
let currentLang  = 'fr';

function detectLang() {
  const stored = localStorage.getItem('qr_lang');
  if (stored && SUPPORTED.includes(stored)) return stored;
  const nav = (navigator.language || navigator.userLanguage || 'fr').slice(0, 2).toLowerCase();
  return SUPPORTED.includes(nav) ? nav : 'fr';
}

async function loadLocale(lang) {
  const resp = await fetch(`/locales/${lang}.json`);
  if (!resp.ok) throw new Error(`Locale ${lang} not found`);
  return resp.json();
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (translations[key]) el.textContent = translations[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (translations[key]) el.placeholder = translations[key];
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (translations[key]) el.title = translations[key];
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const key = el.dataset.i18nAriaLabel;
    if (translations[key]) el.setAttribute('aria-label', translations[key]);
  });
}

// t(key, fallback, vars?) — récupère la traduction (ou le fallback), puis
// remplace les variables {x} si un objet `vars` est fourni. Rétrocompatible :
// les appels sans `vars` se comportent comme avant.
function t(key, fallback = '', vars = null) {
  let s = translations[key] || fallback || key;
  if (vars) {
    for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  }
  return s;
}

async function initI18n() {
  currentLang  = detectLang();
  translations = await loadLocale(currentLang).catch(() => ({}));
  document.documentElement.lang = currentLang;
  applyTranslations();
  renderLangSwitcher();
}

async function setLang(lang) {
  if (!SUPPORTED.includes(lang)) return;
  localStorage.setItem('qr_lang', lang);
  currentLang  = lang;
  translations = await loadLocale(lang).catch(() => ({}));
  document.documentElement.lang = lang;
  applyTranslations();
  renderLangSwitcher();
}

function renderLangSwitcher() {
  const el = document.getElementById('lang-switcher');
  if (!el) return;
  const flags = { fr: '🇫🇷', en: '🇬🇧', es: '🇪🇸' };
  el.innerHTML = SUPPORTED.map(l => `
    <button class="lang-btn ${l === currentLang ? 'active' : ''}" onclick="setLang('${l}')">
      ${flags[l]} ${l.toUpperCase()}
    </button>
  `).join('');
}

function getLang() { return currentLang; }

// ── Multilingue questions : résolution d'une traduction de question ──
// Renvoie l'objet {text, options, explanation, label, country} dans la
// langue préférée, avec fallback preferred → fr → en → première dispo.
function pickQuestionTranslation(translations, preferred) {
  if (!translations || typeof translations !== 'object') return null;
  const tryLangs = [preferred || currentLang, 'fr', 'en', ...Object.keys(translations)];
  for (const l of tryLangs) {
    if (l && translations[l]) return translations[l];
  }
  return null;
}

// Exposer globalement
window.t       = t;
window.setLang = setLang;
window.getLang = getLang;
window.initI18n = initI18n;
window.pickQuestionTranslation = pickQuestionTranslation;

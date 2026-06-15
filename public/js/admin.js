// public/js/admin.js — Logique du back-office SquizzGame
// Conventions :
// - Pas de framework. Pas de bundler. CSP autorise les <script> du domaine.
// - Toute donnée injectée dans le DOM passe par escapeHtml() ou textContent.
// - Le token JWT-like est stocké dans localStorage ; il expire serveur (24h)
//   et un 401 reset l'UI vers le login.

const TOKEN_KEY = 'sg_admin_token';

// ── Utilitaires ──────────────────────────────────────────────
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'toast ' + type;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3000);
}

function getToken()   { return localStorage.getItem(TOKEN_KEY) || ''; }
function setToken(t)  { if (t) localStorage.setItem(TOKEN_KEY, t); else clearToken(); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

// Wrapper fetch authentifié — déclenche un logout silencieux sur 401.
async function api(path, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
    ...(getToken() ? { 'Authorization': 'Bearer ' + getToken() } : {}),
  };
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401 && getToken()) {
    setToken('');
    showLogin();
    showToast('Session expirée — reconnecte-toi.', 'error');
    throw new Error('unauthorized');
  }
  let json = null;
  try { json = await res.json(); } catch (_) {}
  if (!res.ok || !json || json.ok === false) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json;
}

// ── Sections : login ↔ dashboard ─────────────────────────────
const loginSection = document.getElementById('login-section');
const dashSection  = document.getElementById('dashboard');

function showLogin() {
  // Garantit un état "déconnecté" propre : modal fermé + dashboard caché.
  // Sans ce reset, un dashboard ouvert puis logout laisserait le modal
  // ouvert au prochain affichage du login.
  stopOverviewAutoRefresh();
  document.getElementById('modal').hidden = true;
  loginSection.hidden = false;
  dashSection.hidden  = true;
  document.getElementById('login-pwd').value = '';
  document.getElementById('login-error').textContent = '';
}
function showDashboard() {
  loginSection.hidden = true;
  dashSection.hidden  = false;
  switchTab('dashboard');     // onglet par défaut à la connexion
  loadStats();
  loadOverview();
  startOverviewAutoRefresh();
  loadQuestions();
  loadReports();
}

// ── Auth ─────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwd = document.getElementById('login-pwd').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const r = await fetch('/api/admin/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password: pwd }),
    });
    const json = await r.json();
    if (!r.ok || !json.token) {
      errEl.textContent = json.error || 'Échec';
      return;
    }
    setToken(json.token);
    showDashboard();
    showToast('Connexion réussie', 'success');
  } catch (err) {
    errEl.textContent = 'Erreur réseau';
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  try { await api('/api/admin/logout', { method: 'POST' }); } catch (_) {}
  setToken('');
  showLogin();
});

// ── Stats ────────────────────────────────────────────────────
async function loadStats() {
  try {
    const { cache, activeRooms, openReports } = await api('/api/admin/stats');
    document.getElementById('stat-total').textContent = cache.total;
    document.getElementById('stat-qcm').textContent   = cache.qcm;
    document.getElementById('stat-geo').textContent   = cache.geo;
    document.getElementById('stat-pixel').textContent = cache.pixel;
    document.getElementById('stat-rooms').textContent = activeRooms;
    document.getElementById('stat-reports').textContent = openReports ?? 0;
    updateReportsTabBadge(openReports ?? 0);
  } catch (err) { /* déjà géré par api() */ }
}

// ── Tableau de bord (vue d'ensemble) ─────────────────────────
let _overviewTimer = null;

function barsHtml(rows, key) {
  if (!rows || !rows.length) return '<div class="admin-empty" style="padding:10px">Aucune donnée.</div>';
  const max = Math.max(1, ...rows.map(r => r.count));
  const accent = key === 'difficulty' ? ' accent' : '';
  return rows.map(r => {
    const label = key === '__lang' ? r.lang : (r[key] ?? '—');
    const pct = Math.round((r.count / max) * 100);
    return `<div class="bar-row">
      <span class="bar-label">${escapeHtml(String(label))}</span>
      <span class="bar-track"><span class="bar-fill${accent}" style="width:${pct}%"></span></span>
      <span class="bar-val">${r.count}</span>
    </div>`;
  }).join('');
}

async function loadOverview() {
  try {
    const { totals, breakdown, recent } = await api('/api/admin/stats/overview');
    document.getElementById('kpi-questions').textContent     = totals.questions;
    document.getElementById('kpi-questions-sub').textContent = `${totals.questionsApproved} approuvées`;
    document.getElementById('kpi-sessions').textContent      = totals.gameSessions;
    document.getElementById('kpi-reports-open').textContent  = totals.reportsOpen;
    document.getElementById('kpi-reports-total').textContent = totals.reportsTotal;

    document.getElementById('bars-type').innerHTML       = barsHtml(breakdown.byType, 'type');
    document.getElementById('bars-difficulty').innerHTML = barsHtml(breakdown.byDifficulty, 'difficulty');
    const langRows = ['fr', 'en', 'es'].map(l => ({ lang: l, count: (totals.translationsByLang || {})[l] || 0 }));
    document.getElementById('bars-lang').innerHTML       = barsHtml(langRows, '__lang');
    document.getElementById('bars-theme').innerHTML      = barsHtml(breakdown.byTheme, 'theme');

    const sessions = recent.gameSessions || [];
    document.getElementById('recent-sessions').innerHTML = sessions.length
      ? sessions.map(s => `<div class="recent-item">
          <span class="ri-main">🎮 ${escapeHtml(s.roomCode)} · ${s.playerCount} j.</span>
          <span class="ri-meta">${escapeHtml(fmtDate(s.startedAt))}${s.endedAt ? '' : ' · en cours'}</span>
        </div>`).join('')
      : '<div class="admin-empty" style="padding:14px">Aucune partie.</div>';

    const reps = recent.reports || [];
    document.getElementById('recent-reports').innerHTML = reps.length
      ? reps.map(r => `<div class="recent-item">
          <span class="ri-main">${escapeHtml(r.questionExcerpt || '—')}</span>
          <span class="ri-meta">${escapeHtml(CAT_LABEL[r.category] || r.category)}${r.status === 'open' ? ' · ouvert' : ''}</span>
        </div>`).join('')
      : '<div class="admin-empty" style="padding:14px">Aucun signalement.</div>';
  } catch (err) { /* géré par api() */ }
}

// Auto-refresh toutes les 30 s tant que l'onglet dashboard est actif.
function startOverviewAutoRefresh() {
  stopOverviewAutoRefresh();
  _overviewTimer = setInterval(() => {
    const panel = document.getElementById('tab-panel-dashboard');
    if (panel && !panel.hidden && getToken()) loadOverview();
  }, 30000);
}
function stopOverviewAutoRefresh() {
  if (_overviewTimer) { clearInterval(_overviewTimer); _overviewTimer = null; }
}
document.getElementById('btn-refresh-overview').addEventListener('click', loadOverview);

// ── Liste ────────────────────────────────────────────────────
let allQuestions = [];

async function loadQuestions() {
  const type       = document.getElementById('filter-type').value;
  const theme      = document.getElementById('filter-theme').value;
  const difficulty = document.getElementById('filter-difficulty').value;
  const params = new URLSearchParams();
  if (type)       params.set('type', type);
  if (theme)      params.set('theme', theme);
  if (difficulty) params.set('difficulty', difficulty);
  try {
    const { questions } = await api('/api/admin/questions?' + params.toString());
    allQuestions = questions;
    renderQuestions();
  } catch (err) { /* déjà géré */ }
}

function renderQuestions() {
  const search = document.getElementById('filter-search').value.toLowerCase().trim();
  const filtered = search
    ? allQuestions.filter(q => (q.question || '').toLowerCase().includes(search))
    : allQuestions;

  const list = document.getElementById('questions-list');
  document.getElementById('list-count').textContent = `(${filtered.length})`;
  document.getElementById('list-empty').hidden = filtered.length > 0;

  list.innerHTML = filtered.map(q => {
    const typeIcon = q.type === 'pixel' ? 'photo'
                   : q.type === 'geo'   ? 'map-pin'
                   :                       'brain';
    const ratio = q.timesShown > 0
      ? Math.round((q.timesCorrect / q.timesShown) * 100) + '%'
      : '—';
    return `
      <div class="admin-row" data-id="${escapeHtml(q.id)}">
        <div class="row-type"><i class="ti ti-${typeIcon}"></i></div>
        <div class="row-main">
          <div class="row-question">${escapeHtml(q.question || '')}</div>
          <div class="row-meta">
            <span class="badge">${escapeHtml(q.theme || '—')}</span>
            <span class="badge">${escapeHtml(q.difficulty || '—')}</span>
            <span class="badge">${escapeHtml(q.type || '—')}</span>
            <span class="row-stats">vue ${q.timesShown}× — réussite ${ratio}</span>
          </div>
        </div>
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-action="edit"   data-id="${escapeHtml(q.id)}">
            <i class="ti ti-pencil"></i>
          </button>
          <button class="btn btn-ghost btn-sm danger" data-action="delete" data-id="${escapeHtml(q.id)}">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-action]').forEach(btn => {
    const action = btn.dataset.action;
    const id     = btn.dataset.id;
    btn.addEventListener('click', () => {
      if (action === 'edit')   openModal(allQuestions.find(x => x.id === id));
      if (action === 'delete') deleteQuestion(id);
    });
  });
}

['filter-type', 'filter-theme', 'filter-difficulty'].forEach(id =>
  document.getElementById(id).addEventListener('change', loadQuestions)
);
document.getElementById('filter-search').addEventListener('input', renderQuestions);

// ── Modal create / edit ─────────────────────────────────────
const modal = document.getElementById('modal');

function openModal(question = null) {
  document.getElementById('modal-title').textContent = question ? 'Éditer la question' : 'Nouvelle question';
  document.getElementById('f-id').value = question?.id || '';

  const type = question?.type || 'qcm';
  document.getElementById('f-type').value       = type;
  document.getElementById('f-question').value   = question?.question   || '';
  document.getElementById('f-theme').value      = question?.theme      || 'general';
  document.getElementById('f-difficulty').value = question?.difficulty || 'medium';
  document.getElementById('f-explanation').value = question?.explanation || '';

  // QCM / pixel : pré-remplir options
  const opts = question?.options || [];
  for (let i = 0; i < 4; i++) {
    document.getElementById(`f-opt-${i}`).value = opts[i] || '';
  }
  document.querySelectorAll('input[name="f-correct"]').forEach(r => {
    r.checked = Number(r.value) === question?.correctIndex;
  });

  // Pixel
  document.getElementById('f-imageUrl').value  = question?.imageUrl  || '';
  document.getElementById('f-credit').value    = question?.credit    || '';
  document.getElementById('f-creditUrl').value = question?.creditUrl || '';
  document.getElementById('f-license').value   = question?.license   || '';

  // Géo
  document.getElementById('f-lat').value     = question?.lat     ?? '';
  document.getElementById('f-lng').value     = question?.lng     ?? '';
  document.getElementById('f-label').value   = question?.label   || '';
  document.getElementById('f-country').value = question?.country || '';

  syncFormByType();
  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
  document.getElementById('question-form').reset();
}

// Affiche / masque les fieldsets selon le type sélectionné.
function syncFormByType() {
  const type = document.getElementById('f-type').value;
  document.getElementById('f-options-group').hidden = type === 'geo';
  document.getElementById('f-pixel-group').hidden   = type !== 'pixel';
  document.getElementById('f-geo-group').hidden     = type !== 'geo';
  // En géo, la theme est forcée à 'geo'.
  if (type === 'geo') document.getElementById('f-theme').value = 'geo';
}
document.getElementById('f-type').addEventListener('change', syncFormByType);

document.getElementById('btn-add').addEventListener('click', () => openModal(null));
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

document.getElementById('question-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id   = document.getElementById('f-id').value;
  const type = document.getElementById('f-type').value;

  const data = {
    type,
    question:    document.getElementById('f-question').value.trim(),
    theme:       document.getElementById('f-theme').value,
    difficulty:  document.getElementById('f-difficulty').value,
    explanation: document.getElementById('f-explanation').value.trim(),
    language:    'fr',
  };

  if (type === 'qcm' || type === 'pixel') {
    const opts = [0, 1, 2, 3].map(i => document.getElementById(`f-opt-${i}`).value.trim());
    if (opts.some(o => !o)) {
      showToast('Renseigne les 4 options.', 'error');
      return;
    }
    const correctEl = document.querySelector('input[name="f-correct"]:checked');
    if (!correctEl) {
      showToast('Coche la bonne réponse.', 'error');
      return;
    }
    data.options      = opts;
    data.correctIndex = Number(correctEl.value);
  }

  if (type === 'pixel') {
    data.imageUrl  = document.getElementById('f-imageUrl').value.trim();
    data.credit    = document.getElementById('f-credit').value.trim();
    data.creditUrl = document.getElementById('f-creditUrl').value.trim();
    data.license   = document.getElementById('f-license').value.trim();
    data.label     = document.getElementById('f-label').value.trim() || null;
  }

  if (type === 'geo') {
    const lat = parseFloat(document.getElementById('f-lat').value);
    const lng = parseFloat(document.getElementById('f-lng').value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      showToast('Coordonnées invalides.', 'error');
      return;
    }
    data.lat     = lat;
    data.lng     = lng;
    data.label   = document.getElementById('f-label').value.trim();
    data.country = document.getElementById('f-country').value.trim();
  }

  try {
    if (id) {
      await api('/api/admin/questions/' + id, { method: 'PUT', body: JSON.stringify(data) });
      showToast('Question mise à jour', 'success');
    } else {
      await api('/api/admin/questions',       { method: 'POST', body: JSON.stringify(data) });
      showToast('Question créée', 'success');
    }
    closeModal();
    loadStats();
    loadQuestions();
  } catch (err) {
    showToast('Erreur : ' + err.message, 'error');
  }
});

async function deleteQuestion(id) {
  if (!confirm('Supprimer définitivement cette question ?')) return;
  try {
    await api('/api/admin/questions/' + id, { method: 'DELETE' });
    showToast('Question supprimée', 'success');
    loadStats();
    loadQuestions();
  } catch (err) {
    showToast('Erreur : ' + err.message, 'error');
  }
}

// ── Signalements ─────────────────────────────────────────────
const CAT_LABEL = {
  translation:  'Traduction',
  wrong_answer: 'Mauvaise réponse',
  typo:         'Faute de frappe',
  other:        'Autre',
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

async function loadReports() {
  try {
    const { reports, openCount } = await api('/api/admin/reports');
    renderReports(reports || [], openCount || 0);
  } catch (err) { /* déjà géré */ }
}

function updateReportsTabBadge(openCount) {
  const badge = document.getElementById('tab-reports-badge');
  if (!badge) return;
  if (openCount > 0) {
    badge.textContent = String(openCount);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

function renderReports(reports, openCount) {
  const list      = document.getElementById('reports-list');
  const empty     = document.getElementById('reports-empty');
  const countEl   = document.getElementById('reports-count');
  const openBadge = document.getElementById('reports-open-badge');
  countEl.textContent = `(${reports.length})`;
  if (openCount > 0) {
    openBadge.textContent = `${openCount} à traiter`;
    openBadge.hidden = false;
  } else {
    openBadge.hidden = true;
  }
  updateReportsTabBadge(openCount);
  if (!reports.length) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  list.innerHTML = reports.map(r => {
    const resolved  = r.status === 'resolved';
    const catLabel  = CAT_LABEL[r.category] || r.category;
    const catCls    = `cat-${escapeHtml(r.category || 'other')}`;
    const langBadge = r.language ? `<span class="badge">🌍 ${escapeHtml(r.language)}</span>` : '';
    const roomBadge = r.roomCode ? `<span class="badge">🎮 ${escapeHtml(r.roomCode)}</span>` : '';
    const typeBadge = r.questionType ? `<span class="badge">${escapeHtml(r.questionType)}</span>` : '';
    const comment   = r.comment
      ? `<div class="rp-comment">"${escapeHtml(r.comment)}"</div>`
      : '';
    return `
      <div class="report-row ${resolved ? 'resolved' : ''}" data-id="${escapeHtml(r.id)}">
        <div class="rp-icon"><i class="ti ti-${resolved ? 'check' : 'flag'}"></i></div>
        <div class="rp-main">
          <div class="rp-q">${escapeHtml(r.questionPreview || '(question supprimée)')}</div>
          <div class="rp-meta">
            <span class="badge ${catCls}">${escapeHtml(catLabel)}</span>
            ${typeBadge}
            ${langBadge}
            ${roomBadge}
            <span class="badge">${escapeHtml(resolved ? 'résolu' : 'ouvert')}</span>
          </div>
          ${comment}
        </div>
        <div class="rp-date">${escapeHtml(fmtDate(r.createdAt))}</div>
        <div class="rp-actions">
          ${resolved ? '' : `<button class="btn btn-ghost btn-sm" data-action="resolve" data-id="${escapeHtml(r.id)}" title="Marquer résolu">
            <i class="ti ti-check"></i>
          </button>`}
          <button class="btn btn-ghost btn-sm danger" data-action="delete-report" data-id="${escapeHtml(r.id)}" title="Supprimer">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-action]').forEach(btn => {
    const action = btn.dataset.action;
    const id     = btn.dataset.id;
    btn.addEventListener('click', () => {
      if (action === 'resolve')       resolveReport(id);
      if (action === 'delete-report') deleteReport(id);
    });
  });
}

async function resolveReport(id) {
  try {
    await api('/api/admin/reports/' + id, {
      method: 'PATCH',
      body:   JSON.stringify({ status: 'resolved' }),
    });
    showToast('Signalement résolu', 'success');
    loadStats();
    loadReports();
  } catch (err) {
    showToast('Erreur : ' + err.message, 'error');
  }
}

async function deleteReport(id) {
  if (!confirm('Supprimer ce signalement ?')) return;
  try {
    await api('/api/admin/reports/' + id, { method: 'DELETE' });
    showToast('Signalement supprimé', 'success');
    loadStats();
    loadReports();
  } catch (err) {
    showToast('Erreur : ' + err.message, 'error');
  }
}

document.getElementById('btn-reload-reports').addEventListener('click', () => {
  loadReports();
  loadStats();
});

// ── Onglets (Questions ↔ Signalements) ──────────────────────
function switchTab(name) {
  const tabs   = document.querySelectorAll('.admin-tab');
  const panels = document.querySelectorAll('.admin-tab-panel');
  tabs.forEach(t => {
    const active = t.dataset.tab === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  panels.forEach(p => {
    const active = p.id === `tab-panel-${name}`;
    p.hidden = !active;
  });
  if (name === 'dashboard') loadOverview();   // données fraîches à l'entrée
}
document.querySelectorAll('.admin-tab').forEach(t => {
  t.addEventListener('click', () => switchTab(t.dataset.tab));
});

// ── Boot ─────────────────────────────────────────────────────
// On part TOUJOURS de l'état "login + modal fermé" pour éviter qu'un
// dashboard / modal flashe à l'écran le temps que la vérif réseau revienne.
// Le token local est seulement un indice ; on le revalide auprès du serveur
// avant d'afficher le moindre élément protégé.
async function boot() {
  document.getElementById('modal').hidden = true;
  showLogin();

  const token = getToken();
  if (!token) return;

  try {
    const r = await fetch('/api/admin/stats', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (r.ok) {
      showDashboard();
    } else {
      clearToken();
      showLogin();
    }
  } catch (_) {
    // Réseau KO → on reste sur login, l'user retentera
    showLogin();
  }
}
boot();

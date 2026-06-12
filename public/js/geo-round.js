// public/js/geo-round.js — Logique de la manche Geo interactive (carte + clic)

let geoMap          = null;   // instance Leaflet
let geoUserMarker   = null;   // marker du joueur (sa guess)
let geoCorrectMarker= null;   // marker du bon point (au reveal)
let geoOtherMarkers = [];     // markers des autres joueurs
let geoLines        = [];     // lignes guess→correct
let geoGuess        = null;   // { lat, lng } du joueur
let geoLocked       = false;  // true après validation

function initGeoMap(divId) {
  // Détruire l'ancienne carte si elle existe
  if (geoMap) {
    geoMap.remove();
    geoMap = null;
  }
  geoUserMarker    = null;
  geoCorrectMarker = null;
  geoOtherMarkers  = [];
  geoLines         = [];
  geoGuess         = null;
  geoLocked        = false;

  geoMap = L.map(divId, {
    center:           [20, 0],
    zoom:             2,
    minZoom:          2,
    maxZoom:          8,
    worldCopyJump:    true,
    zoomControl:      true,
    scrollWheelZoom:  true,
    doubleClickZoom:  false, // double-click ne zoome pas (réservé au futur)
    attributionControl: false,
  });

  // Tuiles OpenStreetMap (gratuit, pas de clé)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 8,
    minZoom: 2,
  }).addTo(geoMap);

  geoMap.on('click', (e) => {
    if (geoLocked) return;
    placeUserMarker(e.latlng.lat, e.latlng.lng);
    document.getElementById('geo-validate-btn').disabled = false;
  });
}

function placeUserMarker(lat, lng) {
  geoGuess = { lat, lng };
  if (geoUserMarker) {
    geoUserMarker.setLatLng([lat, lng]);
  } else {
    geoUserMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'geo-marker geo-marker-self',
        html: '<div class="geo-pin geo-pin-self">📍</div>',
        iconSize:   [32, 40],
        iconAnchor: [16, 38],
      }),
    }).addTo(geoMap);
  }
}

function lockGeoAnswer() {
  geoLocked = true;
  document.getElementById('geo-validate-btn').disabled = true;
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  document.getElementById('geo-validate-btn').innerHTML = `<i class="ti ti-loader"></i><span>${esc(t('game.geo.sent', 'Envoyé !'))}</span>`;
  document.getElementById('geomap-hint').innerHTML = `<i class="ti ti-clock"></i><span>${esc(t('game.geo.sentwait', 'Réponse envoyée — en attente des autres'))}</span>`;
}

// Reveal final : montre le bon point + tous les markers + lignes + distances
function showGeoReveal({ correctLat, correctLng, correctLabel, country, guesses, explanation }) {
  if (!geoMap) return;

  // Marker du bon point
  if (geoCorrectMarker) geoMap.removeLayer(geoCorrectMarker);
  geoCorrectMarker = L.marker([correctLat, correctLng], {
    icon: L.divIcon({
      className: 'geo-marker geo-marker-correct',
      html: `<div class="geo-pin geo-pin-correct">🎯</div>`,
      iconSize:   [38, 46],
      iconAnchor: [19, 44],
    }),
    zIndexOffset: 1000,
  }).addTo(geoMap);
  geoCorrectMarker.bindTooltip(correctLabel, { permanent: true, direction: 'top', offset: [0, -40] }).openTooltip();

  // Markers des autres joueurs + lignes
  geoOtherMarkers.forEach(m => geoMap.removeLayer(m));
  geoLines.forEach(l => geoMap.removeLayer(l));
  geoOtherMarkers = [];
  geoLines = [];

  (guesses || []).forEach((g, i) => {
    if (!Number.isFinite(g.lat) || !Number.isFinite(g.lng)) return;
    const isMe = g.name === playerData.name;
    const av   = g.avatar || { colorIdx: i % 8, emoji: '🎮' };

    // Si c'est moi, j'ai déjà mon marker
    if (!isMe) {
      const m = L.marker([g.lat, g.lng], {
        icon: L.divIcon({
          className: 'geo-marker geo-marker-other',
          html: `<div class="geo-pin geo-pin-other">${av.emoji}</div>`,
          iconSize: [32, 40], iconAnchor: [16, 38],
        }),
      }).addTo(geoMap);
      m.bindTooltip(g.name, { direction: 'top', offset: [0, -36] });
      geoOtherMarkers.push(m);
    }

    // Ligne entre la guess et le bon point
    const line = L.polyline([[g.lat, g.lng], [correctLat, correctLng]], {
      color: isMe ? '#F97316' : '#8B5CF6',
      weight: isMe ? 3 : 2,
      opacity: 0.7,
      dashArray: '6, 6',
    }).addTo(geoMap);
    geoLines.push(line);
  });

  // Centrer la vue pour voir tout (bon point + toutes les guesses)
  const points = [[correctLat, correctLng]];
  (guesses || []).forEach(g => {
    if (Number.isFinite(g.lat) && Number.isFinite(g.lng)) points.push([g.lat, g.lng]);
  });
  if (points.length > 1) {
    const bounds = L.latLngBounds(points);
    geoMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 });
  }

  // Affiche le panneau de résultats DANS la sidebar (km + points par joueur)
  const panel  = document.getElementById('geomap-results-panel');
  const title  = document.getElementById('geomap-results-title');
  const list   = document.getElementById('geomap-results-list');
  const hint   = document.getElementById('geomap-hint');
  if (panel && title && list) {
    title.textContent = `📍 ${correctLabel}${country ? ` — ${country}` : ''}`;
    const factEl = document.getElementById('geomap-results-fact');
    if (factEl) {
      factEl.textContent = (explanation || '').trim()
        ? `💡 ${explanation}`
        : '';
      factEl.style.display = (explanation || '').trim() ? 'block' : 'none';
    }
    const sorted = [...(guesses || [])].sort((a, b) => (b.points || 0) - (a.points || 0));
    // Sécurité : g.name est user-controlled → échappement HTML obligatoire.
    const esc = s => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    list.innerHTML = sorted.map(g => {
      const isMe = g.name === playerData.name;
      const hasGuess = Number.isFinite(g.lat) && Number.isFinite(g.lng);
      const distLabel = hasGuess
        ? `${Math.round(g.distance)} km`
        : t('game.geo.noanswer', 'Pas de réponse');
      return `<div class="geomap-result-row ${isMe ? 'me' : ''}">
        <span class="geomap-result-name">${esc(g.name)}${isMe ? ' ' + esc(t('lobby.you', '(toi)')) : ''}</span>
        <span class="geomap-result-pts">+${g.points || 0} pts</span>
        <span class="geomap-result-dist ${hasGuess ? '' : 'no-answer'}">${distLabel}</span>
      </div>`;
    }).join('');
    panel.style.display = 'block';
    if (hint) hint.style.display = 'none';   // cache le hint pendant le reveal
  }
}

window.initGeoMap          = initGeoMap;
window.placeUserMarker     = placeUserMarker;
window.lockGeoAnswer       = lockGeoAnswer;
window.showGeoReveal       = showGeoReveal;
window.getGeoGuess         = () => geoGuess;
window.invalidateGeoMapSize = () => geoMap?.invalidateSize();

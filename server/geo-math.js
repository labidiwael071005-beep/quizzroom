// server/geo-math.js — Fonctions de calcul géographique pures (sans données).
// Séparées de la couche données pour rester disponibles après la migration DB.

// Distance Haversine en km entre 2 points lat/lng
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Barème de points en fonction de la distance (plus proche → plus de points)
function geoScore(distKm) {
  if (distKm <   50) return 1000;
  if (distKm <  200) return  750;
  if (distKm <  500) return  500;
  if (distKm < 1500) return  300;
  if (distKm < 5000) return  100;
  return 0;
}

module.exports = { distanceKm, geoScore };

// scripts/lib/qhash.js
// Hash STABLE et déterministe servant de sourceRef (dédoublonnage + reprise).
//
// La source de vérité est TOUJOURS la version FR de la question :
//   - QCM : texte + options (dans l'ordre partagé par correctIndex)
//   - Géo : texte de la question (les coordonnées sont neutres, le texte suffit)
//
// Le même algo est utilisé pour STAMPER les fichiers de lots (stamp-lots.js)
// et pour DÉDOUBLONNER à l'insertion (seed-generated.js) : ainsi un sourceRef
// déjà en base est reconnu quel que soit le chemin. NE PAS modifier l'algo une
// fois des questions en base, sous peine de recréer des doublons.

const crypto = require('crypto');

// Séparateur improbable dans du texte naturel (caractère de contrôle SOH).
const SEP = '';

function sha16(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex').slice(0, 16);
}

// sourceRef d'une question QCM à partir de sa traduction FR.
function qcmRef(fr) {
  const opts = fr && Array.isArray(fr.options) ? fr.options.join(SEP) : '';
  const text = (fr && fr.text) || '';
  return sha16(`qcm${SEP}${text}${SEP}${opts}`);
}

// sourceRef d'une question Géo à partir de sa traduction FR.
function geoRef(fr) {
  const text = (fr && fr.text) || '';
  return sha16(`geo${SEP}${text}`);
}

// Calcule le sourceRef selon le type ('qcm' | 'geo').
function refFor(type, fr) {
  return type === 'geo' ? geoRef(fr) : qcmRef(fr);
}

module.exports = { sha16, qcmRef, geoRef, refFor, SEP };

// server/geo-questions.js — Lieux à placer sur la carte (manche Geo interactive)

const GEO_LOCATIONS = [
  { id: 'paris',       label: 'Paris (Tour Eiffel)',         lat: 48.8584, lng:   2.2945, country: 'France',          fact: "Paris est traversée par la Seine et surnommée la « Ville Lumière »." },
  { id: 'london',      label: 'Londres (Big Ben)',           lat: 51.5007, lng:  -0.1246, country: 'Royaume-Uni',     fact: "Londres fut la première ville au monde à dépasser le million d'habitants, vers 1810." },
  { id: 'rome',        label: 'Rome (Colisée)',              lat: 41.8902, lng:  12.4922, country: 'Italie',          fact: "Rome, la « Ville éternelle », abrite en son sein un État indépendant : le Vatican." },
  { id: 'berlin',      label: 'Berlin (Porte de Brandebourg)',lat: 52.5163, lng: 13.3777, country: 'Allemagne',       fact: "Berlin a été coupée en deux par un mur de 1961 à 1989." },
  { id: 'madrid',      label: 'Madrid',                       lat: 40.4168, lng:  -3.7038, country: 'Espagne',         fact: "Madrid est la capitale d'Europe la plus haute en altitude, à environ 650 m." },
  { id: 'athens',      label: 'Athènes (Acropole)',          lat: 37.9715, lng:  23.7257, country: 'Grèce',           fact: "Athènes est considérée comme le berceau de la démocratie." },
  { id: 'moscow',      label: 'Moscou (Place Rouge)',        lat: 55.7539, lng:  37.6208, country: 'Russie',          fact: "Moscou est la ville la plus peuplée d'Europe." },
  { id: 'istanbul',    label: 'Istanbul (Sainte-Sophie)',    lat: 41.0086, lng:  28.9802, country: 'Turquie',         fact: "Istanbul est la seule grande ville au monde à cheval sur deux continents." },

  { id: 'newyork',     label: 'New York (Statue de la Liberté)', lat: 40.6892, lng: -74.0445, country: 'États-Unis',  fact: "New York est surnommée « la ville qui ne dort jamais »." },
  { id: 'losangeles',  label: 'Los Angeles (Hollywood Sign)', lat: 34.1341, lng: -118.3215, country: 'États-Unis',    fact: "Los Angeles abrite Hollywood, capitale mondiale du cinéma." },
  { id: 'mexico',      label: 'Mexico (Zócalo)',             lat: 19.4326, lng: -99.1332, country: 'Mexique',         fact: "Mexico est bâtie sur le site de l'ancienne cité aztèque de Tenochtitlán." },
  { id: 'rio',         label: 'Rio (Christ Rédempteur)',     lat: -22.9519, lng:-43.2105, country: 'Brésil',          fact: "Le Christ Rédempteur veille sur la baie de Rio depuis 1931, du haut de ses 30 mètres." },
  { id: 'buenosaires', label: 'Buenos Aires',                lat: -34.6037, lng:-58.3816, country: 'Argentine',       fact: "Buenos Aires est le berceau du tango." },
  { id: 'toronto',     label: 'Toronto (Tour CN)',           lat: 43.6426, lng: -79.3871, country: 'Canada',          fact: "La Tour CN de Toronto a longtemps été la plus haute structure autoportante du monde." },

  { id: 'tokyo',       label: 'Tokyo',                        lat: 35.6762, lng: 139.6503, country: 'Japon',           fact: "Tokyo forme l'aire urbaine la plus peuplée de la planète." },
  { id: 'beijing',     label: 'Pékin (Cité Interdite)',     lat: 39.9163, lng: 116.3972, country: 'Chine',           fact: "La Cité Interdite de Pékin compte près de 1 000 bâtiments." },
  { id: 'sydney',      label: "Sydney (Opéra)",              lat: -33.8568,lng: 151.2153, country: 'Australie',       fact: "Sydney est la plus grande et la plus ancienne ville d'Australie." },
  { id: 'mumbai',      label: 'Mumbai (Gateway of India)',   lat: 18.9220, lng:  72.8347, country: 'Inde',            fact: "Mumbai est la capitale économique de l'Inde et le cœur de Bollywood." },
  { id: 'bangkok',     label: 'Bangkok (Grand Palais)',      lat: 13.7500, lng: 100.4915, country: 'Thaïlande',       fact: "Le nom cérémoniel complet de Bangkok est le plus long nom de ville au monde." },
  { id: 'dubai',       label: 'Dubaï (Burj Khalifa)',        lat: 25.1972, lng:  55.2744, country: 'Émirats arabes unis', fact: "Le Burj Khalifa de Dubaï culmine à 828 m : c'est le plus haut gratte-ciel du monde." },
  { id: 'singapore',   label: 'Singapour (Marina Bay)',      lat:  1.2839, lng: 103.8607, country: 'Singapour',       fact: "Singapour est à la fois une ville, une île et un État souverain." },

  { id: 'cairo',       label: 'Le Caire (Pyramides de Gizeh)',lat: 29.9792, lng: 31.1342, country: 'Égypte',          fact: "Les pyramides de Gizeh sont la seule des sept merveilles du monde antique encore debout." },
  { id: 'capetown',    label: 'Le Cap (Table Mountain)',     lat: -33.9628,lng:  18.4098, country: 'Afrique du Sud',  fact: "Le Cap est dominée par la Montagne de la Table, au sommet étonnamment plat." },
  { id: 'marrakech',   label: 'Marrakech (Jemaa el-Fna)',    lat: 31.6258, lng:  -7.9891, country: 'Maroc',           fact: "Marrakech est surnommée la « ville rouge » pour ses murs en terre ocre." },
  { id: 'lagos',       label: 'Lagos',                        lat:  6.5244, lng:   3.3792, country: 'Nigeria',         fact: "Lagos est l'une des plus grandes villes d'Afrique." },
  { id: 'nairobi',     label: 'Nairobi',                      lat: -1.2864, lng:  36.8172, country: 'Kenya',           fact: "Nairobi possède un parc national peuplé de lions à deux pas du centre-ville." },
];

function getGeoQuestions({ count = 5 }) {
  const shuffled = [...GEO_LOCATIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map(loc => ({
    type:        'geomap',
    question:    `Où se trouve ${loc.label} ?`,
    label:       loc.label,
    lat:         loc.lat,
    lng:         loc.lng,
    country:     loc.country,
    explanation: loc.fact || '',
  }));
}

// Distance Haversine en km entre 2 points lat/lng
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Score basé sur la distance (plus proche = plus de points)
function geoScore(distKm) {
  if (distKm <  50)  return 1000;
  if (distKm < 200)  return  750;
  if (distKm < 500)  return  500;
  if (distKm < 1500) return  300;
  if (distKm < 5000) return  100;
  return 0;
}

module.exports = { getGeoQuestions, distanceKm, geoScore, GEO_LOCATIONS };

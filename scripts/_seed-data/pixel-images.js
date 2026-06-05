// server/pixel-images.js — Images pour la manche Pixel
// Toutes les images sont issues de Wikimedia Commons (domaine public ou CC BY-SA)
// Attribution complète dans public/legal/attributions.html

const PIXEL_IMAGES = [
  {
    id: 'eiffel',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Tour_Eiffel_Wikimedia_Commons_(cropped).jpg/500px-Tour_Eiffel_Wikimedia_Commons_(cropped).jpg',
    label: 'La Tour Eiffel',
    fact: "Construite pour l'Exposition universelle de 1889, la Tour Eiffel devait être démontée au bout de 20 ans.",
    options: ['Tour Eiffel', 'Tour de Pise', 'Big Ben', 'Tour CN'],
    correctIndex: 0, theme: 'geographie', difficulty: 'easy',
    credit: 'Benh LIEU SONG', license: 'CC BY-SA 3.0',
    creditUrl: 'https://commons.wikimedia.org/wiki/File:Tour_Eiffel_Wikimedia_Commons_(cropped).jpg',
  },
  {
    id: 'colosseum',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Colosseo_2020.jpg/500px-Colosseo_2020.jpg',
    label: 'Le Colisée',
    fact: "Le Colisée de Rome pouvait accueillir jusqu'à 50 000 spectateurs pour les combats de gladiateurs.",
    options: ['Colisée', 'Panthéon', 'Forum romain', 'Amphithéâtre de Nîmes'],
    correctIndex: 0, theme: 'geographie', difficulty: 'easy',
    credit: 'Wikimedia Commons', license: 'CC BY-SA 4.0',
    creditUrl: 'https://commons.wikimedia.org/wiki/File:Colosseo_2020.jpg',
  },
  {
    id: 'big-ben',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Clock_Tower_-_Palace_of_Westminster%2C_London_-_September_2006.jpg/500px-Clock_Tower_-_Palace_of_Westminster%2C_London_-_September_2006.jpg',
    label: 'Big Ben',
    fact: "« Big Ben » désigne en réalité la cloche ; la tour s'appelle officiellement Elizabeth Tower depuis 2012.",
    options: ['Big Ben', 'Tour Eiffel', 'Empire State Building', 'Tour de Pise'],
    correctIndex: 0, theme: 'geographie', difficulty: 'easy',
    credit: 'Diliff', license: 'CC BY-SA 2.5',
    creditUrl: 'https://commons.wikimedia.org/wiki/File:Clock_Tower_-_Palace_of_Westminster,_London_-_September_2006.jpg',
  },
  {
    id: 'taj-mahal',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Taj_Mahal%2C_Agra%2C_India_edit3.jpg/500px-Taj_Mahal%2C_Agra%2C_India_edit3.jpg',
    label: 'Le Taj Mahal',
    fact: "Le Taj Mahal a été érigé par l'empereur Shah Jahan en mémoire de son épouse défunte.",
    options: ['Taj Mahal', 'Palais de marbre', 'Alhambra', 'Hagia Sophia'],
    correctIndex: 0, theme: 'geographie', difficulty: 'medium',
    credit: 'Wikimedia Commons', license: 'CC BY-SA 2.0',
    creditUrl: 'https://commons.wikimedia.org/wiki/File:Taj_Mahal,_Agra,_India_edit3.jpg',
  },
  {
    id: 'sydney-opera',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Sydney_Australia._(21339175489).jpg/500px-Sydney_Australia._(21339175489).jpg',
    label: "L'Opéra de Sydney",
    fact: "L'Opéra de Sydney, inauguré en 1973, est recouvert de plus d'un million de tuiles blanches.",
    options: ["Opéra de Sydney", "Musée Guggenheim", "Centre Pompidou", "Opéra Garnier"],
    correctIndex: 0, theme: 'geographie', difficulty: 'medium',
    credit: 'Diliff', license: 'CC BY-SA 3.0',
    creditUrl: 'https://commons.wikimedia.org/wiki/File:Sydney_Australia._(21339175489).jpg',
  },
  {
    id: 'great-wall',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/The_Great_Wall_of_China_at_Jinshanling-edit.jpg/500px-The_Great_Wall_of_China_at_Jinshanling-edit.jpg',
    label: 'La Grande Muraille de Chine',
    fact: "La Grande Muraille de Chine s'étire sur plus de 21 000 km, bâtie sur près de deux millénaires.",
    options: ['Grande Muraille de Chine', 'Muraille d\'Hadrien', 'Mur de Berlin', 'Remparts de Carcassonne'],
    correctIndex: 0, theme: 'geographie', difficulty: 'easy',
    credit: 'Jakub Hałun', license: 'CC BY-SA 4.0',
    creditUrl: 'https://commons.wikimedia.org/wiki/File:The_Great_Wall_of_China_at_Jinshanling-edit.jpg',
  },
  {
    id: 'mount-fuji',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Fuji_san_from_Fujiyoshida.jpg/500px-Fuji_san_from_Fujiyoshida.jpg',
    label: 'Le Mont Fuji',
    fact: "Le Mont Fuji, point culminant du Japon à 3 776 m, est un volcan toujours considéré comme actif.",
    options: ['Mont Fuji', 'Mont Everest', 'Kilimandjaro', 'Mont Blanc'],
    correctIndex: 0, theme: 'geographie', difficulty: 'medium',
    credit: 'Wikimedia Commons', license: 'Domaine public',
    creditUrl: 'https://commons.wikimedia.org/wiki/File:Fuji_san_from_Fujiyoshida.jpg',
  },
  {
    id: 'mona-lisa',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/500px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg',
    label: 'La Joconde',
    fact: "La Joconde mesure à peine 77 cm de haut et est protégée par une vitre blindée au Louvre.",
    options: ['La Joconde', 'La Naissance de Vénus', 'La Jeune Fille à la Perle', 'La Liberté guidant le peuple'],
    correctIndex: 0, theme: 'art', difficulty: 'easy',
    credit: 'Léonard de Vinci', license: 'Domaine public',
    creditUrl: 'https://commons.wikimedia.org/wiki/File:Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg',
  },
  {
    id: 'starry-night',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/500px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg',
    label: 'La Nuit étoilée',
    fact: "Van Gogh a peint La Nuit étoilée en 1889 depuis la fenêtre de l'asile de Saint-Rémy-de-Provence.",
    options: ['La Nuit étoilée', 'Les Tournesols', 'Autoportrait à l\'oreille bandée', 'Iris'],
    correctIndex: 0, theme: 'art', difficulty: 'medium',
    credit: 'Vincent van Gogh', license: 'Domaine public',
    creditUrl: 'https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg',
  },
  {
    id: 'notre-dame',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Cath%C3%A9drale_Notre-Dame_de_Paris%2C_20_March_2014.jpg/500px-Cath%C3%A9drale_Notre-Dame_de_Paris%2C_20_March_2014.jpg',
    label: 'Notre-Dame de Paris',
    fact: "La cathédrale Notre-Dame de Paris, commencée en 1163, a mis près de 200 ans à être achevée.",
    options: ['Notre-Dame de Paris', 'Cathédrale de Chartres', 'Sacré-Cœur', 'Saint-Denis'],
    correctIndex: 0, theme: 'geographie', difficulty: 'easy',
    credit: 'Wikimedia Commons', license: 'CC BY-SA 3.0',
    creditUrl: 'https://commons.wikimedia.org/wiki/File:Cathédrale_Notre-Dame_de_Paris,_20_March_2014.jpg',
  },
];

function getPixelQuestions({ count = 5 }) {
  const shuffled = [...PIXEL_IMAGES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map(img => ({
    type:         'pixel',
    imageUrl:     img.url,
    question:     'Qu\'est-ce que c\'est ?',
    options:      img.options,
    correctIndex: img.correctIndex,
    label:        img.label,
    explanation:  img.fact || '',
    credit:       img.credit,
    creditUrl:    img.creditUrl,
    license:      img.license,
  }));
}

module.exports = { getPixelQuestions, PIXEL_IMAGES };

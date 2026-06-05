// server/questions.js — Base de questions QuizzRoom

const DB = {
  general: {
    easy: [
      { question: "Quelle est la capitale de la France ?", options: ["Lyon", "Paris", "Marseille", "Bordeaux"], correctIndex: 1, explanation: "Paris est la capitale de la France depuis le 6ᵉ siècle et compte plus de 2 millions d'habitants intra-muros." },
      { question: "Combien de côtés a un hexagone ?", options: ["5", "6", "7", "8"], correctIndex: 1, explanation: "« Hexa » vient du grec et signifie « six » — c'est pourquoi la France, à la forme hexagonale, est surnommée « l'Hexagone »." },
      { question: "Quel est le plus grand océan du monde ?", options: ["Atlantique", "Indien", "Arctique", "Pacifique"], correctIndex: 3, explanation: "Le Pacifique couvre à lui seul environ un tiers de la surface du globe, soit plus que toutes les terres émergées réunies." },
      { question: "En quelle année l'homme a-t-il marché sur la Lune ?", options: ["1965", "1967", "1969", "1971"], correctIndex: 2, explanation: "Le 21 juillet 1969, Neil Armstrong devient le premier homme à fouler la Lune lors de la mission Apollo 11." },
      { question: "Qui a peint la Joconde ?", options: ["Michel-Ange", "Raphaël", "Léonard de Vinci", "Botticelli"], correctIndex: 2, explanation: "Léonard de Vinci a peint la Joconde vers 1503 et l'a gardée près de lui jusqu'à sa mort en France." },
      { question: "Quelle planète est la plus proche du Soleil ?", options: ["Vénus", "Mars", "Mercure", "Terre"], correctIndex: 2, explanation: "Mercure est si proche du Soleil qu'une année n'y dure que 88 jours terrestres." },
      { question: "Quel est l'animal le plus rapide du monde ?", options: ["Lion", "Guépard", "Aigle", "Antilope"], correctIndex: 1, explanation: "Le guépard atteint 110 km/h, mais ne tient cette vitesse que sur quelques centaines de mètres." },
      { question: "Combien de joueurs dans une équipe de football ?", options: ["9", "10", "11", "12"], correctIndex: 2, explanation: "Une équipe de football aligne 11 joueurs sur le terrain, dont un gardien de but." },
      { question: "De quelle couleur est l'émeraude ?", options: ["Rouge", "Bleu", "Vert", "Violet"], correctIndex: 2, explanation: "L'émeraude tire son vert intense du chrome présent dans le béryl, sa roche d'origine." },
      { question: "Quel pays a la plus grande superficie ?", options: ["Canada", "Chine", "États-Unis", "Russie"], correctIndex: 3, explanation: "La Russie s'étend sur 17 millions de km² et chevauche deux continents, l'Europe et l'Asie." },
      { question: "Combien de continents y a-t-il sur Terre ?", options: ["5", "6", "7", "8"], correctIndex: 2, explanation: "On compte traditionnellement 7 continents, même si certains modèles n'en distinguent que 5 ou 6." },
      { question: "Quelle est la langue la plus parlée dans le monde ?", options: ["Anglais", "Espagnol", "Mandarin", "Hindi"], correctIndex: 2, explanation: "Le mandarin est la langue maternelle de près d'un milliard de personnes, principalement en Chine." },
      { question: "Qui est le président actuel de la France (2024) ?", options: ["Nicolas Sarkozy", "François Hollande", "Emmanuel Macron", "Marine Le Pen"], correctIndex: 2, explanation: "Emmanuel Macron, élu en 2017 puis réélu en 2022, est le plus jeune président de l'histoire de la République française." },
      { question: "Combien de grammes dans un kilogramme ?", options: ["10", "100", "1000", "10000"], correctIndex: 2, explanation: "Le préfixe « kilo » signifie mille : un kilogramme vaut donc exactement 1000 grammes." },
      { question: "Quelle est la couleur du ciel par temps clair ?", options: ["Vert", "Bleu", "Rouge", "Violet"], correctIndex: 1, explanation: "Le ciel paraît bleu car l'atmosphère diffuse davantage la lumière bleue, de plus courte longueur d'onde." },
    ],
    medium: [
      { question: "Quelle est la capitale de l'Australie ?", options: ["Sydney", "Melbourne", "Canberra", "Brisbane"], correctIndex: 2, explanation: "Canberra a été choisie comme capitale en 1908 pour mettre fin à la rivalité entre Sydney et Melbourne." },
      { question: "Quel élément chimique a pour symbole 'Au' ?", options: ["Argent", "Aluminium", "Or", "Cuivre"], correctIndex: 2, explanation: "Le symbole « Au » de l'or vient du latin « aurum », qui signifie « aube brillante »." },
      { question: "En quelle année la Révolution française a-t-elle commencé ?", options: ["1776", "1789", "1799", "1804"], correctIndex: 1, explanation: "La prise de la Bastille, le 14 juillet 1789, marque le début symbolique de la Révolution française." },
      { question: "Quel est le plus long fleuve du monde ?", options: ["Amazone", "Nil", "Yangtsé", "Mississippi"], correctIndex: 1, explanation: "Le Nil parcourt environ 6 650 km à travers le nord-est de l'Afrique avant de se jeter en Méditerranée." },
      { question: "Quelle est la formule chimique de l'eau ?", options: ["HO", "H2O", "H2O2", "OH"], correctIndex: 1, explanation: "Une molécule d'eau associe deux atomes d'hydrogène à un atome d'oxygène, d'où la formule H₂O." },
      { question: "Qui a écrit 'Les Misérables' ?", options: ["Balzac", "Zola", "Hugo", "Flaubert"], correctIndex: 2, explanation: "Victor Hugo a publié Les Misérables en 1862, en partie écrit pendant son exil sur l'île de Guernesey." },
      { question: "Combien d'os y a-t-il dans le corps humain adulte ?", options: ["186", "206", "226", "246"], correctIndex: 1, explanation: "L'adulte compte 206 os ; un nouveau-né en a près de 300, qui fusionnent au fil de la croissance." },
      { question: "Quelle est la monnaie du Japon ?", options: ["Yuan", "Won", "Yen", "Baht"], correctIndex: 2, explanation: "Le yen, créé en 1871, signifie littéralement « objet rond » en japonais." },
      { question: "Qui a composé la 9e Symphonie ?", options: ["Mozart", "Bach", "Beethoven", "Chopin"], correctIndex: 2, explanation: "Beethoven a composé sa 9ᵉ Symphonie alors qu'il était devenu complètement sourd." },
      { question: "Quel est le symbole chimique du fer ?", options: ["Fi", "Fe", "Fr", "Fw"], correctIndex: 1, explanation: "Le symbole « Fe » du fer vient du latin « ferrum »." },
      { question: "Combien de pays membres compte l'Union européenne (2024) ?", options: ["24", "25", "27", "30"], correctIndex: 2, explanation: "L'Union européenne compte 27 États membres depuis le départ du Royaume-Uni en 2020 (Brexit)." },
      { question: "Quel est le plus haut sommet du monde ?", options: ["K2", "Mont Blanc", "Everest", "Kilimandjaro"], correctIndex: 2, explanation: "L'Everest culmine à 8 849 m et gagne encore quelques millimètres d'altitude chaque année." },
      { question: "En quelle année a eu lieu la Seconde Guerre mondiale ?", options: ["1914-1918", "1935-1942", "1939-1945", "1941-1947"], correctIndex: 2, explanation: "La Seconde Guerre mondiale a duré six ans, de l'invasion de la Pologne en 1939 à la capitulation du Japon en 1945." },
      { question: "Quelle planète est surnommée 'la planète rouge' ?", options: ["Vénus", "Jupiter", "Mars", "Saturne"], correctIndex: 2, explanation: "Mars doit sa teinte rouge à l'oxyde de fer — de la rouille — qui recouvre sa surface." },
      { question: "Qui a peint le Plafond de la Chapelle Sixtine ?", options: ["Raphaël", "Michel-Ange", "Léonard de Vinci", "Caravage"], correctIndex: 1, explanation: "Michel-Ange a peint le plafond de la chapelle Sixtine entre 1508 et 1512, perché sur des échafaudages." },
    ],
    hard: [
      { question: "Quel est le pays avec le plus de fuseaux horaires ?", options: ["Russie", "États-Unis", "France", "Chine"], correctIndex: 2, explanation: "Grâce à ses territoires d'outre-mer, la France couvre 12 fuseaux horaires, plus que tout autre pays." },
      { question: "Quelle est la distance approximative Terre-Lune ?", options: ["184 000 km", "284 000 km", "384 000 km", "484 000 km"], correctIndex: 2, explanation: "La Lune gravite à environ 384 000 km de la Terre et s'en éloigne de 3,8 cm chaque année." },
      { question: "En quelle année fut fondée l'Organisation des Nations Unies ?", options: ["1942", "1945", "1948", "1950"], correctIndex: 1, explanation: "L'ONU a été fondée le 24 octobre 1945, après la Seconde Guerre mondiale, pour préserver la paix." },
      { question: "Quel mathématicien a formulé le 'dernier théorème' démontré en 1995 ?", options: ["Euler", "Gauss", "Fermat", "Riemann"], correctIndex: 2, explanation: "Énoncé par Fermat en 1637, son dernier théorème n'a été démontré qu'en 1995 par Andrew Wiles." },
      { question: "Quelle est la vitesse de rotation de la Terre sur elle-même à l'équateur ?", options: ["1 200 km/h", "1 350 km/h", "1 674 km/h", "2 000 km/h"], correctIndex: 2, explanation: "À l'équateur, la Terre tourne sur elle-même à environ 1 674 km/h." },
      { question: "Combien de langues officielles l'ONU reconnaît-elle ?", options: ["4", "5", "6", "7"], correctIndex: 2, explanation: "L'ONU reconnaît 6 langues officielles : anglais, français, espagnol, russe, chinois et arabe." },
      { question: "Quel est le numéro atomique de l'or ?", options: ["47", "74", "79", "82"], correctIndex: 2, explanation: "L'or possède 79 protons ; c'est l'un des rares métaux qui ne se corrode pas." },
      { question: "Qui a peint 'La Persistance de la mémoire' ?", options: ["Picasso", "Dalí", "Magritte", "Miró"], correctIndex: 1, explanation: "Salvador Dalí a peint ses célèbres montres molles en 1931, symbole surréaliste du temps qui se déforme." },
      { question: "Quel est le traité à l'origine de l'Union européenne ?", options: ["Traité de Rome", "Traité de Lisbonne", "Traité de Maastricht", "Traité d'Amsterdam"], correctIndex: 2, explanation: "Le traité de Maastricht, signé en 1992, a officiellement créé l'Union européenne." },
      { question: "Quelle est la densité de l'eau à 4°C ?", options: ["0,99 g/cm³", "1,00 g/cm³", "1,01 g/cm³", "1,05 g/cm³"], correctIndex: 1, explanation: "L'eau atteint sa densité maximale (1,00 g/cm³) à 4 °C, ce qui explique pourquoi la glace flotte." },
    ],
  },

  science: {
    easy: [
      { question: "Quelle planète est la plus grande du système solaire ?", options: ["Saturne", "Neptune", "Jupiter", "Uranus"], correctIndex: 2 },
      { question: "De quoi les plantes ont-elles besoin pour faire la photosynthèse ?", options: ["CO2 et eau", "O2 et sucre", "Azote et eau", "Sel et CO2"], correctIndex: 0 },
      { question: "Quel gaz respirons-nous principalement ?", options: ["Oxygène", "Azote", "CO2", "Hélium"], correctIndex: 1 },
      { question: "Combien de dents a un adulte (sans les dents de sagesse) ?", options: ["24", "28", "32", "36"], correctIndex: 1 },
      { question: "Qu'est-ce que l'ADN ?", options: ["Une vitamine", "L'information génétique", "Une protéine", "Un enzyme"], correctIndex: 1 },
      { question: "Quelle est la couleur de la lumière quand les 3 couleurs primaires sont mélangées ?", options: ["Noir", "Blanc", "Gris", "Jaune"], correctIndex: 1 },
      { question: "Combien de planètes dans le système solaire ?", options: ["7", "8", "9", "10"], correctIndex: 1 },
      { question: "Qu'est-ce qu'un atome ?", options: ["Une molécule", "La plus petite unité d'un élément", "Un électron libre", "Un noyau seul"], correctIndex: 1 },
    ],
    medium: [
      { question: "Quelle est la vitesse de la lumière dans le vide ?", options: ["200 000 km/s", "300 000 km/s", "400 000 km/s", "150 000 km/s"], correctIndex: 1 },
      { question: "Quel organe produit l'insuline ?", options: ["Foie", "Rein", "Pancréas", "Rate"], correctIndex: 2 },
      { question: "Combien de chromosomes a un être humain ?", options: ["23", "44", "46", "48"], correctIndex: 2 },
      { question: "Quelle est la température d'ébullition de l'eau au niveau de la mer ?", options: ["90°C", "95°C", "100°C", "105°C"], correctIndex: 2 },
      { question: "Quel est le pH d'une solution neutre ?", options: ["0", "5", "7", "14"], correctIndex: 2 },
      { question: "Quelle force maintient les planètes en orbite autour du Soleil ?", options: ["Force magnétique", "Gravitation", "Force électrique", "Force nucléaire"], correctIndex: 1 },
      { question: "Quel gaz est principalement responsable de l'effet de serre ?", options: ["Oxygène", "Azote", "CO2", "Hydrogène"], correctIndex: 2 },
      { question: "Quel est l'élément le plus abondant dans l'univers ?", options: ["Oxygène", "Hélium", "Carbone", "Hydrogène"], correctIndex: 3 },
      { question: "Combien d'électrons peut contenir la première couche électronique ?", options: ["2", "4", "8", "18"], correctIndex: 0 },
      { question: "Qu'est-ce que le Big Bang ?", options: ["Un trou noir", "L'origine de l'univers", "Une supernova", "Une galaxie"], correctIndex: 1 },
    ],
    hard: [
      { question: "Quelle est la constante de Planck (ordre de grandeur) ?", options: ["6,6 × 10⁻³⁴ J·s", "3,0 × 10⁸ m/s", "6,02 × 10²³", "9,8 m/s²"], correctIndex: 0 },
      { question: "Que mesure le nombre d'Avogadro ?", options: ["La masse molaire", "Le nombre de particules par mole", "La constante des gaz", "La charge électrique"], correctIndex: 1 },
      { question: "Quel est le principe de l'incertitude d'Heisenberg ?", options: ["E=mc²", "On ne peut pas connaître simultanément position et quantité de mouvement", "La lumière est une onde et une particule", "L'entropie croît toujours"], correctIndex: 1 },
      { question: "Quelle est la demi-vie du carbone 14 ?", options: ["570 ans", "5 730 ans", "57 300 ans", "573 000 ans"], correctIndex: 1 },
      { question: "Qu'est-ce qu'un quasar ?", options: ["Un trou noir sans galaxie", "Un noyau de galaxie très lumineux", "Une étoile mourante", "Un amas de comètes"], correctIndex: 1 },
    ],
  },

  geographie: {
    easy: [
      { question: "Quelle est la capitale de l'Espagne ?", options: ["Barcelone", "Madrid", "Séville", "Valence"], correctIndex: 1 },
      { question: "Sur quel continent se trouve l'Égypte ?", options: ["Asie", "Europe", "Afrique", "Amérique"], correctIndex: 2 },
      { question: "Quelle est la capitale de l'Italie ?", options: ["Milan", "Naples", "Florence", "Rome"], correctIndex: 3 },
      { question: "Le Nil se jette dans quel océan / mer ?", options: ["Mer Rouge", "Océan Indien", "Méditerranée", "Atlantique"], correctIndex: 2 },
      { question: "Quelle est la capitale de l'Allemagne ?", options: ["Munich", "Hambourg", "Berlin", "Francfort"], correctIndex: 2 },
      { question: "Quel pays est entouré d'eau de tous côtés ?", options: ["Australie", "Brésil", "Inde", "France"], correctIndex: 0 },
      { question: "Quelle est la capitale du Maroc ?", options: ["Casablanca", "Marrakech", "Rabat", "Fès"], correctIndex: 2 },
      { question: "La Tour de Pise se trouve dans quelle ville ?", options: ["Rome", "Venise", "Pise", "Florence"], correctIndex: 2 },
    ],
    medium: [
      { question: "Quel est le plus grand pays du monde en superficie ?", options: ["Canada", "Chine", "États-Unis", "Russie"], correctIndex: 3 },
      { question: "Quelle est la capitale du Brésil ?", options: ["São Paulo", "Rio de Janeiro", "Brasília", "Salvador"], correctIndex: 2 },
      { question: "Quel désert est le plus grand du monde ?", options: ["Sahara", "Gobi", "Antarctique", "Arabie"], correctIndex: 2 },
      { question: "Par combien de pays est entourée la Suisse ?", options: ["4", "5", "6", "7"], correctIndex: 1 },
      { question: "Quel est le fleuve le plus long d'Europe ?", options: ["Danube", "Rhin", "Volga", "Dnieper"], correctIndex: 2 },
      { question: "Dans quel pays se trouve Machu Picchu ?", options: ["Chili", "Bolivie", "Pérou", "Équateur"], correctIndex: 2 },
      { question: "Quelle est la capitale de la Nouvelle-Zélande ?", options: ["Auckland", "Wellington", "Christchurch", "Dunedin"], correctIndex: 1 },
      { question: "Quel détroit sépare l'Europe de l'Afrique ?", options: ["Détroit de Malacca", "Détroit d'Ormuz", "Détroit de Gibraltar", "Détroit de Bering"], correctIndex: 2 },
    ],
    hard: [
      { question: "Quelle est la capitale du Kazakhstan ?", options: ["Almaty", "Astana", "Chymkent", "Karaganda"], correctIndex: 1 },
      { question: "Quel pays possède le plus de lacs du monde ?", options: ["Russie", "Canada", "Finlande", "États-Unis"], correctIndex: 1 },
      { question: "Quelle est la ville la plus peuplée du monde ?", options: ["Shanghai", "Mumbai", "Tokyo", "Delhi"], correctIndex: 3 },
      { question: "Le fleuve Congo se jette dans quel océan ?", options: ["Indien", "Atlantique", "Pacifique", "Arctique"], correctIndex: 1 },
      { question: "Quel est le point le plus bas de la Terre ?", options: ["Mer Morte", "Lac Assal", "Lac Baïkal", "Mariana"], correctIndex: 0 },
    ],
  },

  histoire: {
    easy: [
      { question: "En quelle année a eu lieu la Révolution française ?", options: ["1776", "1789", "1799", "1815"], correctIndex: 1 },
      { question: "Qui était le premier président des États-Unis ?", options: ["Abraham Lincoln", "George Washington", "Thomas Jefferson", "Benjamin Franklin"], correctIndex: 1 },
      { question: "Quel empire a construit le Colisée ?", options: ["Grec", "Romain", "Ottoman", "Byzantin"], correctIndex: 1 },
      { question: "En quelle année a commencé la Première Guerre mondiale ?", options: ["1912", "1914", "1916", "1918"], correctIndex: 1 },
      { question: "Qui était Napoléon Bonaparte ?", options: ["Roi de France", "Président", "Général et Empereur", "Cardinal"], correctIndex: 2 },
      { question: "Quel mur symbolique est tombé en 1989 ?", options: ["Mur de Chine", "Mur de Berlin", "Mur d'Hadrien", "Mur de Gaza"], correctIndex: 1 },
      { question: "En quelle année Christophe Colomb a-t-il découvert l'Amérique ?", options: ["1488", "1492", "1498", "1502"], correctIndex: 1 },
      { question: "Qui était Jules César ?", options: ["Un pharaon", "Un général et homme politique romain", "Un philosophe grec", "Un roi perse"], correctIndex: 1 },
    ],
    medium: [
      { question: "Quelle civilisation a construit les pyramides de Gizeh ?", options: ["Romaine", "Grecque", "Égyptienne", "Mésopotamienne"], correctIndex: 2 },
      { question: "En quelle année a été signé l'armistice de la Première Guerre mondiale ?", options: ["1917", "1918", "1919", "1920"], correctIndex: 1 },
      { question: "Qui était le pharaon le plus célèbre de l'Égypte antique ?", options: ["Ramsès II", "Toutânkhamon", "Cléopâtre", "Akhenaton"], correctIndex: 1 },
      { question: "La Révolution industrielle a débuté dans quel pays ?", options: ["France", "Allemagne", "Angleterre", "États-Unis"], correctIndex: 2 },
      { question: "Quel traité a mis fin à la Seconde Guerre mondiale en Europe ?", options: ["Traité de Versailles", "Traité de Potsdam", "Capitulation d'Allemagne nazie", "Traité de Paris"], correctIndex: 2 },
      { question: "Qui a inventé l'imprimerie en Occident ?", options: ["Galilée", "Gutenberg", "Leonardo da Vinci", "Newton"], correctIndex: 1 },
      { question: "En quelle année s'est effondré l'Union soviétique ?", options: ["1989", "1990", "1991", "1992"], correctIndex: 2 },
      { question: "Quelle civilisation a inventé l'écriture cunéiforme ?", options: ["Egyptienne", "Mésopotamienne (Sumériens)", "Phénicienne", "Chinoise"], correctIndex: 1 },
    ],
    hard: [
      { question: "Qui était le premier tsar de Russie ?", options: ["Pierre le Grand", "Ivan le Terrible", "Catherine II", "Alexandre Ier"], correctIndex: 1 },
      { question: "En quelle année a eu lieu la bataille de Waterloo ?", options: ["1812", "1813", "1815", "1821"], correctIndex: 2 },
      { question: "Quel empire était le plus grand de l'histoire en superficie ?", options: ["Empire romain", "Empire mongol", "Empire britannique", "Empire ottoman"], correctIndex: 2 },
      { question: "Qui a déchiffré les hiéroglyphes grâce à la Pierre de Rosette ?", options: ["Howard Carter", "Jean-François Champollion", "Heinrich Schliemann", "Arthur Evans"], correctIndex: 1 },
      { question: "En quelle année Mahomet a-t-il fondé l'islam (selon la tradition) ?", options: ["570", "610", "622", "632"], correctIndex: 2 },
    ],
  },

  sport: {
    easy: [
      { question: "Combien de joueurs dans une équipe de basketball ?", options: ["4", "5", "6", "7"], correctIndex: 1 },
      { question: "Quel pays a remporté la Coupe du Monde 2018 ?", options: ["Brésil", "Allemagne", "Argentine", "France"], correctIndex: 3 },
      { question: "Dans quel sport utilise-t-on un 'birdie' ?", options: ["Tennis", "Golf", "Badminton", "Cricket"], correctIndex: 1 },
      { question: "Combien de sets gagne-t-on un match de tennis (Grand Chelem hommes) ?", options: ["2", "3", "4", "5"], correctIndex: 1 },
      { question: "Quel athlète détient le record du 100m ?", options: ["Carl Lewis", "Michael Johnson", "Usain Bolt", "Justin Gatlin"], correctIndex: 2 },
      { question: "Dans quel sport joue-t-on au Stade de France ?", options: ["Football et Rugby", "Tennis", "Natation", "Athlétisme seul"], correctIndex: 0 },
      { question: "Combien de points vaut un essai au rugby ?", options: ["3", "5", "6", "7"], correctIndex: 1 },
      { question: "Quel pays organise les Jeux Olympiques d'été 2024 ?", options: ["Japon", "États-Unis", "France", "Australie"], correctIndex: 2 },
    ],
    medium: [
      { question: "Quel joueur de football a remporté le plus de Ballons d'Or ?", options: ["Cristiano Ronaldo", "Lionel Messi", "Ronaldinho", "Zinédine Zidane"], correctIndex: 1 },
      { question: "En quelle année la France a-t-elle remporté sa première Coupe du Monde ?", options: ["1994", "1996", "1998", "2000"], correctIndex: 2 },
      { question: "Quel est le Grand Chelem le plus ancien ?", options: ["US Open", "Roland Garros", "Wimbledon", "Open d'Australie"], correctIndex: 2 },
      { question: "Quel nageur a remporté le plus de médailles olympiques ?", options: ["Ian Thorpe", "Mark Spitz", "Michael Phelps", "Ryan Lochte"], correctIndex: 2 },
      { question: "Dans quel sport y a-t-il une 'touche' ?", options: ["Football américain", "Rugby", "Les deux", "Aucun"], correctIndex: 2 },
      { question: "Combien de buts en une rencontre s'appelle un hat-trick ?", options: ["2", "3", "4", "5"], correctIndex: 1 },
    ],
    hard: [
      { question: "Combien de victoires en Formule 1 a Michael Schumacher ?", options: ["79", "86", "91", "103"], correctIndex: 2 },
      { question: "Quelle nation a remporté le plus de médailles olympiques dans l'histoire ?", options: ["Russie/URSS", "Chine", "États-Unis", "Allemagne"], correctIndex: 2 },
      { question: "Quel est le record du monde actuel du marathon (2024) ?", options: ["1h58m00s", "2h00m35s", "2h00m35s", "2h01m09s"], correctIndex: 3 },
    ],
  },

  cinema: {
    easy: [
      { question: "Qui joue le rôle de Jack dans Titanic (1997) ?", options: ["Brad Pitt", "Johnny Depp", "Leonardo DiCaprio", "Tom Hanks"], correctIndex: 2 },
      { question: "Quel film est associé à la réplique 'Que la Force soit avec toi' ?", options: ["Star Trek", "Star Wars", "Avatar", "Matrix"], correctIndex: 1 },
      { question: "Qui a réalisé 'Les Dents de la mer' ?", options: ["Kubrick", "Spielberg", "Scorsese", "Cameron"], correctIndex: 1 },
      { question: "Quel dessin animé met en scène un poisson-clown ?", options: ["Shrek", "Cars", "Le Monde de Nemo", "L'Âge de glace"], correctIndex: 2 },
      { question: "Quel film a remporté le plus d'Oscars (égalité avec 11) ?", options: ["Titanic", "Le Seigneur des Anneaux", "Ben-Hur", "Les trois ont 11"], correctIndex: 3 },
      { question: "Dans quel film Simba est-il le personnage principal ?", options: ["Bambi", "Dumbo", "Le Roi Lion", "La Belle et la Bête"], correctIndex: 2 },
      { question: "Qui joue Iron Man dans le MCU ?", options: ["Chris Evans", "Chris Hemsworth", "Robert Downey Jr.", "Mark Ruffalo"], correctIndex: 2 },
      { question: "Quel film de 2009 est le plus gros succès au box-office mondial ?", options: ["Avengers", "Titanic", "Avatar", "Star Wars VII"], correctIndex: 2 },
    ],
    medium: [
      { question: "Qui a réalisé 'Pulp Fiction' ?", options: ["Coen Brothers", "Tarantino", "Rodriguez", "Fincher"], correctIndex: 1 },
      { question: "Quel film a lancé la saga James Bond en 1962 ?", options: ["Goldfinger", "Dr. No", "Casino Royale", "Bons Baisers de Russie"], correctIndex: 1 },
      { question: "Dans quel pays se passe 'Parasite' de Bong Joon-ho ?", options: ["Japon", "Chine", "Corée du Sud", "Taïwan"], correctIndex: 2 },
      { question: "Quel acteur a joué dans 'Philadelphia' et 'Forrest Gump' la même année ?", options: ["Dustin Hoffman", "Al Pacino", "Tom Hanks", "Robert De Niro"], correctIndex: 2 },
      { question: "Quel est le vrai nom de Charlie Chaplin ?", options: ["Charles Spencer Chaplin", "Charles John Chaplin", "Charles Albert Chaplin", "Charles Henri Chaplin"], correctIndex: 0 },
      { question: "Qui a composé la musique originale de Star Wars ?", options: ["Hans Zimmer", "Ennio Morricone", "John Williams", "Howard Shore"], correctIndex: 2 },
    ],
    hard: [
      { question: "Quel film de Kubrick est adapté d'un roman d'Arthur C. Clarke ?", options: ["2001 l'Odyssée de l'espace", "Orange mécanique", "Full Metal Jacket", "Shining"], correctIndex: 0 },
      { question: "Qui est le réalisateur d'Akira (1988) ?", options: ["Hayao Miyazaki", "Katsuhiro Otomo", "Mamoru Oshii", "Satoshi Kon"], correctIndex: 1 },
      { question: "Quel acteur a refusé l'Oscar du meilleur acteur en 1973 ?", options: ["Al Pacino", "Jack Nicholson", "Marlon Brando", "Dustin Hoffman"], correctIndex: 2 },
    ],
  },

  musique: {
    easy: [
      { question: "Quel groupe a chanté 'Bohemian Rhapsody' ?", options: ["The Beatles", "Rolling Stones", "Queen", "Led Zeppelin"], correctIndex: 2 },
      { question: "Comment s'appelle le chanteur de U2 ?", options: ["Sting", "Bono", "Phil Collins", "Elton John"], correctIndex: 1 },
      { question: "Quel instrument joue Elton John ?", options: ["Guitare", "Batterie", "Piano", "Violon"], correctIndex: 2 },
      { question: "Quelle pop star est surnommée 'La Reine de la Pop' ?", options: ["Britney Spears", "Beyoncé", "Madonna", "Lady Gaga"], correctIndex: 2 },
      { question: "Dans quelle ville est né le jazz ?", options: ["New York", "Chicago", "La Nouvelle-Orléans", "Memphis"], correctIndex: 2 },
      { question: "Quel rappeur français a sorti 'La Trilogie du Belge' ?", options: ["Booba", "PNL", "Orelsan", "Nekfeu"], correctIndex: 2 },
      { question: "Quel groupe suédois a formé ABBA ?", options: ["2 hommes et 2 femmes", "4 hommes", "4 femmes", "3 hommes et 1 femme"], correctIndex: 0 },
      { question: "Qui a composé la Lettre à Élise ?", options: ["Bach", "Beethoven", "Mozart", "Schubert"], correctIndex: 1 },
    ],
    medium: [
      { question: "En quelle année les Beatles se sont-ils séparés ?", options: ["1968", "1969", "1970", "1971"], correctIndex: 2 },
      { question: "Quel genre musical est originaire de la Jamaïque ?", options: ["Calypso", "Ska", "Reggae", "Dancehall"], correctIndex: 2 },
      { question: "Quel est l'album le plus vendu de tous les temps ?", options: ["Thriller", "Back in Black", "The Dark Side of the Moon", "Bat Out of Hell"], correctIndex: 0 },
      { question: "Qui est l'auteur-compositeur de 'Imagine' ?", options: ["Paul McCartney", "John Lennon", "George Harrison", "Ringo Starr"], correctIndex: 1 },
      { question: "Quel instrument Yo-Yo Ma joue-t-il ?", options: ["Violon", "Alto", "Violoncelle", "Contrebasse"], correctIndex: 2 },
    ],
    hard: [
      { question: "Combien de symphonies Beethoven a-t-il composées ?", options: ["7", "8", "9", "10"], correctIndex: 2 },
      { question: "Quel compositeur était sourd à la fin de sa vie ?", options: ["Mozart", "Bach", "Beethoven", "Brahms"], correctIndex: 2 },
      { question: "Quel mouvement musical des années 70 à New York a influencé le hip-hop ?", options: ["Disco", "Funk", "Breakbeat/DJ culture", "Punk"], correctIndex: 2 },
    ],
  },

  tech: {
    easy: [
      { question: "Qui a fondé Microsoft ?", options: ["Steve Jobs", "Bill Gates", "Mark Zuckerberg", "Larry Page"], correctIndex: 1 },
      { question: "Que signifie 'HTML' ?", options: ["Hyper Text Makeup Language", "Hyper Text Markup Language", "High Text Making Language", "Hyper Transfer Markup List"], correctIndex: 1 },
      { question: "En quelle année le premier iPhone a-t-il été lancé ?", options: ["2005", "2006", "2007", "2008"], correctIndex: 2 },
      { question: "Quelle entreprise a créé Android ?", options: ["Apple", "Microsoft", "Google", "Samsung"], correctIndex: 2 },
      { question: "Que signifie 'IA' ?", options: ["Internet Avancé", "Intelligence Artificielle", "Innovation Algorithmique", "Interface Automatique"], correctIndex: 1 },
      { question: "Quel langage de programmation Python doit son nom à ?", options: ["Un serpent", "Monty Python", "Un scientifique", "Un outil"], correctIndex: 1 },
    ],
    medium: [
      { question: "Qu'est-ce que le 'Cloud Computing' ?", options: ["Un type de matériel", "L'informatique via internet", "Un réseau local", "Un système d'exploitation"], correctIndex: 1 },
      { question: "Quel protocole sécurise les communications web ?", options: ["HTTP", "FTP", "HTTPS/SSL", "SMTP"], correctIndex: 2 },
      { question: "Que signifie 'CPU' ?", options: ["Central Processing Unit", "Computer Power Unit", "Core Processing Utility", "Central Program Unit"], correctIndex: 0 },
      { question: "Quel est le système d'exploitation open-source le plus utilisé au monde ?", options: ["Windows", "macOS", "Linux", "Unix"], correctIndex: 2 },
      { question: "Qu'est-ce que l'algorithme de Dijkstra calcule ?", options: ["Le tri d'un tableau", "Le chemin le plus court", "La compression de données", "Un nombre aléatoire"], correctIndex: 1 },
    ],
    hard: [
      { question: "Qu'est-ce que le 'garbage collection' en informatique ?", options: ["La suppression de fichiers", "La gestion automatique de la mémoire", "Le nettoyage de virus", "La défragmentation du disque"], correctIndex: 1 },
      { question: "Quel algorithme est utilisé dans Bitcoin pour le minage ?", options: ["MD5", "SHA-1", "SHA-256", "RSA"], correctIndex: 2 },
      { question: "Qu'est-ce qu'une 'race condition' ?", options: ["Un bug de performance", "Un conflit entre threads concurrents", "Une erreur de mémoire", "Un cycle infini"], correctIndex: 1 },
    ],
  },

  nature: {
    easy: [
      { question: "Quel est le plus grand mammifère terrestre ?", options: ["Hippopotame", "Rhinocéros", "Girafe", "Éléphant d'Afrique"], correctIndex: 3 },
      { question: "De combien d'espèces d'arbres la forêt amazonienne est-elle composée (ordre de grandeur) ?", options: ["Centaines", "Milliers", "Dizaines de milliers", "Millions"], correctIndex: 2 },
      { question: "Quel animal produit du miel ?", options: ["La guêpe", "L'abeille", "Le bourdon", "La fourmi"], correctIndex: 1 },
      { question: "Quel est le plus rapide des animaux marins ?", options: ["Dauphin", "Espadon", "Requin blanc", "Thon rouge"], correctIndex: 1 },
      { question: "Combien de pattes a une araignée ?", options: ["6", "7", "8", "10"], correctIndex: 2 },
      { question: "Quel arbre produit les glands ?", options: ["Hêtre", "Châtaignier", "Chêne", "Noyer"], correctIndex: 2 },
      { question: "Quel animal peut survivre dans le vide spatial ?", options: ["Cafard", "Tardigrade", "Scorpion", "Crevette de saumure"], correctIndex: 1 },
      { question: "Quel est le seul mammifère à voler naturellement ?", options: ["L'écureuil volant", "La chauve-souris", "Le lémur volant", "Le colugo"], correctIndex: 1 },
    ],
    medium: [
      { question: "Quelle plante carnivore est la plus grande du monde ?", options: ["Vénus attrape-mouche", "Sundew", "Nepenthes", "Pitcher Plant"], correctIndex: 2 },
      { question: "Combien de temps dure la gestation d'un éléphant ?", options: ["12 mois", "16 mois", "22 mois", "30 mois"], correctIndex: 2 },
      { question: "Qu'est-ce que la bioluminescence ?", options: ["La lumière solaire réfléchie", "La production de lumière par un être vivant", "La phosphorescence des roches", "La réfraction lumineuse dans l'eau"], correctIndex: 1 },
      { question: "Quelle est l'espèce de champignon la plus grande du monde ?", options: ["Amanite tue-mouches", "Armillaire couleur de miel", "Cèpe de Bordeaux", "Truffe noire"], correctIndex: 1 },
      { question: "Quel est l'arbre le plus vieux du monde ?", options: ["Baobab", "Séquoia", "Pin Bristlecone", "Olivier"], correctIndex: 2 },
    ],
  },

  art: {
    medium: [
      { question: "Qui a peint 'La Nuit étoilée' ?", options: ["Gauguin", "Monet", "Van Gogh", "Cézanne"], correctIndex: 2 },
      { question: "Quel style artistique Picasso a-t-il cofondé ?", options: ["Impressionnisme", "Cubisme", "Surréalisme", "Dadaïsme"], correctIndex: 1 },
      { question: "Quel musée abrite la Joconde ?", options: ["Musée d'Orsay", "Louvre", "Pompidou", "British Museum"], correctIndex: 1 },
      { question: "Qui a sculpté 'Le Penseur' ?", options: ["Michel-Ange", "Rodin", "Brancusi", "Giacometti"], correctIndex: 1 },
      { question: "Quel mouvement artistique Monet représente-t-il ?", options: ["Réalisme", "Romantisme", "Impressionnisme", "Expressionnisme"], correctIndex: 2 },
      { question: "Qui a peint 'La Persistance de la mémoire' (montres molles) ?", options: ["Picasso", "Dalí", "Magritte", "Ernst"], correctIndex: 1 },
      { question: "Quel artiste est connu pour ses boîtes de soupe Campbell ?", options: ["Roy Lichtenstein", "Andy Warhol", "Jasper Johns", "Robert Rauschenberg"], correctIndex: 1 },
      { question: "Qui a peint le 'Cri' ?", options: ["Munch", "Klimt", "Schiele", "Ensor"], correctIndex: 0 },
    ],
    hard: [
      { question: "En quelle année Picasso a-t-il peint Guernica ?", options: ["1933", "1935", "1937", "1939"], correctIndex: 2 },
      { question: "Quel mouvement artistique Marcel Duchamp a-t-il influencé ?", options: ["Surréalisme", "Art conceptuel et Dadaïsme", "Cubisme", "Expressionnisme abstrait"], correctIndex: 1 },
      { question: "Qui a créé la sculpture 'Fountain' (urinoir), œuvre conceptuelle ?", options: ["Man Ray", "Francis Picabia", "Marcel Duchamp", "Jean Arp"], correctIndex: 2 },
    ],
  },

  litterature: {
    medium: [
      { question: "Qui a écrit 'Don Quichotte' ?", options: ["Lope de Vega", "Cervantes", "Calderón", "García Lorca"], correctIndex: 1 },
      { question: "Dans quel roman apparaît le personnage de Sherlock Holmes ?", options: ["Agatha Christie", "Arthur Conan Doyle", "G.K. Chesterton", "Edgar Allan Poe"], correctIndex: 1 },
      { question: "Qui a écrit '1984' ?", options: ["Aldous Huxley", "Ray Bradbury", "George Orwell", "Philip K. Dick"], correctIndex: 2 },
      { question: "Quel auteur français a écrit 'La Condition humaine' ?", options: ["Sartre", "Camus", "Malraux", "Gide"], correctIndex: 2 },
      { question: "Quel est le premier tome de 'À la recherche du temps perdu' ?", options: ["Du côté de chez Swann", "À l'ombre des jeunes filles en fleurs", "Le Côté de Guermantes", "Sodome et Gomorrhe"], correctIndex: 0 },
      { question: "Qui a écrit 'Crime et Châtiment' ?", options: ["Tolstoï", "Tourgueniev", "Tchekhov", "Dostoïevski"], correctIndex: 3 },
      { question: "Dans quelle œuvre trouve-t-on le personnage de Raskolnikov ?", options: ["L'Idiot", "Crime et Châtiment", "Les Démons", "Les Frères Karamazov"], correctIndex: 1 },
      { question: "Qui a écrit 'Madame Bovary' ?", options: ["Balzac", "Zola", "Maupassant", "Flaubert"], correctIndex: 3 },
    ],
    hard: [
      { question: "Quel roman de Proust compte le plus de pages ?", options: ["Du côté de chez Swann", "La Prisonnière", "Le Temps retrouvé", "Sodome et Gomorrhe"], correctIndex: 2 },
      { question: "Qui a inventé le roman policier moderne ?", options: ["Arthur Conan Doyle", "Agatha Christie", "Edgar Allan Poe", "G.K. Chesterton"], correctIndex: 2 },
    ],
  },

  gastronomie: {
    easy: [
      { question: "Quel pays a inventé la pizza ?", options: ["Grèce", "Espagne", "Italie", "France"], correctIndex: 2 },
      { question: "De quoi est fait le guacamole ?", options: ["Concombre", "Avocat", "Poivron", "Pois chiche"], correctIndex: 1 },
      { question: "Quel est l'ingrédient principal du houmous ?", options: ["Lentilles", "Haricots blancs", "Pois chiches", "Fèves"], correctIndex: 2 },
      { question: "Quelle épice est la plus chère au monde ?", options: ["Vanille", "Cardamome", "Safran", "Poivre long"], correctIndex: 2 },
      { question: "Quel fromage est utilisé dans la pizza Margherita ?", options: ["Emmental", "Mozzarella", "Parmesan", "Burrata"], correctIndex: 1 },
      { question: "Quelle boisson est appelée 'vin des moines' dans certaines régions ?", options: ["Bière trappiste", "Hydromel", "Cidre", "Kombucha"], correctIndex: 0 },
      { question: "De quel pays vient le sushi ?", options: ["Chine", "Corée", "Japon", "Thaïlande"], correctIndex: 2 },
      { question: "Quel est l'ingrédient principal du tofu ?", options: ["Blé", "Pois chiches", "Soja", "Riz"], correctIndex: 2 },
    ],
    medium: [
      { question: "Quel chef français a reçu le plus d'étoiles Michelin en carrière ?", options: ["Joël Robuchon", "Paul Bocuse", "Alain Ducasse", "Guy Savoy"], correctIndex: 0 },
      { question: "Qu'est-ce que le 'foie gras' ?", options: ["Foie de porc engraissé", "Foie d'oie ou canard gavé", "Foie de veau cuit", "Pâté de bœuf"], correctIndex: 1 },
      { question: "Quel vin est associé à la région de Bordeaux ?", options: ["Vin blanc sec uniquement", "Vins rouges et blancs", "Vins mousseux", "Vins rosés"], correctIndex: 1 },
      { question: "Quelle technique de cuisine consiste à cuire dans du gras à basse température ?", options: ["Blanquette", "Confit", "Braisage", "Étuvée"], correctIndex: 1 },
    ],
  },
};

function getFromDB({ themes, difficulty, count }) {
  const questions = [];
  // Normaliser : accepter un string ou un tableau
  const themeList = Array.isArray(themes) ? themes : [themes || 'general'];

  for (const theme of themeList) {
    const themeData = DB[theme] || DB['general'];
    const diffData  = themeData[difficulty] || themeData['medium'] || Object.values(themeData)[0];
    if (diffData) questions.push(...diffData);
  }

  if (questions.length === 0) return [];
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// QuizzRoom n'utilise QUE la base de données locale ci-dessus (pas de génération IA).
// La DB est enrichie manuellement — voir le format des objets question.
function getQuestions({ themes = 'general', difficulty = 'medium', count = 10 }) {
  const dbQ = getFromDB({ themes, difficulty, count });
  return dbQ.sort(() => Math.random() - 0.5).slice(0, count);
}

module.exports = { getQuestions, _DB: DB };

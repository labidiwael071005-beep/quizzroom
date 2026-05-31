// server/profanity-filter.js
// Filtre de contenu pour pseudos et messages chat.
// Objectif : barrière dissuasive contre les insultes, slurs et spam évident.
// NB : ce filtre n'est PAS infaillible (contournements possibles), il est
// complété côté UX par un bouton "signaler" (TODO future).

// Deux niveaux de détection pour minimiser les faux positifs :
//
// 1. STRICT_BLOCKLIST : match par sous-chaîne sur le texte NORMALISÉ
//    (NFD + leetspeak + suppression d'espaces). Réservé aux mots qui ne
//    peuvent pas apparaître innocemment dans un autre mot ("connard" est
//    sûr ; "shit" ne l'est pas — cf. shitake).
//
// 2. WORD_BLOCKLIST : match par mot entier sur le texte NFD-only (sans
//    leet / sans strip d'espaces). Sert pour les mots courts ou dont une
//    sous-chaîne existe dans des mots innocents (bite → habiter, orbite ;
//    cunt → Scunthorpe ; pute → disputer ; etc.).
//
// 3. URL_BLOCKLIST : inclusion brute sur le texte lowercase, pour bloquer
//    les liens / domaines / promos.
const STRICT_BLOCKLIST = [
  'connard', 'connasse', 'enculé', 'encule', 'putain',
  'salope', 'salopard', 'bâtard', 'batard', 'pédé', 'tarlouze',
  'motherfucker', 'bougnoul', 'youpin', 'chinetoque',
  'nigger', 'nigga', 'faggot', 'tranny',
  'heil hitler', 'sieg heil',
];

const WORD_BLOCKLIST = [
  'pute', 'merde', 'fdp', 'tg', 'ntm', 'ftg', 'pd',
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick',
  'cunt', 'whore', 'slut', 'douchebag',
  'nègre', 'negre', 'negro',
  'gook', 'chink', 'kike',
  'retard', 'retarded', 'kkk',
  'porno', 'porn', 'nude', 'nudes', 'bite', 'couille',
  'penis', 'vagin', 'chatte', 'sexe', 'tapette',
];

const URL_BLOCKLIST = [
  'http://', 'https://', 'www.', '.com', '.net', '.fr/', '.org',
  'discord.gg', 'bit.ly', 'tinyurl', 't.me/',
  'free robux', 'crypto gratuit', 'cliquez ici',
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pseudos réservés (impersonation de l'équipe / système)
const RESERVED_PSEUDOS = [
  'admin', 'administrator', 'modérateur', 'moderator', 'mod',
  'système', 'systeme', 'system', 'serveur', 'server',
  'quizzroom', 'staff', 'support', 'bot', 'host', 'hôte',
  'null', 'undefined', 'anonymous', 'anonyme',
];

// Normalisation : convertit le texte pour neutraliser les contournements
// courants (espaces insérés, leetspeak, accents, caractères Unicode similaires).
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    // Décomposer les accents puis les retirer (é → e, à → a, etc.)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Remplacer caractères cyrilliques/grecs qui ressemblent à des lettres latines
    .replace(/[а]/g, 'a').replace(/[е]/g, 'e').replace(/[о]/g, 'o')
    .replace(/[р]/g, 'p').replace(/[с]/g, 'c').replace(/[у]/g, 'y')
    .replace(/[х]/g, 'x').replace(/[і]/g, 'i')
    // Leetspeak basique
    .replace(/@/g, 'a').replace(/0/g, 'o').replace(/1/g, 'i')
    .replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's')
    .replace(/7/g, 't').replace(/\$/g, 's')
    // Retirer espaces, tirets, underscores, points entre les lettres
    // (pour détecter "c o n n a r d" ou "c-o-n-n-a-r-d")
    .replace(/[\s\-_\.]+/g, '');
}

// Vérifie si un texte contient un mot interdit.
// Trois passes :
//   1) STRICT (sous-chaîne sur texte normalisé) — résiste leet/espaces
//   2) WORD  (mot entier sur texte NFD-only)    — évite les faux positifs
//   3) URL   (inclusion brute lowercase)         — anti-spam / promo
function containsProfanity(text) {
  if (!text) return false;

  // ── 1. Match strict (sous-chaîne sur texte aggressivement normalisé) ──
  const normalized = normalize(text);
  if (STRICT_BLOCKLIST.some(w => normalized.includes(normalize(w)))) return true;

  // ── 2. Match par mot entier sur texte NFD-only ──
  // On retire seulement les accents pour rester sensible aux frontières de
  // mots ; on n'applique pas le strip d'espaces / leetspeak (qui supprimerait
  // justement les frontières).
  const wordText = String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  for (const word of WORD_BLOCKLIST) {
    const w = String(word).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(w)}([^a-z0-9]|$)`, 'i');
    if (re.test(wordText)) return true;
  }

  // ── 3. URLs / domaines / promos ──
  const lower = String(text).toLowerCase();
  if (URL_BLOCKLIST.some(u => lower.includes(u))) return true;

  return false;
}

// Vérifie si un pseudo est réservé (impersonation)
function isReservedPseudo(pseudo) {
  if (!pseudo) return false;
  const normalized = normalize(pseudo);
  return RESERVED_PSEUDOS.some(reserved => normalized === normalize(reserved));
}

// Détecte le spam de caractères (ex: "AAAAAAAAAA" ou "!!!!!!!!!!")
function isSpammy(text) {
  if (!text) return false;
  // Plus de 5 caractères identiques d'affilée
  if (/(.)\1{5,}/.test(text)) return true;
  // Plus de 70% de majuscules sur un texte de plus de 10 caractères
  if (text.length > 10) {
    const upperCount = (text.match(/[A-Z]/g) || []).length;
    const letterCount = (text.match(/[A-Za-z]/g) || []).length;
    if (letterCount > 0 && upperCount / letterCount > 0.7) return true;
  }
  // Trop d'emojis (plus de 5 emojis consécutifs)
  if (/(\p{Emoji}){6,}/u.test(text)) return true;
  return false;
}

// Validation complète d'un pseudo
// Retourne { ok: boolean, reason?: string }
function validatePseudo(pseudo) {
  if (!pseudo || typeof pseudo !== 'string') {
    return { ok: false, reason: 'Pseudo invalide.' };
  }
  const trimmed = pseudo.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    return { ok: false, reason: 'Le pseudo doit faire entre 2 et 20 caractères.' };
  }
  if (isReservedPseudo(trimmed)) {
    return { ok: false, reason: 'Ce pseudo est réservé.' };
  }
  if (containsProfanity(trimmed)) {
    return { ok: false, reason: 'Ce pseudo contient des termes interdits.' };
  }
  if (isSpammy(trimmed)) {
    return { ok: false, reason: 'Ce pseudo semble inapproprié.' };
  }
  return { ok: true };
}

// Validation d'un message de chat
// Retourne { ok: boolean, reason?: string, cleaned?: string }
function validateChatMessage(text) {
  if (!text || typeof text !== 'string') {
    return { ok: false, reason: 'Message invalide.' };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'Message vide.' };
  }
  if (trimmed.length > 200) {
    return { ok: false, reason: 'Message trop long (200 caractères max).' };
  }
  if (containsProfanity(trimmed)) {
    return { ok: false, reason: 'Ce message contient des termes interdits.' };
  }
  if (isSpammy(trimmed)) {
    return { ok: false, reason: 'Message considéré comme du spam.' };
  }
  return { ok: true, cleaned: trimmed };
}

module.exports = {
  validatePseudo,
  validateChatMessage,
  containsProfanity,
  isReservedPseudo,
  isSpammy,
  normalize,
};

// ── Tests inline ──────────────────────────────────────────────
// Exécuter avec : `node server/profanity-filter.js`
// (rien n'est exécuté quand le module est require()'d par le serveur)
if (require.main === module) {
  const cases = [
    // [input, shouldBlock, label]
    // Faux positifs historiques — DOIVENT passer maintenant
    ['habiter',       false, 'mot innocent contenant "bite"'],
    ['orbite',        false, 'mot innocent contenant "bite"'],
    ['cohabite',      false, 'mot innocent contenant "bite"'],
    ['shitake',       false, 'mot innocent contenant "shit"'],
    ['penisula',      false, 'mot innocent contenant "penis"'],
    ['Scunthorpe',    false, 'mot innocent contenant "cunt"'],
    ['ChatTester',    false, 'mot innocent contenant "chatte"'],
    ['disputer',      false, 'mot innocent contenant "pute"'],
    ['salut tout le monde', false, 'phrase neutre'],
    ['étage',         false, 'mot innocent contenant "tg"'],
    ['Wael-1',        false, 'pseudo classique avec tiret'],
    // Vrais positifs — DOIVENT être bloqués
    ['connard',       true,  'insulte directe'],
    ['c0nn4rd',       true,  'insulte leetspeak'],
    ['c o n n a r d', true,  'insulte espacée'],
    ['salut pute',    true,  'mot entier "pute" en fin'],
    ['va te faire foutre, shit', true, 'mot entier "shit" entouré ponctuation'],
    ['chatte',        true,  'mot entier seul'],
    ['Connasse123',   true,  'insulte avec suffixe numérique'],
    ['rejoins-moi sur discord.gg/abc', true, 'lien promo discord'],
    ['https://malicious.example', true, 'URL bloquée'],
  ];
  let pass = 0, fail = 0;
  for (const [input, expected, label] of cases) {
    const actual = containsProfanity(input);
    const ok = actual === expected;
    const tag = ok ? '✅' : '❌';
    console.log(`${tag} "${input}" → ${actual ? 'BLOCK' : 'PASS '}  (attendu: ${expected ? 'BLOCK' : 'PASS '}) — ${label}`);
    ok ? pass++ : fail++;
  }
  console.log(`\n${pass}/${pass + fail} tests passés`);
  process.exit(fail > 0 ? 1 : 0);
}

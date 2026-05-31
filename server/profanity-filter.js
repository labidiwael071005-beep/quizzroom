// server/profanity-filter.js
// Filtre de contenu pour pseudos et messages chat.
// Objectif : barrière dissuasive contre les insultes, slurs et spam évident.
// NB : ce filtre n'est PAS infaillible (contournements possibles), il est
// complété côté UX par un bouton "signaler" (TODO future).

// Liste de mots-racines interdits (français + anglais).
// On match une racine → bloque ses dérivés (pluriel, conjugaisons).
// Ajoute/retire des entrées selon les retours utilisateurs.
const BLOCKLIST = [
  // ── Insultes françaises courantes ──
  'connard', 'connasse', 'enculé', 'encule', 'pute', 'putain',
  'salope', 'salopard', 'merde', 'batard', 'bâtard', 'fdp',
  'tg ', 'ntm', 'ftg', 'pd ', 'pédé', 'tapette', 'tarlouze',

  // ── Insultes anglaises courantes ──
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick',
  'cunt', 'whore', 'slut', 'motherfucker', 'douchebag',

  // ── Slurs racistes/homophobes (à bloquer strictement) ──
  'nègre', 'negre', 'negro', 'bougnoul', 'youpin', 'chinetoque',
  'gook', 'chink', 'kike', 'nigger', 'nigga', 'faggot', 'tranny',
  'retard', 'retarded',

  // ── Contenu sexuel explicite ──
  'porno', 'porn', 'sexe ', 'nude', 'nudes', 'bite', 'couille',
  'chatte ', 'penis', 'vagin',

  // ── Spam / phishing / promo ──
  'http://', 'https://', 'www.', '.com', '.net', '.fr/', '.org',
  'discord.gg', 'bit.ly', 'tinyurl', 't.me/',
  'free robux', 'crypto gratuit', 'cliquez ici',

  // ── Hate speech ──
  'heil hitler', 'sieg heil', 'kkk',
];

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

// Vérifie si un texte contient un mot interdit
function containsProfanity(text) {
  if (!text) return false;
  const normalized = normalize(text);
  return BLOCKLIST.some(word => normalized.includes(normalize(word)));
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

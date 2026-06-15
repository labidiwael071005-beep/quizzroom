# SquizzGame — Authentification Google OAuth (étape 1/2 : brancher l'auth)

Cette étape branche l'authentification Google **de bout en bout** (Passport +
Google strategy + sessions PostgreSQL + table `User` + bouton « Se connecter avec
Google » sur l'accueil + déconnexion) **sans encore** relier l'identité au
lobby / jeu / leaderboard. La connexion est **OPTIONNELLE** : un joueur anonyme
continue de jouer exactement comme avant.

> Étape suivante (autre prompt) : intégration de l'identité au jeu (lobby,
> leaderboard, profil/succès). On n'y touche pas ici.

---

## 1. Nouveau modèle `User` (Prisma)
Ajouté dans `prisma/schema.prisma`, migration `add_user` appliquée à Neon :
```prisma
model User {
  id              String   @id @default(cuid())
  googleId        String   @unique
  email           String?
  displayName     String
  avatarUrl       String?
  createdAt       DateTime @default(now())
  lastLoginAt     DateTime @default(now())
  preferredLocale String?  // 'fr'|'en'|'es' — peuplé plus tard
  @@index([googleId])
  @@index([email])
}
```
- Migration : `npx prisma migrate dev --name add_user` (dossier
  `prisma/migrations/20260615…_add_user/`, committée).
- Table `session` (store des sessions) créée automatiquement par
  `connect-pg-simple` (`createTableIfMissing: true`) dans la même base Neon —
  **pas** gérée par Prisma (volontaire, c'est le store qui en est propriétaire).

## 2. Dépendances ajoutées
```
npm i passport passport-google-oauth20 express-session connect-pg-simple pg
```
(`pg` est requis par `connect-pg-simple` pour le pool PostgreSQL.)

> Note : `npm audit` signale 6 vulnérabilités « high » **préexistantes** dans la
> chaîne `socket.io → engine.io → ws` (sans rapport avec cette étape ; le correctif
> imposerait un downgrade cassant de socket.io). Non traité ici.

## 3. Ordre des middlewares (IMPÉRATIF)
Dans `server/index.js`, l'ordre d'enregistrement est :
```
helmet (CSP)  →  express.json  →  rate-limit /api/  →  express.static
   →  express-session  →  passport.initialize  →  passport.session
   →  routes (/auth/*, /api/me, /api/*, /admin…)
```
- **session AVANT passport, passport AVANT les routes** (sinon `req.user` /
  `req.isAuthenticated()` indisponibles).
- `express.static` est placé **avant** la session → les assets statiques ne
  déclenchent **pas** de requête DB de session (perf).
- `app.set('trust proxy', 1)` (déjà présent) → indispensable pour que le cookie
  `secure` et le `redirect_uri` https fonctionnent derrière le proxy HTTPS de
  Render.

### Session
`express-session` + store `connect-pg-simple` (table `session` dans Neon via
`DATABASE_URL`) pour **survivre aux redémarrages de Render**. Cookie :
| Option | Valeur |
|--------|--------|
| `name` | `squizz.sid` |
| `httpOnly` | `true` |
| `sameSite` | `lax` |
| `secure` | `true` en production (`NODE_ENV === 'production'`) |
| `maxAge` | 30 jours |
`resave: false`, `saveUninitialized: false` (pas de cookie/ligne tant que rien
n'est écrit → aucun coût pour les visiteurs anonymes). **`SESSION_SECRET`** est
lu depuis l'env ; **erreur claire au boot** si absent en production.

### Passport
- `GoogleStrategy` (`callbackURL: '/auth/google/callback'`, `proxy: true`).
- Callback : `prisma.user.upsert({ where:{googleId}, create:{…}, update:{…,
  lastLoginAt:new Date()} })` → `done(null, user)`.
- `serializeUser` → `user.id` ; `deserializeUser` → `prisma.user.findUnique`.
- Aucune donnée sensible (googleId, tokens) n'est jamais renvoyée au client.

## 4. Routes d'authentification
| Méthode | Route | Rôle |
|--------|-------|------|
| `GET`  | `/auth/google` | Démarre l'OAuth (`scope: profile, email`). `?returnTo=/chemin` interne mémorisé en session. |
| `GET`  | `/auth/google/callback` | `failureRedirect: '/?login=fail'` ; succès → `returnTo || '/'` (puis nettoyé). |
| `POST` | `/auth/logout` | Vérif d'origine + `req.logout()` + `session.destroy()` + `clearCookie` → `{ok:true}`. |
| `GET`  | `/api/me` | Public/léger : `{authenticated:false}` ou `{authenticated:true, user:{id,displayName,avatarUrl,email,preferredLocale}}`. |

Sécurité :
- **Rate-limit** dédié `/auth/*` (60 req / 15 min) en plus de l'`apiLimiter`
  (60/min) qui couvre déjà `/api/me`.
- `returnTo` validé (`safeReturnTo`) : uniquement un chemin interne commençant
  par `/` et pas `//` → **anti open-redirect**.
- `/auth/logout` : `sameOrigin(req)` vérifie `Origin`/`Referer` (en plus du
  cookie `sameSite=lax`) → **403** si origine étrangère.
- L'admin (`/api/admin/*`) garde son propre `adminAuth` (token `ADMIN_PASSWORD`),
  **indépendant** de Google — non impacté.

## 5. Ajustements CSP (Helmet)
Ajout à `img-src` uniquement (le reste de la CSP est inchangé) pour afficher la
photo de profil Google :
```
"https://lh3.googleusercontent.com",
"https://*.googleusercontent.com"
```
Côté client, l'avatar est en `<img referrerpolicy="no-referrer">` (évite les
soucis de `Referer` sur les CDN Google). Le logo Google du bouton est un **SVG
inline** (aucune image externe → rien à autoriser en plus).

## 6. UI accueil (`public/index.html` + `home.css` + i18n)
Dans le panneau central, sous « Créer / Rejoindre », un bloc `#home-auth`
(masqué jusqu'à la réponse de `/api/me` pour éviter le clignotement) :
- **Déconnecté** : bouton chunky **« Se connecter avec Google »** (panneau blanc,
  bordure dorée, logo Google SVG inline) + note *« Optionnel — pour garder vos
  stats entre appareils »*. Clic → `window.location.href = '/auth/google'`.
- **Connecté** : carte utilisateur (avatar + `displayName` + bouton **« Se
  déconnecter »** → `POST /auth/logout` puis `reload()`).
- Au chargement : `fetch('/api/me')` branche l'état (`initAuth()` appelé après
  `initI18n`).

i18n : nouvelles clés dans les **3** locales (`fr`/`en`/`es`) :
`auth.separator`, `auth.signInWithGoogle`, `auth.optional`, `auth.signOut`.
`i18n.js` gère désormais aussi `data-i18n-aria-label` (ajout additif).

Accessibilité : bouton avec `aria-label` traduit, SVG `aria-hidden`, avatar
`alt = displayName`, focus visible (`:focus-visible` du thème + sur le lien de
déconnexion).

## 7. Variables d'environnement requises
| Variable | Usage |
|----------|-------|
| `GOOGLE_CLIENT_ID` | OAuth Google |
| `GOOGLE_CLIENT_SECRET` | OAuth Google |
| `SESSION_SECRET` | Signature des cookies de session (obligatoire en prod) |
| `DATABASE_URL` | Base Neon (Prisma **et** store de session) |
| `NODE_ENV=production` | Active `cookie.secure` + le garde-fou `SESSION_SECRET` |
| `PUBLIC_URL` | Origine autorisée (CORS Socket.io) en prod |

**URIs de redirection** (Google Cloud → Identifiants OAuth) :
```
http://localhost:3000/auth/google/callback
https://quizzroom-vfz8.onrender.com/auth/google/callback
```
Le `callbackURL` est relatif (`/auth/google/callback`) + `proxy: true` →
construit automatiquement en `http://localhost…` en local et
`https://…onrender.com…` en prod, correspondant exactement aux URIs déclarés.

---

## 8. Checklist de test fonctionnel
1. **Connexion** : aller sur `/auth/google` (ou cliquer le bouton de l'accueil)
   → page Google → choisir un compte test → retour sur l'accueil, l'UI passe en
   **état connecté** (avatar + nom + « Se déconnecter »).
2. **/api/me** : `GET /api/me` non connecté → `{authenticated:false}` ✅ (vérifié) ;
   connecté → `{authenticated:true, user:{…}}` (avec `displayName`, `avatarUrl`,
   `email`, `preferredLocale`).
3. **Déconnexion** : bouton « Se déconnecter » (`POST /auth/logout`) → la page
   revient en **état déconnecté** (bouton de connexion réaffiché).
4. **Joueur anonyme** (jamais connecté) → peut toujours **créer une partie,
   rejoindre, jouer, chatter** comme avant (la connexion n'est jamais requise).
5. **Redémarrage Render** → la session est **préservée** (table `session` en base
   via `connect-pg-simple`, vérifiée présente en local).
6. **Aucune régression `/admin`** → toujours protégé par `ADMIN_PASSWORD`,
   indépendant de Google.

### Vérifié automatiquement en local (sans interaction Google)
- `/api/me` anonyme → `{authenticated:false}`.
- `/auth/google` → **302** vers `accounts.google.com` avec le bon `redirect_uri`
  (`http://localhost:3000/auth/google/callback`), `scope=profile email`,
  `client_id` correct.
- `POST /auth/logout` même origine → `{ok:true}` ; origine étrangère → **403**.
- Tables `session` et `User` présentes dans Neon après le boot.
- `/api/health` OK (pas de régression sur la pile `/api`).
- Accueil : markup `#home-auth` / bouton Google / carte utilisateur servis ;
  en-tête CSP contient `googleusercontent.com` ; locales servent les clés `auth.*`.

> Le tour complet OAuth (points 1, 3, 5) nécessite une interaction navigateur +
> compte Google réel → à valider manuellement (le headless du conteneur n'a pas
> les libs système pour lancer Chromium).

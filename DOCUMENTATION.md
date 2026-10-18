# Fidelity Plus — Documentation détaillée

> Carte de fidélité digitale pour commerces de proximité.
> Version en production depuis le 17 octobre 2026.

| | |
|---|---|
| **Application** | https://fidelity-plus.vercel.app |
| **API** | https://fidelity-api-2.onrender.com |
| **Code source** | https://github.com/akiraleseul45/fidelity-plus (branche `main`) |
| **Guide de déploiement** | [DEPLOYMENT.md](DEPLOYMENT.md) |

---

## Sommaire

1. [Présentation](#1-présentation)
2. [Les acteurs et leurs parcours](#2-les-acteurs-et-leurs-parcours)
3. [Règles métier](#3-règles-métier)
4. [Architecture générale](#4-architecture-générale)
5. [Frontend (application web)](#5-frontend-application-web)
6. [Backend (API)](#6-backend-api)
7. [Référence de l'API](#7-référence-de-lapi)
8. [Base de données](#8-base-de-données)
9. [Sécurité](#9-sécurité)
10. [Emails](#10-emails)
11. [Infrastructure de production](#11-infrastructure-de-production)
12. [Développement local](#12-développement-local)
13. [Tests et observabilité](#13-tests-et-observabilité)
14. [Limites connues et pistes d'amélioration](#14-limites-connues-et-pistes-damélioration)

---

## 1. Présentation

Fidelity Plus remplace la carte de fidélité papier à tampons. Le client affiche un QR code sur son téléphone, le commerçant le scanne avec le sien, et un point est ajouté sur la carte du client **chez ce commerçant**. Quand le client atteint le seuil fixé par le commerçant (par défaut 10 points), le commerçant peut lui accorder sa récompense depuis son tableau de bord.

Principes de conception :

- **Pas de mot de passe.** Chaque compte reçoit un code de connexion unique à l'inscription (5 chiffres pour un client, 8 caractères pour un pro).
- **Minimum de données personnelles.** Un client s'inscrit avec un simple pseudonyme ; l'email est facultatif (il sert uniquement à recevoir son code).
- **QR infalsifiable et à usage unique.** Le QR est signé par le serveur, expire en 60 secondes et ne peut être scanné qu'une seule fois.
- **Une carte par commerce.** Les points ne sont pas mutualisés : un client a un solde distinct chez chaque partenaire.

---

## 2. Les acteurs et leurs parcours

### 2.1 Client

| Étape | Écran | Ce qui se passe |
|---|---|---|
| Arrivée | **Accueil** | Boutons *Connexion* / *Inscription*, et un lien *Professionnel* en haut à droite. |
| Inscription | **ClientSignup** | Saisie du pseudonyme (2–40 caractères), email facultatif, case de consentement RGPD obligatoire. |
| Confirmation | **ClientSignupSuccess** | Affiche le code à 5 chiffres. Si un email a été donné, le code y est aussi envoyé. |
| Connexion | **ClientLogin** | Saisie du code à 5 chiffres. |
| Écran principal | **ClientQR** | QR personnel, renouvelé automatiquement toutes les 45 secondes (et mis en pause quand l'onglet est en arrière-plan). Accès aux récompenses, aux partenaires et au profil. |
| Mes cartes | **ClientRewards** | Liste des commerces où le client a des points, avec solde, seuil et type de récompense. |
| Partenaires | **ClientPartners** | Annuaire des commerces avec recherche, filtres et carte (OpenStreetMap, épingles rouges). |
| Fiche partenaire | **ClientPartnerDetail** | Adresse, téléphones, récompense proposée, position sur la carte. |
| Profil | **Profile** | Déconnexion et suppression du compte. |

### 2.2 Partenaire (commerçant)

| Étape | Écran | Ce qui se passe |
|---|---|---|
| Entrée pro | **PartnerAuthHome** | Choix *Connexion* / *Inscription*. |
| Inscription | **PartnerSignup** | Nom du gérant, nom du commerce, adresse (avec autocomplétion), email, téléphones fixe et mobile, consentement RGPD. (L'API accepte aussi une image, mais le formulaire ne la propose pas encore.) |
| Confirmation | **PartnerSignupSuccess** | Affiche le code à 8 caractères. Un email part au pro et une notification part à l'administrateur. |
| Connexion | **PartnerLogin** | Saisie du code à 8 caractères. |
| Écran principal | **PartnerScanner** | Caméra plein écran qui lit les QR. Après un scan : pseudonyme du client, nouveau solde, et un message si le seuil de récompense est atteint. |
| Tableau de bord | **PartnerDashboard** | Liste des clients triés par nombre de points. Le bouton de récompense devient actif quand le client atteint le seuil. |
| Réglages fidélité | **PartnerSettings** | Seuil de points (1 à 1000) et type de récompense : *repas offert* ou *réduction en %* (1 à 100). |

### 2.3 Administrateur

Il n'y a pas d'interface d'administration. L'administrateur (boîte `fidelity.plus45@gmail.com`) :

- reçoit un email à chaque nouvelle inscription de commerçant, avec toutes les informations saisies ;
- reçoit une copie cachée (BCC) de chaque email de bienvenue envoyé aux clients et aux pros, ce qui constitue un historique de tous les codes envoyés ;
- intervient directement en base (Supabase) pour toute opération de modération.

### 2.4 Parcours complet d'un point de fidélité

```
 CLIENT (téléphone)                 SERVEUR                       PARTENAIRE (téléphone)
 ──────────────────                 ───────                       ──────────────────────
 Ouvre l'écran QR
   GET /api/loyalty/qr  ──────────▶ crée un nonce (60 s)
                                    signe un jeton QR
   ◀──────────────────────────────  { qrToken, 60 }
 Affiche le QR
                                                                  Ouvre le scanner
                                                                  lit le QR
                                    ◀──────────────────────────── POST /api/loyalty/scan
                                    1. vérifie le partenaire       { qrToken }
                                    2. vérifie la signature + expiration
                                    3. vérifie le client
                                    4. TRANSACTION :
                                       - consomme le nonce
                                         (échoue s'il est déjà utilisé)
                                       - +1 point
                                       - journalise le scan
                                       - relit le solde
                                    ─────────────────────────────▶ { pseudonym, points,
                                                                     threshold, reached }
 (45 s plus tard le QR se
  renouvelle automatiquement)
```

---

## 3. Règles métier

### 3.1 Codes de connexion

| | Client | Partenaire |
|---|---|---|
| Format | 5 chiffres, de `10000` à `99999` | 8 caractères parmi `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` |
| Nombre de combinaisons | 90 000 | environ 1 100 milliards |
| Caractères exclus | — | `0`, `O`, `1`, `I`, `L` (pour éviter les confusions) |
| Unicité | garantie par la base (clé primaire sur l'empreinte du code) | idem |

Le code est **permanent** : il n'expire pas et ne change pas. Il n'existe pas de procédure de récupération : un client qui perd son code et n'a pas donné d'email doit créer un nouveau compte.

### 3.2 Protection contre les tentatives

- Chaque adresse IP (l'adresse réelle du visiteur, résolue via Cloudflare) est limitée à **10 tentatives de connexion par 15 minutes**.
- Un compteur d'échecs par compte (`failed_attempts` / `locked_until`) existe dans le schéma, mais **la connexion se faisant par le code seul, un code erroné ne désigne aucun compte précis** : ce verrouillage par compte ne se déclenche donc pas en pratique. La protection effective est la limite par IP ci-dessus. Le renforcement de l'authentification client est suivi dans le rapport d'audit (FP-03).

### 3.3 Points et récompenses

- Chaque scan valide ajoute **exactement 1 point** sur la carte (client, partenaire).
- Le solde ne peut jamais devenir négatif (contrainte en base).
- Paramètres par défaut d'un nouveau partenaire : **seuil de 10 points**, récompense **repas offert**.
- Types de récompense : `free_meal` (repas/prestation offert) ou `discount` (réduction, valeur de 1 à 100 %).
- Quand le solde atteint le seuil, le scan renvoie `reached: true` et le scanner l'affiche.
- La récompense est utilisée en scannant le QR du client dans le **mode « récompense »** du scanner (le client doit donc être présent). Cela **retire le nombre de points du seuil** de façon atomique ; le surplus est conservé (ex. 12 points avec un seuil de 10 → il reste 2 points). Deux utilisations simultanées ne peuvent pas retirer les points deux fois.
- Chaque mouvement (ajout ou récompense) est enregistré dans un journal d'audit (table `scans`).

### 3.4 QR code

- Valable **60 secondes**.
- **Usage unique** : un second scan du même QR renvoie « Ce QR code a déjà été utilisé ».
- Renouvelé par l'application toutes les **45 secondes**, ce qui laisse toujours au moins 15 secondes de marge.
- Mis en pause quand l'onglet du navigateur est caché, pour ne pas générer de QR inutiles.
- Les QR expirés sont purgés de la base toutes les 10 minutes.

### 3.5 Inscriptions

- **Client** : email facultatif ; consentement RGPD obligatoire ; 5 inscriptions maximum par heure et par adresse IP.
- **Partenaire** : email obligatoire ; consentement RGPD obligatoire ; **une seule demande par email sur 24 heures** ; 5 inscriptions maximum par heure et par adresse IP.
- Un partenaire est créé avec le statut **`pending`** (en attente) : il ne peut **ni scanner ni utiliser de récompense**, et n'apparaît **pas** dans l'annuaire public tant qu'un opérateur ne l'a pas passé à **`approved`** via l'API d'administration (protégée par `ADMIN_API_TOKEN`). Un partenaire `suspended` est bloqué de la même manière.

### 3.6 Suppression de compte

Depuis l'écran Profil (`DELETE /api/auth/me`) :

- le compte est marqué comme supprimé (`deleted_at`) et l'**email est effacé** ;
- le compte ne peut plus se connecter, ses sessions ne peuvent plus être rafraîchies ;
- il disparaît de l'annuaire et des tableaux de bord des partenaires ;
- les lignes de fidélité et le journal des scans sont conservés pour l'audit, sans email associé.

---

## 4. Architecture générale

```
                        ┌──────────────────────────────────────┐
  Navigateur  ────────▶ │  VERCEL — frontend statique          │
  (mobile ou PC)        │  fidelity-plus.vercel.app            │
                        │  Expo Web / React Native / TypeScript│
                        └──────────────────┬───────────────────┘
                                           │ HTTPS, JSON
                                           │ cookies httpOnly (session)
                                           │ en-tête X-Client-Type: web
                                           ▼
                        ┌──────────────────────────────────────┐
                        │  RENDER — API Node.js / Express      │
                        │  fidelity-api-2.onrender.com         │
                        │  région Francfort, offre gratuite    │
                        └───────┬──────────────────┬───────────┘
                                │                  │
                 Postgres (TLS) │                  │ HTTPS
                 port 6543      │                  │
                                ▼                  ▼
              ┌──────────────────────┐   ┌────────────────────┐
              │ SUPABASE — Postgres  │   │ BREVO — emails     │
              │ eu-west-3 (Paris)    │   │ API HTTP           │
              │ via le pooler IPv4   │   │ 300 emails / jour  │
              └──────────────────────┘   └────────────────────┘

  cron-job.org ── GET /health toutes les 10 min ──▶ API (empêche la mise en veille)
```

Chaque `git push` sur `main` redéploie automatiquement le frontend (Vercel) et l'API (Render).

---

## 5. Frontend (application web)

### 5.1 Technologies

- **Expo (SDK 54) + React Native + TypeScript**, exporté en site web statique (`npx expo export --platform web`).
- **React Navigation** (pile native) pour la navigation entre écrans.
- **Zustand** pour l'état global.
- **expo-camera** (`CameraView`) pour la lecture des QR côté partenaire.
- **react-native-qrcode-svg** pour l'affichage du QR côté client.
- **Leaflet + tuiles OpenStreetMap** pour la carte des partenaires.
- **Nominatim (OpenStreetMap)** pour l'autocomplétion des adresses (France uniquement, gratuit, sans clé).
- **Sentry** (facultatif, actif seulement si un DSN est configuré).

### 5.2 Organisation du code (`app/src`)

| Dossier | Contenu |
|---|---|
| `screens/` | `HomeScreen`, `ProfileScreen`, et les sous-dossiers `client/` (7 écrans) et `partner/` (7 écrans) |
| `navigation/` | Déclaration des 16 routes de l'application |
| `stores/` | 4 stores Zustand : `authStore` (utilisateur connecté), `loyaltyStore` (soldes), `partnersStore` (annuaire), `themeStore` ; plus `bootstrap.ts` (restauration de session au démarrage) |
| `store/api.ts` | Client HTTP unique vers l'API |
| `store/AppContext.tsx` | Façade `useApp()` qui expose les stores aux écrans |
| `components/` | Boutons, cadre téléphone, carte, autocomplétion d'adresse, garde de permission caméra, gestion d'erreurs |
| `theme/` | Couleurs et styles |

### 5.3 Communication avec l'API (`store/api.ts`)

- L'adresse de l'API vient de la variable `EXPO_PUBLIC_API_URL`, intégrée **au moment du build** (un changement impose un redéploiement Vercel). Sans elle, l'application vise `http://localhost:3000`.
- Sur le web, toutes les requêtes partent avec `credentials: 'include'` et l'en-tête `X-Client-Type: web`, ce qui indique au serveur d'utiliser des cookies.
- Le jeton d'accès est gardé **en mémoire uniquement** sur le web (jamais dans `localStorage`).
- Sur une réponse `401`, le client appelle automatiquement `/api/auth/refresh` puis rejoue la requête. Un seul rafraîchissement est lancé même si plusieurs requêtes échouent en même temps.
- Au chargement de l'application, `bootstrap.ts` tente un rafraîchissement : si le cookie de session est valide, l'utilisateur est reconnecté sans ressaisir son code.
- En application native (non utilisée aujourd'hui), les jetons seraient renvoyés dans le corps de la réponse et stockés dans AsyncStorage.

---

## 6. Backend (API)

### 6.1 Technologies

Node.js + Express, avec : `helmet` (en-têtes de sécurité), `cors`, `cookie-parser`, `express-rate-limit`, `zod` (validation), `jsonwebtoken`, `pino` / `pino-http` (journaux JSON), `pg` (Postgres), `better-sqlite3` (SQLite en local), `@sentry/node`, `nodemailer` et `resend` (envoi d'emails de secours).

### 6.2 Organisation du code (`backend/`)

| Fichier / dossier | Rôle |
|---|---|
| `server.js` | Point d'entrée : configuration Express, routes, gestion d'erreurs, arrêt propre |
| `mailer.js` | Envoi d'emails (Brevo, puis Resend, puis SMTP) |
| `templates/` | Gabarits HTML des 3 emails |
| `src/routes/` | `auth.js`, `loyalty.js`, `partners.js`, `health.js` |
| `src/services/` | Logique métier : `auth.js` (inscription, connexion, sessions), `loyalty.js` (QR, scan, récompense) |
| `src/repositories/` | Accès aux données, une fichier par table principale |
| `src/db/` | Pilotes SQLite et Postgres, schémas SQL, script de migration SQLite → Postgres |
| `src/middleware/` | Authentification, validation, limitation de débit |
| `src/lib/` | Cryptographie, cookies de session, schémas de validation, journalisation, Sentry |
| `tests/` | Tests Jest + Supertest |

### 6.3 Chaîne de traitement d'une requête

1. **helmet** — en-têtes HTTP de sécurité.
2. **cors** — seules les origines listées dans `ALLOWED_ORIGINS` sont acceptées, avec cookies autorisés.
3. **cookie-parser** — lecture des cookies de session.
4. **express.json** — corps JSON limité à **64 Ko**.
5. **pino-http** — journal de chaque requête (méthode, URL, statut, durée). Le corps des requêtes n'est **jamais** journalisé.
6. Pour chaque route : limitation de débit → authentification (`requireAuth`) → contrôle du rôle (`requireRole`) → validation Zod → traitement.
7. **Gestion d'erreurs** : 404 « Route inconnue », 413 corps trop volumineux, 400 JSON invalide, 403 origine refusée, 500 « Erreur interne » (sans trace technique renvoyée au client, erreur transmise à Sentry si actif).

Au démarrage, l'API vérifie la connexion email puis lance la purge périodique des QR expirés. Sur un signal d'arrêt, elle termine les requêtes en cours (10 secondes maximum) avant de s'arrêter.

### 6.4 Couche base de données

Un même code fonctionne sur deux moteurs, choisis par la variable `DB_DRIVER` :

- **`sqlite`** (par défaut, développement local) : fichier `backend/data/app.sqlite`, mode WAL. Les transactions sont exécutées l'une après l'autre via une file d'attente.
- **`postgres`** (production) : pool de connexions `pg` (10 connexions par défaut, TLS obligatoire). Le pilote traduit automatiquement la syntaxe SQLite : `?` → `$1, $2…`, `MAX(0, x)` → `GREATEST(0, x)`.

Le schéma est créé ou mis à jour automatiquement au démarrage (`CREATE TABLE IF NOT EXISTS`). Si la base est injoignable au démarrage, l'API s'arrête.

---

## 7. Référence de l'API

Toutes les réponses sont en JSON, de la forme `{ "success": true, ... }` ou `{ "success": false, "error": "message en français" }`.

### 7.1 Authentification — `/api/auth`

| Méthode | Route | Accès | Limite | Corps | Réponse |
|---|---|---|---|---|---|
| POST | `/client/signup` | public | 5 / h / IP | `pseudonym`, `email?`, `consent` | utilisateur, `loginCode`, jeton d'accès (+ cookies) |
| POST | `/client/login` | public | 10 / 15 min / IP | `code` (5 chiffres) | utilisateur, jeton d'accès (+ cookies) |
| POST | `/partner/signup` | public | 5 / h / IP + 1 / 24 h / email | `ownerName`, `companyName`, `address`, `lat?`, `lng?`, `email`, `phoneFixed?`, `phoneMobile?`, `imageUrl?`, `consent` | `userId`, `loginCode` |
| POST | `/partner/login` | public | 10 / 15 min / IP | `code` (8 caractères) | profil partenaire, jeton d'accès (+ cookies) |
| POST | `/refresh` | cookies de session | — | — (web) | nouveau jeton d'accès, nouveaux cookies |
| POST | `/logout` | connecté | — | — | session révoquée, cookies effacés |
| GET | `/me` | connecté | — | — | profil complet |
| DELETE | `/me` | connecté | — | — | compte supprimé |

Codes d'erreur principaux : `401 Code inconnu.` (code faux, mauvais rôle ou compte verrouillé — volontairement indistinguables), `401 Session expirée.`, `429` (limite atteinte ou demande pro déjà envoyée dans les 24 h), `400` (validation).

### 7.2 Fidélité — `/api/loyalty`

| Méthode | Route | Rôle | Limite | Corps | Réponse |
|---|---|---|---|---|---|
| GET | `/qr` | client | 30 / min | — | `qrToken`, `expiresInSeconds: 60` |
| POST | `/scan` | partenaire | 60 / min | `qrToken` | `pseudonym`, `points`, `threshold`, `reached`, `clientId` |
| POST | `/redeem` | partenaire | — | `clientId` | `points` (nouveau solde) |
| GET | `/me` | client | — | — | liste des cartes du client (commerce, points, seuil, récompense) |
| GET | `/partner` | partenaire | — | — | liste des clients du partenaire (pseudonyme, points, dernier scan) |
| PUT | `/partner/settings` | partenaire | — | `rewardThreshold`, `rewardType`, `rewardValue?` | profil partenaire mis à jour |

Erreurs du scan : `400 Le QR code a expiré`, `400 QR code invalide`, `409 Ce QR code a déjà été utilisé`, `400 Client introuvable`. Erreur de la récompense : `400 Pas assez de points pour cette récompense`.

### 7.3 Annuaire et supervision

| Méthode | Route | Accès | Réponse |
|---|---|---|---|
| GET | `/api/partners` | public, 120 / min | liste des partenaires actifs (statut `approved` ou `pending`) : nom, adresse, coordonnées, téléphones, image, récompense |
| GET | `/health` | public | `{ ok, time, uptime, version, driver, checks: { db } }` — renvoie **503** si la base ne répond pas |
| GET | `/` | public | `{ name, status: "ok" }` |

---

## 8. Base de données

Neuf tables. Les dates sont stockées en millisecondes depuis 1970. Les identifiants sont des UUID.

### `users` — identité commune à tous les comptes
| Colonne | Description |
|---|---|
| `id` | identifiant |
| `role` | `client` ou `partner` |
| `email` | facultatif pour un client, effacé à la suppression |
| `login_code_hash` | empreinte scrypt du code de connexion |
| `failed_attempts`, `locked_until` | compteur d'échecs et fin de verrouillage |
| `consent_given_at` | date du consentement RGPD |
| `created_at`, `deleted_at` | création, suppression |

### `login_code_lookup` — retrouver un compte à partir d'un code
| Colonne | Description |
|---|---|
| `code_hmac` (clé primaire) | empreinte HMAC-SHA256 du code, calculée avec un secret serveur |
| `user_id` | compte correspondant |

### `client_profiles`
`user_id`, `pseudonym`, `created_at`.

### `partner_profiles`
`user_id`, `owner_name`, `company_name`, `address`, `lat`, `lng`, `phone_fixed`, `phone_mobile`, `image_url`, `reward_threshold` (défaut 10), `reward_type` (`free_meal` / `discount`), `reward_value`, `status` (`pending` / `approved` / `suspended`), `created_at`, `updated_at`.

### `loyalty` — solde par client et par commerce
Clé primaire (`client_id`, `partner_id`) ; `points` (toujours ≥ 0), `last_scan_at`, `created_at`, `updated_at`.

### `scans` — journal de tous les mouvements
`id`, `client_id`, `partner_id`, `delta` (+1 ou −seuil), `kind` (`add` / `redeem`), `nonce` (unique quand présent : un même QR ne peut pas apparaître deux fois), `created_at`.

### `qr_nonces` — QR émis
`nonce`, `client_id`, `issued_at`, `expires_at`, `consumed_at`, `consumed_by` (partenaire qui l'a scanné).

### `sessions` — sessions de connexion
`id`, `user_id`, `refresh_token_hash` (empreinte scrypt), `user_agent`, `ip`, `created_at`, `expires_at` (30 jours), `revoked_at`.

### `meta`
Paires clé / valeur techniques.

Toutes les tables dépendantes sont liées à `users` avec suppression en cascade. Des index couvrent les recherches fréquentes (par email, rôle, client, partenaire, date de scan, expiration).

---

## 9. Sécurité

### 9.1 Codes de connexion

- Le code n'est **jamais stocké en clair**.
- Il est stocké deux fois sous forme d'empreinte :
  - **scrypt** (salé, coût 2¹⁴) dans `users.login_code_hash`, pour la vérification ;
  - **HMAC-SHA256** avec un secret serveur dans `login_code_lookup`, pour retrouver le compte en une seule lecture et garantir l'unicité. Sans le secret, une copie de la base ne permet pas de retrouver les codes.
- Quand un code est inconnu, le serveur effectue quand même un calcul scrypt factice pour que le temps de réponse ne révèle rien.
- Le message d'erreur est le même pour un code inexistant, un mauvais rôle ou un compte verrouillé.

### 9.2 Sessions et jetons

| Élément | Durée | Où il vit | Protection |
|---|---|---|---|
| Jeton d'accès (JWT signé) | 15 min | mémoire de l'application | signé avec `JWT_ACCESS_SECRET`, contient l'identifiant et le rôle |
| Jeton de rafraîchissement (32 octets aléatoires) | 30 jours | cookie `fp_rt` | `httpOnly`, `Secure`, `SameSite=None`, limité au chemin `/api/auth` ; stocké en base sous forme d'empreinte scrypt |
| Identifiant de session | 30 jours | cookie `fp_sid` | mêmes protections |

- Les cookies `httpOnly` sont inaccessibles au JavaScript de la page : une faille XSS ne permet pas de les voler.
- `SameSite=None` + `Secure` est nécessaire car le frontend (`vercel.app`) et l'API (`onrender.com`) sont sur des domaines différents. En local, `SameSite=Lax` sans `Secure`.
- **Rotation** : chaque rafraîchissement révoque l'ancienne session et en crée une nouvelle. Un jeton volé puis réutilisé après le propriétaire est donc refusé.
- La déconnexion révoque la session en base et efface les cookies.

### 9.3 Anti-fraude sur les QR

- Le QR contient un JWT signé avec un secret dédié (`JWT_QR_SECRET`) : impossible de fabriquer un QR valide pour un autre client.
- Expiration à 60 secondes : une capture d'écran devient vite inutilisable.
- Nonce à usage unique, consommé dans la **même transaction** que l'ajout du point, avec une condition « pas encore consommé et pas expiré ». Si deux partenaires scannent le même QR au même instant, un seul obtient le point.
- Index unique sur `scans.nonce` comme seconde barrière.

### 9.4 Limitation et validation

- Limites de débit par IP (voir [section 7](#7-référence-de-lapi)).
- Validation Zod de tous les corps de requête : longueurs maximales, formats (email, codes, téléphone, URL, coordonnées), consentement obligatoire.
- Corps JSON limité à 64 Ko.

### 9.5 Réseau et en-têtes

- CORS limité à trois origines : `fidelity-plus.vercel.app` et ses deux alias Vercel.
- En-têtes de sécurité via `helmet`.
- Les journaux ne contiennent ni corps de requête, ni secrets.

### 9.6 Base de données

- L'API se connecte avec un utilisateur Postgres dédié, **`fidelity_app`**, propriétaire des tables.
- Les rôles publics de Supabase (`anon`, `authenticated`) **n'ont aucun droit** sur ces tables (vérifié) : l'API REST automatique de Supabase ne peut pas les lire, même avec la clé publique du projet.

### 9.7 Secrets requis (valeurs dans Render, jamais dans le code)

`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_QR_SECRET`, `CODE_HMAC_SECRET` (quatre valeurs différentes), `DATABASE_URL`, `BREVO_API_KEY`. Le fichier `backend/.env` local n'est pas versionné.

### 9.8 RGPD

- Consentement explicite et horodaté à l'inscription (client et partenaire).
- Pseudonyme au lieu du nom pour les clients, email facultatif.
- Suppression du compte par l'utilisateur lui-même, avec effacement de l'email.

---

## 10. Emails

### 10.1 Fournisseur

Ordre de préférence automatique dans `mailer.js` :

1. **Brevo** si `BREVO_API_KEY` est défini — **utilisé en production**.
2. **Resend** si `RESEND_API_KEY` est défini — conservé en secours ; en mode bac à sable il ne peut écrire qu'à l'adresse du titulaire du compte.
3. **SMTP Gmail** si `SMTP_USER` / `SMTP_PASS` sont définis — fonctionne en local, mais Render bloque le port SMTP.

Expéditeur en production : **Fidelity Plus &lt;fidelity.plus45@gmail.com&gt;** (adresse vérifiée dans Brevo).

### 10.2 Emails envoyés

| Déclencheur | Destinataire | Objet | Contenu |
|---|---|---|---|
| Inscription client avec email | le client (+ BCC admin) | « Bienvenue sur Fidelity Plus — ton code de connexion » | pseudonyme, code à 5 chiffres, mode d'emploi |
| Inscription partenaire | le pro (+ BCC admin) | « Bienvenue sur Fidelity Plus — votre code d'accès » | nom, commerce, code à 8 caractères |
| Inscription partenaire | l'admin | « Nouvelle demande pro — *nom du commerce* » | toutes les informations du formulaire et le code |

L'envoi est **non bloquant** : l'inscription réussit même si l'email échoue (le code est de toute façon affiché à l'écran). Les échecs sont visibles dans les journaux Render (`[mailer] ... failed`).

### 10.3 Quota

Offre gratuite Brevo : **300 emails par jour**. Une inscription client consomme 1 email, une inscription partenaire en consomme 2.

---

## 11. Infrastructure de production

### 11.1 Services

| Rôle | Service | Ressource | Offre |
|---|---|---|---|
| Frontend | Vercel | projet `fidelity-plus` | Hobby (gratuit) |
| API | Render | service web `fidelity-api 2`, région Francfort | Free |
| Base de données | Supabase | projet `fidelity-plus 2`, eu-west-3 (Paris), Postgres 17 | Free |
| Emails | Brevo | compte de `zenightmare45@gmail.com` | Free (300 / jour) |
| Maintien en éveil | cron-job.org | tâche « Fidelity Plus - anti-sleep » | Gratuit |
| Code | GitHub | `akiraleseul45/fidelity-plus` | Gratuit |

**Coût mensuel : 0 €.**

### 11.2 Configuration Vercel

- Dossier racine : `app`
- Commande de build : `npx expo export --platform web`
- Dossier de sortie : `dist`
- Variables : `EXPO_PUBLIC_API_URL=https://fidelity-api-2.onrender.com`, `EXPO_PUBLIC_ENV=production`
- Protection d'accès Vercel (SSO) : **désactivée**, pour que le site soit public.

### 11.3 Configuration Render

- Dossier racine : `backend` — build `npm install` — démarrage `npm start`
- Variables : `NODE_ENV=production`, `PORT=3000`, `DB_DRIVER=postgres`, `DATABASE_URL`, `ALLOWED_ORIGINS`, les 4 secrets JWT/HMAC, `BREVO_API_KEY`, `MAIL_FROM`, `ADMIN_EMAIL`, `LOG_LEVEL=info` (plus `RESEND_API_KEY` et `SMTP_*` en secours).
- `DATABASE_URL` pointe vers le **pooler Supabase en mode transaction** (`aws-0-eu-west-3.pooler.supabase.com:6543`, utilisateur `fidelity_app.<ref du projet>`). Le pooler est en IPv4, ce qui évite les erreurs `ENETUNREACH` de la connexion directe (IPv6 uniquement).

### 11.4 Contraintes des offres gratuites

| Contrainte | Effet | Parade en place |
|---|---|---|
| Render s'endort après 15 min sans requête | premier chargement de 30 à 50 s | ping `/health` toutes les 10 min |
| Supabase met en pause un projet inactif | API hors service | le ping sollicite la base à chaque passage |
| Brevo refuse les IP non autorisées si la restriction est active | emails bloqués | restriction d'IP désactivée dans Brevo |
| Brevo : 300 emails / jour | inscriptions au-delà sans email | offre payante si besoin |

### 11.5 Déploiement et retour arrière

- Déploiement : `git push` sur `main` → Vercel et Render reconstruisent automatiquement (2 à 4 minutes).
- Changer une variable Render relance un déploiement ; changer une variable Vercel `EXPO_PUBLIC_*` impose de relancer un déploiement Vercel.
- Retour arrière : Vercel → *Deployments* → *Promote to Production* sur une version précédente ; Render → *Events* → *Redeploy* d'un commit précédent.

---

## 12. Développement local

```bash
# API (http://localhost:3000, SQLite par défaut)
cd backend
npm install
npm start

# Application web (dans un second terminal)
cd app
npm install
npx expo start --web
```

Le fichier `backend/.env` doit contenir au minimum les 4 secrets JWT/HMAC. Sans `BREVO_API_KEY` ni `RESEND_API_KEY`, l'API utilise le SMTP Gmail défini par `SMTP_USER` / `SMTP_PASS`.

Pour copier des données SQLite vers Postgres : `node src/db/migrate-to-postgres.js` avec `DATABASE_URL` et `SQLITE_PATH` (voir [DEPLOYMENT.md](DEPLOYMENT.md)).

---

## 13. Tests et observabilité

### 13.1 Tests

```bash
cd backend
npm test
```

**41 tests, 5 fichiers, environ 16 secondes**, tous au vert :

| Fichier | Couvre |
|---|---|
| `auth.test.js` | inscriptions, connexion, sessions, rotation des jetons |
| `loginCodes.test.js` | unicité des codes (200 inscriptions sans collision), connexion en temps constant, garde-fou de performance |
| `loyalty.test.js` | QR, scan, rejeu refusé, QR falsifié refusé, récompense, purge des QR expirés |
| `routes-auth.test.js` | routes HTTP d'authentification |
| `routes-loyalty.test.js` | routes HTTP de fidélité |

Les limites de débit sont désactivées pendant les tests.

### 13.2 Supervision

- **Journaux** : tableau de bord Render → *Logs*. Journaux JSON avec niveau, service et durée de chaque requête.
- **Santé** : `GET /health` (utilisé par cron-job.org, dont l'historique montre chaque passage).
- **Emails** : tableau de bord Brevo → statistiques d'envoi, rebonds et blocages.
- **Erreurs** : Sentry, à activer en renseignant `SENTRY_DSN` (Render) et `EXPO_PUBLIC_SENTRY_DSN` (Vercel).

---

## 14. Limites connues et pistes d'amélioration

### Fonctionnelles

| Sujet | Situation actuelle | Piste |
|---|---|---|
| Validation des partenaires | Un partenaire en statut `pending` apparaît dans l'annuaire et peut scanner. Aucune interface ne fait passer un partenaire en `approved` ou `suspended`. | Filtrer l'annuaire et le scan sur `approved`, et ajouter une petite page d'administration. |
| Code perdu | Aucune procédure de récupération. | Renvoi du code par email pour les comptes qui en ont un. |
| Récompense | Accordée uniquement depuis le tableau de bord du partenaire. | Proposer le bouton directement sur l'écran du scan quand `reached` est vrai. |
| Historique | Le journal `scans` existe mais n'est pas affiché. | Écran « historique » côté client et côté pro. |

### Techniques et sécurité

| Sujet | Situation actuelle | Piste |
|---|---|---|
| Taille de l'espace des codes clients | 90 000 combinaisons. Avec beaucoup de comptes, un code tapé au hasard a une chance non négligeable de correspondre à un compte existant. La limite de 10 essais / 15 min / IP freine fortement mais n'empêche pas une attaque répartie sur de nombreuses IP. | Passer à 6 chiffres ou plus, ou ajouter une limite globale sur les échecs de connexion. |
| Limitation de débit | En mémoire, réinitialisée à chaque redémarrage de Render. | Stockage partagé (Redis) si plusieurs instances. |
| Suppression de compte | L'email est effacé mais le pseudonyme et l'historique de points restent en base. | Anonymiser aussi le pseudonyme. |
| Secrets exposés pendant la mise en place | Le mot de passe d'application Gmail, des secrets JWT de développement et les clés d'API ont transité dans des conversations. | Régénérer le mot de passe d'application Gmail et la clé Brevo, et révoquer les clés Resend inutilisées. |

### Ménage à faire dans les comptes

- Render : l'ancien service **`fidelity-api`** (`fidelity-api-6sgx.onrender.com`) est un doublon inutilisé.
- Vercel : le projet **`fidelity-plus2`** est un doublon inutilisé.
- Supabase : le projet **« akiraleseul45's Project »** est en pause et inutilisé.
- Resend : les clés `Onboarding`, `fidelity-plus-prod` et `fidelity-plus-prod-v2` ne servent plus depuis le passage à Brevo.
- Base de production : plusieurs comptes de test (« TestResend », « BrevoTest », etc.) ont été créés pendant la mise en route.

### Évolutions possibles

- **Nom de domaine** (environ 12 €/an) : adresse plus professionnelle et expéditeur d'email sur ce domaine.
- **Application installable (PWA)** : icône sur l'écran d'accueil du téléphone.
- **Applications natives** iOS / Android via EAS Build (compte Apple développeur : 99 €/an).
- **Sentry** pour être alerté des erreurs en production.

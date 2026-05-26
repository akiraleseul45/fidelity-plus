# Fidelity Plus — Guide de déploiement production

Ce document explique comment passer du code local à une app publique stable.

---

## 1. Architecture cible

```
            ┌────────────────────────┐
   user ───▶│  Vercel (frontend)     │
            │  fidelity-plus.        │
            │   vercel.app           │
            └──────────┬─────────────┘
                       │ HTTPS + X-Client-Type: web
                       │ + cookies httpOnly (refresh)
                       ▼
            ┌────────────────────────┐
            │  Render (backend)      │
            │  fidelity-api-...      │
            │   .onrender.com        │
            └──────────┬─────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   PostgreSQL       Gmail SMTP      Sentry
   (Supabase /     (Nodemailer)    (monitoring)
    Neon / Render)
```

---

## 2. Prérequis (services à provisionner)

1. **GitHub** : repo public ou privé (déjà fait : `akiraleseul45/fidelity-plus`).
2. **Vercel** : compte gratuit pour le frontend.
3. **Render** : compte gratuit pour le backend (passer en payant $7/mo si besoin de zéro sleep).
4. **PostgreSQL** : au choix
   - **Supabase** (recommandé, gratuit jusqu'à 500MB)
   - **Neon** (gratuit, autoscale)
   - **Render Postgres** ($7/mo)
5. **Gmail** : compte + mot de passe d'application activé.
6. **Sentry** (optionnel mais recommandé) : compte gratuit, 1 projet "fidelity-plus".

---

## 3. Provisionner Postgres

### Option A — Supabase (le plus simple)
1. Crée un projet sur https://supabase.com
2. Settings → Database → **Connection string** → format `URI`
3. Copie l'URL `postgres://postgres:[password]@db.xxx.supabase.co:5432/postgres`

### Option B — Neon
1. https://neon.tech → New project
2. Copie l'URL `postgres://user:pwd@ep-xxx.eu-central-1.aws.neon.tech/neondb`

### Option C — Render Postgres
1. Dashboard Render → **New** → **PostgreSQL**
2. Choisis la région la plus proche de ton backend (même région = latence < 1ms)
3. Copie l'**Internal Connection String** (utilisée par le backend Render).

---

## 4. Migrer les données SQLite → Postgres (si tu as déjà des comptes)

Depuis ton poste local :

```bash
cd backend
DATABASE_URL="postgres://..." \
  SQLITE_PATH="./data/app.sqlite" \
  node src/db/migrate-to-postgres.js
```

Sortie attendue :
```
→ Reading SQLite from ./data/app.sqlite
→ Connecting to Postgres postgres://...***@...
→ Running PG schema
  users: N rows
  login_code_lookup: N rows
  client_profiles: N rows
  partner_profiles: N rows
  loyalty: N rows
  scans: N rows
  qr_nonces: N rows
  sessions: N rows
✅ Migration complete
```

Idempotent — relancer ne fait rien (ON CONFLICT DO NOTHING).

---

## 5. Backend — Déployer sur Render

1. Dashboard Render → **New** → **Web Service**
2. Connecte ton repo GitHub → choisis `fidelity-plus`
3. Configure :
   - **Root Directory** : `backend`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Plan** : Free (ou Starter $7/mo pour pas de sleep)

4. **Environment** — ajoute toutes ces variables :

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `DB_DRIVER` | `postgres` |
| `DATABASE_URL` | `postgres://...` (de l'étape 3) |
| `ALLOWED_ORIGINS` | `https://fidelity-plus.vercel.app` (ton URL Vercel) |
| `JWT_ACCESS_SECRET` | (générer avec `openssl rand -base64 48`) |
| `JWT_REFRESH_SECRET` | (générer) |
| `JWT_QR_SECRET` | (générer) |
| `CODE_HMAC_SECRET` | (générer) |
| `SMTP_USER` | `ton-email@gmail.com` |
| `SMTP_PASS` | `xxxx xxxx xxxx xxxx` (mot de passe d'application Gmail) |
| `ADMIN_EMAIL` | `ton-email@gmail.com` |
| `SENTRY_DSN` | (optionnel) `https://xxx@sentry.io/yyy` |

⚠️ **Génère 4 secrets différents pour les JWT/HMAC.** Jamais le même secret 2× :
```bash
for s in JWT_ACCESS JWT_REFRESH JWT_QR CODE_HMAC; do
  echo "${s}_SECRET=$(openssl rand -base64 48)"
done
```

5. **Create Web Service** → attends ~3 min → vérifie `/health` :
   ```bash
   curl https://fidelity-api-xxx.onrender.com/health
   # → {"ok":true,"driver":"postgres","checks":{"db":"up"}}
   ```

---

## 6. Frontend — Déployer sur Vercel

1. Vercel → **Add New** → **Project** → import `fidelity-plus`
2. Configure :
   - **Root Directory** : `app`
   - **Framework Preset** : Other
   - **Build Command** : `npx expo export --platform web`
   - **Output Directory** : `dist`

3. **Environment Variables** :

| Key | Value |
|---|---|
| `EXPO_PUBLIC_API_URL` | `https://fidelity-api-xxx.onrender.com` (ton backend Render) |
| `EXPO_PUBLIC_SENTRY_DSN` | (optionnel) DSN Sentry frontend |
| `EXPO_PUBLIC_ENV` | `production` |
| `EXPO_PUBLIC_PRIVACY_URL` | URL CGU (ex: ton site Notion public) |
| `EXPO_PUBLIC_TERMS_URL` | URL terms |

4. **Deploy** → ~3-5 min → ouvre l'URL `https://fidelity-plus.vercel.app`

---

## 7. Vérification post-déploiement

```bash
# Backend up + DB OK
curl https://fidelity-api-xxx.onrender.com/health
# → 200 + {"checks":{"db":"up"}}

# Public partners endpoint
curl https://fidelity-api-xxx.onrender.com/api/partners
# → {"success":true,"items":[...]}

# Frontend serves the SPA
curl -sI https://fidelity-plus.vercel.app | head -3
# → HTTP/2 200
```

Puis dans Chrome :
- Ouvre `https://fidelity-plus.vercel.app`
- Inscris un client → vérifie réception email
- Inscris un partenaire → vérifie réception 2 emails (toi + le pro)
- Login partenaire → scanne le QR du client → +1 pt
- Devtools → Application → Cookies → tu dois voir `fp_rt` et `fp_sid` en httpOnly

---

## 8. Hardening post-lancement (à faire dans la première semaine)

### A. Cron-ping Render (anti-sleep)
- https://cron-job.org → free, crée un cron qui ping `https://fidelity-api-xxx.onrender.com/health` toutes les **10 minutes**
- Évite que le backend dorme après 15 min d'inactivité

### B. Domaine custom
- Vercel : Settings → Domains → ajoute `fidelity-plus.app` ou similaire
- Le HTTPS Let's Encrypt est automatique

### C. Sentry source maps (pour debug prod)
- Crée un compte Sentry → projet "fidelity-plus-frontend" + "fidelity-plus-backend"
- Mets les DSN dans Vercel + Render env vars
- Pour les sourcemaps frontend : `npm install --save-dev @sentry/cli` + script Vercel post-build

### D. Backups Postgres
- **Supabase** : snapshots automatiques quotidiens dans plan free
- **Neon** : Point-in-time recovery natif
- **Render Postgres** : snapshot quotidien + manual `pg_dump`

### E. Monitoring uptime
- UptimeRobot (gratuit) → ping `/health` toutes les 5 min, alerte email si KO

---

## 9. Scaling — quand passer à l'échelle suivante

| Métrique | Action |
|---|---|
| > 100 inscriptions/jour | Migrer Render Free → Starter ($7/mo) pour no-sleep |
| > 1000 utilisateurs actifs | Vérifier la consommation Postgres (CPU, IOPS) |
| > 10 req/s soutenu | Activer le pool pg `PG_POOL_MAX=20` |
| Multi-région users | Cloudflare CDN devant Vercel + DB read replica |
| Mobile native app | Build EAS (`expo prebuild + eas build`) + `expo-secure-store` pour les tokens |

---

## 10. Rollback strategy

Si un déploiement casse :

**Vercel** : Dashboard → Deployments → onglet "Production" → click "..." sur un ancien deploy OK → **Promote to Production**.

**Render** : Dashboard → ton service → **Events** → trouve le commit précédent qui marchait → **Redeploy**.

**Postgres** :
- Restaurer un snapshot via la console du provider (Supabase/Neon/Render)
- OU rollback partiel : `pg_dump --data-only` les tables à restaurer

---

## 11. Comptes secrets et accès

⚠️ **Ce qui doit rester strictement privé** :
- Mots de passe d'application Gmail
- DATABASE_URL (contient le mot de passe Postgres)
- Les 4 secrets JWT/HMAC (côté Render)
- Sentry DSN (côté Render + Vercel)

Tu peux les changer à tout moment depuis les dashboards. Si l'un est compromis, régénère immédiatement.

---

## 12. Checklist finale avant lancement public

- [ ] Backend Render répond `200 OK` sur `/health` avec `driver:postgres`
- [ ] Frontend Vercel charge sans erreur console
- [ ] Inscription client envoie l'email (vérifier spam)
- [ ] Inscription partner envoie 2 emails (admin + pro)
- [ ] Login pro fonctionne avec code reçu par email
- [ ] Scan QR fonctionne et +1 point persistent en DB
- [ ] Cookies `fp_rt` `fp_sid` visibles en httpOnly dans Chrome
- [ ] CORS strict : tester depuis un autre domaine que Vercel doit être refusé (par défaut le navigateur ne tentera même pas)
- [ ] Page profil : suppression de compte fonctionne (test avec un compte jetable)
- [ ] Sentry capture une exception test (forcer un crash temporairement)
- [ ] Cron de ping configuré
- [ ] Domaine custom configuré (si applicable)
- [ ] Politique de confidentialité publiée + lien dans `EXPO_PUBLIC_PRIVACY_URL`
- [ ] CGU publiées + lien dans `EXPO_PUBLIC_TERMS_URL`
- [ ] Mot de passe d'application Gmail régénéré (les anciens partagés en chat sont compromis)

---

**Ready to launch.** 🚀

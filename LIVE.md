# Going Live — DevOps Handover

Everything needed to take the Assetro platform from this repository to production.

`DEPLOY.md` is the step-by-step server walkthrough. **This file is the handover**:
what to provision, what secrets to collect, what must be fixed before launch, and
how to verify the result. Read the blockers in section 1 first — two of them will
break on a Linux server regardless of how well the deploy goes.

---

## 1. Blockers — fix before go-live

These are code/config issues found in the current build. None are DevOps tasks;
they need a developer. Listed first because they will bite in production.

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | `apps/api/src/modules/kyc/services/s3-upload.service.ts:5` hardcodes `UPLOADS_BASE = '/Users/hitendrasinhchauhan/Documents/Hiten/Assetro/uploads'` | **KYC document upload fails on any Linux server.** The path does not exist and is outside the app directory | Change to `process.env.UPLOADS_PATH ?? path.join(process.cwd(), 'uploads')` — the same pattern `main.ts:19` already uses |
| 2 | `apps/api/src/app.module.ts:130` sets TypeORM `synchronize: true` | TypeORM **alters the live schema to match entities on every boot**. A renamed or removed column silently drops production data | Set `synchronize: NODE_ENV !== 'production'` and introduce real migrations before the first production deploy |
| 3 | No Stripe webhook endpoint is registered for the production domain | Paid orders are never fulfilled automatically (see §8) | Register the endpoint at go-live. A reconcile fallback exists, but the webhook is still the primary path |

**Recommendation:** do not run a real payment or KYC flow in production until 1 and 2 are resolved.

---

## 2. What you are deploying

A pnpm/Turborepo monorepo. **Three** long-running processes:

| Process | Directory | Port | Serves |
|---|---|---|---|
| `assetro-api` | `apps/api` | 3000 | NestJS REST API, all modules in one process |
| `web-platform` | `apps/web-platform` | 3001 | Next.js — **investor at `/`, issuer at `/issuer`** |
| `web-admin` | `apps/web-admin` | 3003 | Next.js — admin console, separate app |

```
Internet → Nginx (443)
   ├── api.<domain>    → :3000   assetro-api
   ├── app.<domain>    → :3001   web-platform   ( / = investor, /issuer = issuer )
   └── admin.<domain>  → :3003   web-admin
```

Not deployed, ignore for production:

- `apps/blockchain-service` — not in `ecosystem.config.js`, not referenced by the API
- `contracts/` — Hardhat workspace, used to deploy smart contracts, not a runtime service

Port **3002 is unused**. Investor and issuer used to be separate apps and were merged
into `web-platform`; anything still pointing at 3002 is stale.

---

## 3. Infrastructure to provision

The API needs **PostgreSQL and Redis only**. Verified against the source — there are
no Mongo, RabbitMQ, or AWS SDK references anywhere in `apps/api/src`.

| Service | Version | Purpose | Notes |
|---|---|---|---|
| PostgreSQL | 15 | Primary datastore | Needs `uuid-ossp` extension and a dedicated schema |
| Redis | 7 | BullMQ job queues | Required at boot — the API registers `BullModule` globally |

> `infrastructure/docker/docker-compose.yml` also starts MongoDB, RabbitMQ and
> LocalStack. Those are **legacy from an older microservices layout** and are not
> required. Do not provision them.

**Server baseline:** Ubuntu 22.04 LTS, 4 GB RAM / 2 vCPU minimum. Next.js builds are
memory-hungry — if a build is killed or segfaults, that is almost always RAM. Either
build with `NODE_OPTIONS="--max-old-space-size=4096"` or add swap.

**Runtime:** Node.js `>= 20`, pnpm `>= 9` (repo pins `pnpm@9.0.0` via `packageManager`).

### Database bootstrap

```sql
CREATE USER assetro WITH PASSWORD '<strong-password>';
CREATE DATABASE assetro OWNER assetro;
\c assetro
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA IF NOT EXISTS <DB_SCHEMA> AUTHORIZATION assetro;
```

`DB_SCHEMA` must match the env var exactly. Tables are created on first boot by
TypeORM — see blocker #2 before relying on that in production.

---

## 4. DNS and TLS

```
A  api.<domain>    → <SERVER_IP>
A  app.<domain>    → <SERVER_IP>
A  admin.<domain>  → <SERVER_IP>
```

If the old split hostnames are already public, keep them as 301 redirects —
`infrastructure/nginx/nginx.conf` already contains these blocks:

- `investor.<domain>/*` → `app.<domain>/*`
- `issuer.<domain>/*`  → `app.<domain>/issuer/*`

Issue certificates for every hostname you keep, including the redirect ones:

```bash
certbot --nginx -d <domain> -d api.<domain> -d app.<domain> -d admin.<domain> \
        -d investor.<domain> -d issuer.<domain>
```

---

## 5. Secrets and environment

`.env` is gitignored and **is not in the repository** — you must create it. Nothing
below should ever be committed.

### Root `.env` (API) — `/opt/assetro/.env`

| Variable | Required | Who provides | Notes |
|---|---|---|---|
| `NODE_ENV` | ✅ | DevOps | `production` |
| `PORT` | ✅ | DevOps | `3000` |
| `DB_HOST` `DB_PORT` `DB_USERNAME` `DB_PASSWORD` `DB_NAME` `DB_SCHEMA` | ✅ | DevOps | The API reads **`DB_*`**, not `DATABASE_*` |
| `REDIS_HOST` `REDIS_PORT` `REDIS_PASSWORD` | ✅ | DevOps | Required at boot for BullMQ |
| `JWT_SECRET` | ✅ | DevOps | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | ✅ | DevOps | Separate value from `JWT_SECRET` |
| `JWT_EXPIRES_IN` `JWT_ACCESS_EXPIRES_SECONDS` `JWT_REFRESH_EXPIRES_SECONDS` | ◻️ | DevOps | Defaults exist |
| `CORS_ORIGINS` | ✅ | DevOps | Comma-separated **production** origins: `https://app.<domain>,https://admin.<domain>`. Browser calls fail if wrong |
| `UPLOADS_PATH` | ✅ | DevOps | Absolute path on a **persistent volume**, e.g. `/opt/assetro/uploads`. Holds KYC documents and token logos |
| `STRIPE_SECRET_KEY` | ✅ | Business/Finance | `sk_live_…` for real payments. Below ~20 chars the API silently runs in mock mode |
| `STRIPE_WEBHOOK_SECRET` | ✅ | DevOps | `whsec_…`, produced when the webhook endpoint is created (§8) |
| `BLOCKCHAIN_MODE` | ✅ | Dev/DevOps | `live` for a real chain |
| `DEFAULT_CHAIN_ID` | ✅ | Dev | e.g. `11155111` (Sepolia) |
| `SEPOLIA_RPC_URL` / `NEXT_PUBLIC_RPC_URL_11155111` | ✅ | DevOps | Use a paid provider. Public RPCs rate-limit and will break identity registration |
| `DEPLOYER_PRIVATE_KEY` | ✅ | **Blockchain owner** | Signs on-chain writes. See §7 — highest-value secret in the system |
| `CLAIM_ISSUER_PRIVATE_KEY` `CLAIM_ISSUER_ADDRESS` | ✅ | Blockchain owner | Signs KYC claims |
| `TREX_GATEWAY_ADDRESS` `ID_FACTORY_ADDRESS` `TRUSTED_ISSUERS_REGISTRY_ADDRESS` | ✅ | Dev | From the contract deployment |
| `*_MODULE_ADDRESS` (`COUNTRY_RESTRICT`, `MAX_BALANCE`, `MAX_HOLDER`, `SUPPLY_LIMIT`, `TRANSFER_WINDOW`, `DAY_MONTH_LIMITS`, `EXCHANGE_MONTHLY_LIMITS`) | ◻️ | Dev | Needed only for the compliance rules you enable |
| `API_BASE_URL` | ◻️ | DevOps | `https://api.<domain>` |

### Frontend `.env.production` — one per app

```bash
# apps/web-platform/.env.production  AND  apps/web-admin/.env.production
NEXT_PUBLIC_API_URL=https://api.<domain>/api/v1
```

> ⚠️ **`NEXT_PUBLIC_*` values are compiled into the JavaScript bundle at build time.**
> Write these files **before** running the build. Changing them later requires a
> rebuild and restart — a process restart alone does nothing.

### Secret handling

- Store secrets in your secret manager; `.env` on disk should be `chmod 600`, owned by the service user.
- **Rotate every key before go-live.** Development keys have been shared in chat/CI and must be treated as compromised.
- `DEPLOYER_PRIVATE_KEY` and `CLAIM_ISSUER_PRIVATE_KEY` control real on-chain assets. Never place them in a frontend env file, a container image, or a log.

---

## 6. Build and deploy

```bash
mkdir -p /opt/assetro && cd /opt/assetro
git clone <repo-url> .
git checkout <release-branch>

pnpm install --frozen-lockfile

# 1. Secrets FIRST — NEXT_PUBLIC_* is baked into the frontend bundles
#    (create /opt/assetro/.env and both .env.production files now)

# 2. API
cd apps/api && pnpm run build && cd ../..
#    If `nest build` is unavailable, the equivalent is:
#    npx tsc --project tsconfig.json --outDir ./dist --noEmit false

# 3. Frontends
cd apps/web-platform && pnpm run build && cd ../..
cd apps/web-admin    && pnpm run build && cd ../..

mkdir -p logs uploads

# 4. Start
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup          # run the command it prints
```

`ecosystem.config.js` defines all three processes and their ports. Review the
`NEXT_PUBLIC_API_URL` values in it — they currently point at a demo domain.

Expected:

```
│ assetro-api   │ online │
│ web-platform │ online │
│ web-admin    │ online │
```

### Nginx

```bash
cp infrastructure/nginx/nginx.conf /etc/nginx/sites-available/assetro
# replace the demo domain throughout, then:
ln -s /etc/nginx/sites-available/assetro /etc/nginx/sites-enabled/assetro
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

The config proxies `api`/`app`/`admin`, caches `/_next/static/` aggressively, and
redirects the legacy investor/issuer hosts. **`nginx -t` has not been run against a
real nginx** — validate before reloading.

### Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw deny 3000:3003/tcp      # app ports reachable only via Nginx
ufw enable
```

---

## 7. Blockchain prerequisites

Easy to miss and causes failures that look like application bugs.

1. **Fund the deployer wallet.** `DEPLOYER_PRIVATE_KEY`'s address pays gas for every
   identity registration, claim issuance and token deployment. If it runs dry,
   investor onboarding fails mid-flow. Monitor its balance and alert on low funds.
2. **The deployer must be an agent on each token's IdentityRegistry.** Tokens
   deployed through the platform's TREX factory get this automatically; externally
   deployed tokens do not, and `registerIdentity` will revert with `onlyAgent`.
3. **Use a dedicated, paid RPC endpoint.** Identity registration performs several
   calls per investor; public endpoints throttle.
4. **Confirm the contract addresses** in `.env` match the network in
   `DEFAULT_CHAIN_ID`. Mixing testnet addresses with a mainnet chain id fails in
   confusing ways.

---

## 8. Stripe — required for payments

**This has already caused a real unfulfilled order in development.** Fulfilment is
driven by a webhook; with no reachable endpoint, a customer is charged and the order
stays `pending`.

1. In the Stripe Dashboard create a webhook endpoint:

   ```
   https://api.<domain>/api/v1/payments/webhook/stripe
   ```

2. Subscribe to: `checkout.session.completed`, `checkout.session.expired`,
   `payment_intent.payment_failed`.

3. Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and restart the API.

4. **Delete any stale endpoints** — the development Stripe account still holds a
   disabled `ngrok` endpoint that Stripe gave up on after repeated failures.

5. Signature verification needs the raw request body. `main.ts` already sets
   `rawBody: true`; if you put a proxy or WAF in front that rewrites bodies,
   verification will fail.

There is a reconcile fallback — the payment success page re-checks the session
against Stripe and fulfils if payment is confirmed — so a missed webhook self-heals
when the buyer lands on the success page. Treat that as a safety net, not a
substitute for the webhook.

---

## 9. Post-deploy verification

```bash
# API
curl https://api.<domain>/health                      # {"status":"ok", ...}

# Frontends — all should be 200
curl -I https://app.<domain>            # investor landing
curl -I https://app.<domain>/launch     # portal chooser
curl -I https://app.<domain>/login      # investor sign-in
curl -I https://app.<domain>/issuer     # issuer landing
curl -I https://app.<domain>/issuer/login
curl -I https://admin.<domain>

# Legacy hosts → 301
curl -I https://investor.<domain>
curl -I https://issuer.<domain>
```

Then confirm by hand:

- [ ] Investor sign-in works; issuer credentials are **rejected** at `/login`
- [ ] Issuer sign-in works; investor credentials are **rejected** at `/issuer/login`
- [ ] An issuer visiting `/dashboard` is redirected to `/issuer/dashboard`
- [ ] Admin console loads and is reachable **only** at `admin.<domain>`
- [ ] Light/dark toggle works on both apps
- [ ] KYC document upload succeeds — **this exercises blocker #1**
- [ ] A Stripe test payment moves the order from `pending` to `paid`
- [ ] Stripe Dashboard shows the webhook delivering `200`

---

## 10. Operations

```bash
pm2 status
pm2 logs assetro-api --err --lines 100
pm2 restart assetro-api
pm2 monit
```

### Deploying an update

```bash
cd /opt/assetro
git pull origin <release-branch>
pnpm install --frozen-lockfile

cd apps/api && pnpm run build && cd ../..
# rebuild a frontend only if its code OR its NEXT_PUBLIC_* values changed
cd apps/web-platform && pnpm run build && cd ../..
cd apps/web-admin    && pnpm run build && cd ../..

pm2 restart all
```

### Back up

- **PostgreSQL** — nightly `pg_dump`, offsite. The only source of truth for users, KYC, payments, cap tables.
- **`UPLOADS_PATH`** — KYC documents and token logos. On local disk, so it is lost with the server unless backed up.
- **`.env`** — in your secret manager, not with the backups.

Redis holds transient job state and does not need backing up, but losing it mid-flight
drops queued identity-registration jobs.

### Monitor

- `GET /health` on the API
- Deployer wallet balance (§7)
- Stripe webhook delivery failures
- Disk usage on `UPLOADS_PATH`
- PM2 restart counts — a climbing count means a crash loop

---

## 11. Known issues to watch

| Issue | Severity | Notes |
|---|---|---|
| `Claims sync failed: null value in column "chain_id" of relation "investor_claims"` | Medium | Pre-existing, logs every ~10s. Non-fatal — the job marks it so — but it floods logs and claim mirroring is incomplete. Needs a developer |
| `database/` migrations and the root `db:migrate` / `db:seed` scripts | Low | Point at a missing `database/package.json`. Do not rely on them; schema currently comes from `synchronize: true` (blocker #2) |
| `docs/` | Low | Describes an older microservices architecture. `DEPLOY.md` and this file reflect the current unified API |
| Demo credentials in `LOGIN_CREDENTIALS.md` | **High** | Do not seed these accounts in production. Create real admin credentials and delete the demo ones |

---

## 12. Handover checklist

**Infrastructure**
- [ ] Server provisioned, Node 20 + pnpm 9 installed
- [ ] PostgreSQL 15 with database, user, `uuid-ossp`, schema
- [ ] Redis 7 reachable
- [ ] DNS records resolving
- [ ] TLS issued for all hostnames
- [ ] Firewall restricts 3000–3003 to Nginx

**Configuration**
- [ ] `/opt/assetro/.env` complete; all secrets freshly rotated
- [ ] Both `.env.production` files written **before** build
- [ ] `CORS_ORIGINS` matches the real domains
- [ ] `UPLOADS_PATH` on a persistent, backed-up volume
- [ ] `ecosystem.config.js` domains updated

**Blockchain**
- [ ] Deployer wallet funded, balance alert configured
- [ ] Paid RPC endpoint in use
- [ ] Contract addresses match `DEFAULT_CHAIN_ID`

**Payments**
- [ ] Stripe live keys in place
- [ ] Webhook endpoint registered and delivering `200`
- [ ] Stale/disabled endpoints removed

**Before announcing launch**
- [ ] Blockers #1 and #2 fixed and redeployed
- [ ] §9 verification passed end to end
- [ ] Database backup job running and a restore tested
- [ ] Demo accounts removed

---

## Contacts

| Area | Owner |
|---|---|
| Application code / blockers | _development team_ |
| Blockchain keys and contracts | _blockchain owner_ |
| Stripe account | _finance / business_ |
| Server, DNS, TLS, backups | _DevOps_ |

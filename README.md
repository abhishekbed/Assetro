# Assetro Platform

Monorepo for a tokenization and digital asset compliance platform.

The current runnable workspace contains:

- `apps/api`: unified NestJS API
- `apps/web-platform`: combined investor + issuer app (investor at `/`, issuer under `/issuer`)
- `apps/web-admin`: admin console
- `contracts`: Hardhat smart contracts
- `packages/*`: shared packages

`web-platform` serves both portals from one Next.js app and one session:

- `/` — investor landing, sign-in and dashboard
- `/issuer` — issuer overview, sign-in and dashboard
- `/launch` — the Launch Terminal chooser the landing page links to

A session may only enter the portal matching its role; signing in with the
wrong role is rejected at the login form. The admin console stays separate.

## Tech Stack

- Node.js 20
- pnpm 9
- Turborepo
- NestJS
- Next.js 14
- PostgreSQL
- Docker Compose

## Project Layout

```text
apps/
  api/
  web-platform/
  web-admin/
  blockchain-service/
contracts/
database/
docs/
infrastructure/
packages/
```

## Prerequisites

Install these first:

- Node.js `>= 20`
- pnpm `>= 9`
- Docker

Recommended:

```bash
corepack enable
corepack prepare pnpm@9.0.0 --activate
```

If `pnpm` fails because Corepack cannot write to its cache, use:

```bash
COREPACK_HOME=/tmp/corepack pnpm -v
```

## Install

From the repo root:

```bash
pnpm install
```

If needed:

```bash
COREPACK_HOME=/tmp/corepack pnpm install
```

## Local Infrastructure

The Docker setup lives in `infrastructure/docker/`.

Create the Docker env file:

```bash
cp infrastructure/docker/.env.example infrastructure/docker/.env
```

Start local services:

```bash
docker compose --env-file infrastructure/docker/.env -f infrastructure/docker/docker-compose.yml up -d
```

This starts:

- PostgreSQL on `5432`
- MongoDB on `27017`
- Redis on `6379`
- RabbitMQ on `5672`
- RabbitMQ UI on `15672`
- LocalStack on `4566`

## Application Environment

Create a root `.env` file.

Important: the API reads `DB_*` variables, not `DATABASE_*`.

Example:

```env
NODE_ENV=development
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=assetro
DB_PASSWORD=change_me_in_production
DB_NAME=assetro_platform
DB_SCHEMA=tenant_demo

CORS_ORIGINS=http://localhost:3001,http://localhost:3003

JWT_SECRET=assetro-dev-secret-key-change-in-production
JWT_REFRESH_SECRET=refresh-secret-change-me
JWT_EXPIRES_IN=86400s
JWT_ACCESS_EXPIRES_SECONDS=900
JWT_REFRESH_EXPIRES_SECONDS=604800

NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

## Database Setup

Create the tenant schema once after PostgreSQL is running:

```bash
docker exec -it assetro-postgres psql -U assetro -d assetro_platform -c "CREATE SCHEMA IF NOT EXISTS tenant_demo;"
```

Notes:

- The API uses TypeORM with `synchronize: true`, so tables are created on startup.
- The repository contains SQL migrations and seeds under `database/`, but the root `db:migrate` and `db:seed` scripts are not wired correctly right now.

## Run Locally

Start the API in one terminal:

```bash
pnpm --filter @assetro/api start:dev
```

```bash
pnpm dev
```

Important:

- `pnpm dev` at the root does not start the API.
- It starts the two Next.js frontends through Turborepo.


- API: `http://localhost:3000`
- API health: `http://localhost:3000/health`
- Platform (investor + issuer): `http://localhost:3001`
- Admin console: `http://localhost:3003`

Inside the platform app:

| Page | URL |
|---|---|
| Investor landing | `http://localhost:3001/` |
| Launch Terminal (pick a portal) | `http://localhost:3001/launch` |
| Investor sign-in | `http://localhost:3001/login` |
| Issuer overview | `http://localhost:3001/issuer` |
| Issuer sign-in | `http://localhost:3001/issuer/login` |

## Useful Commands
## Local URLs

```bash
pnpm build
pnpm lint
pnpm test
pnpm --filter @assetro/api start:dev
pnpm --filter @assetro/contracts test
```

Stop infrastructure:

```bash
docker compose --env-file infrastructure/docker/.env -f infrastructure/docker/docker-compose.yml down
```

## Known Issues

- There is no working root `README` in the original repo; this file reflects the current codebase.
- Root `.env.example` uses `DATABASE_*`, but the API actually expects `DB_*`.
- Root `docker:up` script uses `docker-compose`, while many environments only have `docker compose`.
- Root `db:migrate` and `db:seed` scripts point to a missing `database/package.json`.
- KYC uploads are hardcoded to a developer-specific absolute filesystem path in `apps/api/src/modules/kyc/services/s3-upload.service.ts`.
- Some docs in `docs/` describe an older microservices layout rather than the current unified API runtime.

## Demo Credentials

Treat the documented credentials as provisional.

- Frontend login pages show demo emails and passwords.
- SQL seed files only clearly define the super admin seed.
- If login fails, create users through `POST /api/v1/auth/register`.

## Production Notes

- See `DEPLOY.md` for the production deployment outline.
- Verify all env variable names against the current source before deploying.
- Rebuild frontend apps after changing `NEXT_PUBLIC_*` variables.

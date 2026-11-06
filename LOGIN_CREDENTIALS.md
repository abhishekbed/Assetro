# Assetro Platform - Login Credentials & URLs

## Frontend Portals

| Portal | URL | Description |
|---|---|---|
| Launch Terminal | [http://localhost:3001/launch](http://localhost:3001/launch) | Pick investor or issuer |
| Investor Portal | [http://localhost:3001/login](http://localhost:3001/login) | Token holders & buyers |
| Issuer Dashboard | [http://localhost:3001/issuer/login](http://localhost:3001/issuer/login) | Token issuers & compliance |
| Admin Console | [http://localhost:3003/login](http://localhost:3003/login) | Platform administration |

## Login Credentials

### Investor Portal
- **URL:** http://localhost:3001/login
- **Email:** `investor@assetro.com`
- **Password:** `Investor@123`
- **Role:** Investor
- **User:** Rahul Sharma

### Issuer Dashboard
- **URL:** http://localhost:3001/issuer/login
- **Email:** `issuer@assetro.com`
- **Password:** `Issuer@1234`
- **Role:** Issuer
- **User:** Priya Patel

### Admin Console
- **URL:** http://localhost:3003/login
- **Email:** `admin@assetro.com`
- **Password:** `Admin@12345`
- **Role:** Admin
- **User:** Platform Admin

For a fresh local database, start the API once to create its tables, then seed the admin account:

```bash
docker exec -i assetro-postgres psql -U assetro -d assetro_platform -v ON_ERROR_STOP=1 < scripts/seed-local-admin.sql
```

## Backend Services

| Service | URL | Health Check |
|---|---|---|
| API Gateway | http://localhost:3000 | [http://localhost:3000/health](http://localhost:3000/health) |
| Auth Service | http://localhost:3010 | POST /api/v1/auth/login |
| Token Service | http://localhost:3020 | GET /api/v1/tokens |
| Compliance Service | http://localhost:3030 | GET /api/v1/compliance/rules |
| KYC Service | http://localhost:3040 | GET /api/v1/kyc/stats |

## API Examples

### Login via API
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"investor@assetro.com","password":"Investor@123"}'
```

### Get KYC Stats
```bash
curl http://localhost:3000/api/v1/kyc/stats \
  -H "x-tenant-id: demo"
```

### Register New User
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"newuser@example.com","password":"NewUser@123","name":"New User","role":"investor"}'
```

## Database

- **Type:** PostgreSQL 14
- **Database:** assetro
- **Tenant Schema:** tenant_demo
- **Connection:** `psql -d assetro`

### Quick DB Check
```bash
psql -d assetro -c "SELECT email, name, role FROM tenant_demo.users;"
```

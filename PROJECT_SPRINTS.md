# Assetro Platform — Sprint Plan & Delivery Status

**Product:** Assetro — Multi-Tenant Tokenization & Digital Asset Compliance Platform
**Standard:** ERC-3643 (T-REX) + ONCHAINID (ERC-734 / ERC-735)
**Repository:** Turborepo monorepo (PNPM workspaces)
**Document status:** Reconciled against the codebase as of the current `ankit` branch
**Live testnet:** Ethereum Sepolia (chainId `11155111`) — full T-REX suite deployed and in use

---

## 1. Executive Summary

The original plan was 8 sprints / 16 weeks. Sprints 1–7 are complete. The work delivered
**after** Sprint 7 was substantial enough to constitute six additional sprints that were never
captured in this document — the ERC-3643 testnet go-live, the reusable ONCHAINID / claim-based
identity architecture, the asynchronous blockchain pipeline with chain→DB reconciliation, nine
on-chain compliance modules, and the completion of both the issuer and investor portals against
live contracts. Those are now documented as **Sprints 8–13**.

The one remaining sprint is **Sprint 14 — Testing, Security & Production Deployment**, which is
the gate to production. It has not started.

| | |
|---|---|
| **Sprints complete** | 13 of 14 |
| **Functional completeness** | ~93% of v1 scope |
| **Production readiness** | ~40% — no automated tests, no security audit, no prod infrastructure |
| **Blocking risk** | Secrets committed to `.env.example`; zero automated test coverage outside smart contracts |

> **Headline for review:** the product is functionally feature-complete against the Scope of Work
> and demonstrable end-to-end on Sepolia with real wallet-signed transactions. What stands between
> it and production is engineering hygiene — tests, secret management, security review, and
> deployment infrastructure — not missing features.

---

## 2. Sprint Overview

| Sprint | Focus | Status |
|---|---|---|
| Sprint 1 | Foundation, Monorepo & Auth | ✅ Done |
| Sprint 2 | Token Engine & Compliance Rule Engine | ✅ Done |
| Sprint 3 | KYC Workflow & Investor Portal | ✅ Done |
| Sprint 4 | Issuer Dashboard, Cap Table & Corporate Actions | ✅ Done |
| Sprint 5 | Smart Contracts & Blockchain Service | ✅ Done |
| Sprint 6 | Payments (Stripe) & Notifications | ✅ Done |
| Sprint 7 | Admin Console, Multi-Tenancy & Issuer Onboarding | ✅ Done |
| Sprint 8 | **ERC-3643 Testnet Go-Live (Sepolia)** | ✅ Done |
| Sprint 9 | **ONCHAINID & Claim-Based Identity Architecture** | ✅ Done |
| Sprint 10 | **Async Blockchain Pipeline & Chain↔DB Sync** | ✅ Done |
| Sprint 11 | **Advanced On-Chain Compliance Modules** | ✅ Done |
| Sprint 12 | **Issuer Portal Completion & Regulatory Operations** | ✅ Done |
| Sprint 13 | **Investor Portal Completion & Live Payments** | ✅ Done |
| Sprint 14 | Testing, Security Audit & Production Deployment | ⬜ Not started |
| Sprint 15+ | Post-Launch / Phase 2 (Marketplace, automated KYC) | ⬜ Backlog |

---

## 3. Architecture Snapshot (As Built)

> **Architectural change from the original plan:** the design called for 9 independent
> microservices. During Sprint 7 these were consolidated into a **single NestJS API** (commits
> `3484de8`, `dcb1945`) to cut operational overhead and eliminate cross-service DI/CORS problems.
> The only service that remains separate is `blockchain-service`. This is a deliberate and
> documented change — the sprint doc previously still claimed "9 microservices".

```
Assetro/
├── apps/
│   ├── api/                  Unified NestJS API — 11 feature modules, 19 controllers,
│   │                         41 services, 22 entities, 165 REST endpoints
│   ├── blockchain-service/   Standalone NestJS service — provider mgmt, deployer,
│   │                         contract interaction, event listener, gas estimator,
│   │                         transaction manager (5 endpoints)
│   ├── web-platform/         Next.js 14 App Router — investor (/) + issuer (/issuer)
│   └── web-admin/            Next.js 14 App Router — 10 routes
├── packages/                 shared-types, shared-utils, shared-constants
├── contracts/                75 Solidity files — full T-REX suite, Hardhat, 71 tests
├── database/                 11 SQL migrations, 3 seeds, tenant schema template fn
├── infrastructure/           docker-compose, nginx, Kubernetes base + ingress
└── docs/                     6 design documents (architecture, DB, contracts, API, FE)
```

**Backend stack:** NestJS 10, TypeORM (PostgreSQL), BullMQ + Redis, ethers.js v6, Stripe SDK,
Handlebars (email templates), Multer (uploads), JWT + Passport, bcrypt, TOTP (2FA).

**Frontend stack:** Next.js 14 (App Router), TailwindCSS, wagmi + viem, TanStack Query, Zustand,
sonner (toasts), lucide-react, Recharts.

**API modules:** `auth`, `tokens`, `compliance`, `kyc`, `identity`, `payments`, `notifications`,
`admin`, `issuer-leads`, `corporate-actions`, `transfers` (+ global `audit` module).

**Data model — 22 entities:**
`users`, `tokens`, `token_documents`, `cap_table`, `vesting_schedules`, `compliance_rules`,
`whitelists`, `kyc_submissions`, `kyc_documents`, `investor_profiles`, `investor_wallets`,
`investor_claims`, `issuer_investor_qualifications`, `token_required_claims`,
`onchain_identities`, `payments`, `notifications`, `corporate_actions`,
`corporate_action_votes`, `transfer_approvals`, `issuer_leads`, `tenants`
— plus platform-level `public.tenants`, `public.supported_chains`, `public.super_admins`.

**Roles (RBAC):** `investor`, `issuer`, `admin`, `compliance_officer`, `transfer_agent`.

---

## 4. Sprint 1: Foundation, Monorepo & Auth — ✅ DONE

### Goals
Project infrastructure, database, authentication, and application scaffolding.

### Tasks
- [x] 1.1 Initialize Turborepo monorepo with PNPM workspaces
- [x] 1.2 Shared packages (`@assetro/shared-types`, `shared-utils`, `shared-constants`)
- [x] 1.3 System architecture document (`docs/01-system-architecture.md`)
- [x] 1.4 Database schema design (`docs/02-database-schema.md`)
- [x] 1.5 API design document (`docs/04-api-design.md`)
- [x] 1.6 Smart contract architecture (`docs/03-smart-contract-architecture.md`)
- [x] 1.7 PostgreSQL with SQL migrations (`database/migrations/001–005`)
- [x] 1.8 Tenant schema template function (`create_tenant_schema`) — 12 tables per tenant
- [x] 1.9 Seeds: 5 supported chains, super admin, demo tenant
- [x] 1.10 Auth service
  - [x] Email/password registration with bcrypt (cost 12)
  - [x] JWT login (access + refresh tokens)
  - [x] Wallet login — Sign-In with Ethereum (nonce challenge → signature verify)
  - [x] 2FA (TOTP) enable / verify / disable
  - [x] Password reset flow (token + expiry)
  - [x] Email verification
  - [x] Change password (authenticated)
  - [x] 5-role RBAC with `@Roles()` decorator + `RolesGuard`
- [x] 1.11 API routing with global `/api/v1` prefix, CORS allowlist, global `ValidationPipe`
      (`whitelist`, `forbidNonWhitelisted`), `/health` endpoint, static `/api/v1/uploads`
- [x] 1.12 Scaffold 3 frontend apps (Investor, Issuer, Admin)
- [x] 1.13 Login pages wired to the real API with Zustand auth stores
- [x] 1.14 CI/CD pipelines (GitHub Actions: `ci.yml`, `cd-staging.yml`)
- [x] 1.15 Dockerfiles per service + `docker-compose.yml`
- [x] 1.16 Kubernetes base manifests (namespace, configmap, secrets, ingress, HPA)

### Deliverables — met
Working auth flow, 3 portals with login, multi-tenant DB schema, CI pipelines.

---

## 5. Sprint 2: Token Engine & Compliance Rule Engine — ✅ DONE

### Goals
Token creation, the compliance rule engine, and whitelist management.

### Tasks
- [x] 2.1 Token service
  - [x] Token CRUD with tenant scoping
  - [x] Token entity with all ERC-3643 fields (token / IR / compliance / CTR / TIR addresses)
  - [x] 10 asset types (equity, real_estate, fund, debt, commodity, utility, bond, art, infrastructure)
  - [x] Token deployment orchestration — **real, not a stub** (see Sprint 8)
  - [x] Token lifecycle: mint, burn, pause, unpause, freeze, unfreeze, batch mint
  - [x] Token logo upload at creation time
- [x] 2.2 Token creation wizard — 5 steps, fully API-integrated
  - [x] Step 1 Basic info · Step 2 Supply & distribution · Step 3 Compliance rules
  - [x] Step 4 Blockchain / chain selection · Step 5 Review & deploy
- [x] 2.3 Compliance service
  - [x] Compliance rule CRUD (create, list, get, update, delete, activate/deactivate)
  - [x] Rule engine — **11 rule types** (expanded from the planned 5, see Sprint 11)
  - [x] Transfer validation pre-check (`POST /compliance/check-transfer`)
  - [x] Whitelist management: add, remove, batch add, membership check, count
- [x] 2.4 Issuer portal ↔ Token API (list, create wizard, detail, compliance rules UI)
- [x] 2.5 Investor portal ↔ Token API (available tokens, token detail)
- [x] 2.6 Compliance rules in the creation flow (country restriction, investor limit,
      lock-in period, investor classification)
- [x] 2.7 Whitelist management UI (issuer) — view per token, add/remove, on-chain verification
      status column, one-click register from approved-investor list
- [x] 2.8 Transfer pre-check integration — issuer "Transfer Check" simulation page (655 lines)
      showing per-rule pass/fail with reasons

### Carried forward
- [ ] Batch whitelist CSV upload → **Sprint 14 backlog** (single + batch-by-selection exist;
      CSV file import does not)

### Deliverables — met
Issuers create tokens with compliance rules; investors browse tokens; whitelist and
transfer pre-checks operational.

---

## 6. Sprint 3: KYC Workflow & Investor Portal — ✅ DONE

### Goals
Manual KYC workflow (v1 — no third-party KYC provider) and investor portal features.

### Tasks
- [x] 3.1 KYC service
  - [x] KYC submission CRUD
  - [x] Document upload with MIME allowlist (jpeg/png/webp/pdf) and 10 MB cap
  - [x] Admin/issuer review workflow (approve / reject with notes)
  - [x] KYC statistics endpoint
  - [x] Document download URL generation
- [x] 3.2 KYC submission form (investor) — personal info, ID proof / address proof / selfie
      upload, client-side type & size validation, progress indicator, confirmation
- [x] 3.3 KYC status tracking — status badge, progress timeline, resubmission on rejection
- [x] 3.4 KYC review queue (issuer) — filterable list, detail view with document viewer,
      approve/reject with notes
- [x] 3.5 **Auto-whitelist on KYC approval — done and materially exceeded.**
      Approval now triggers an asynchronous 6-step blockchain pipeline (ONCHAINID deployment →
      claim issuance → IdentityRegistry registration → on-chain whitelist verification →
      chain→DB sync → notify). See Sprint 9 and Sprint 10.
- [x] 3.6 Investor portfolio dashboard
  - [x] Holdings summary from live API data
  - [x] Portfolio value calculation from token price × balance
  - [x] Holdings allocation chart from real tokens
  - [x] Holdings table with **on-chain `balanceOf` reads** via viem
- [x] 3.7 Transaction history — filterable list (type, date, token), block-explorer links
- [x] 3.8 Document vault — list, download, upload
- [x] 3.9 Investor profile & settings — edit profile, wallet connection management,
      notification preferences
- [x] 3.10 Reusable investor profile architecture (`investor_profiles`) — one KYC profile
      per investor, reused across every issuer instead of re-submitting per issuer
      (migration `008_reusable_identity_architecture.sql`)
- [x] 3.11 Per-issuer qualification model (`issuer_investor_qualifications`) — an investor
      requests qualification from each issuer; the issuer approves independently
- [x] 3.12 Multi-wallet support per investor (`investor_wallets`)

### Carried forward
- [ ] Bulk KYC approve → **Sprint 14 backlog**
- [ ] Investor-side change-password UI (backend endpoint exists; issuer portal has it) → Sprint 14
- [ ] Investor-side 2FA management UI (all backend endpoints exist) → Sprint 14
- [ ] Transaction CSV export → Sprint 14

### Deliverables — met
Complete KYC submit → review → approve → on-chain whitelist flow; investor portfolio on
live data; document management; profile settings.

---

## 7. Sprint 4: Issuer Dashboard, Cap Table & Corporate Actions — ✅ DONE

### Goals
Issuer management features, cap table, corporate actions, vesting, transfer approvals.

### Tasks
- [x] 4.1 Issuer dashboard on real data — investor count, tokens issued, pending KYC,
      recent activity, and a dedicated **Analytics page** (Sprint 12) with revenue-by-day,
      holders-by-day, payment-volume-by-day, revenue-by-token, investor breakdown,
      country breakdown — all from live SQL aggregates
- [x] 4.2 Cap table management
  - [x] View cap table per token (holders, balances, auto-recalculated percentages)
  - [x] CSV export
  - [x] **Sync from blockchain** — `balanceOf` per holder against the deployed contract
  - [x] Automatic cap-table update on payment completion
- [x] 4.3 Investor management (issuer) — list across tokens, investor detail with KYC status
      and documents, filter by status, search by name
- [x] 4.4 Token management actions — all wallet-signed from the issuer's MetaMask
  - [x] Mint to address (with on-chain `compliance.canTransfer` pre-check)
  - [x] Batch mint to multiple addresses
  - [x] Burn tokens
  - [x] Pause / unpause
  - [x] Freeze / unfreeze specific addresses
  - [x] Forced transfer (regulatory override)
  - [x] Address recovery (lost-wallet → new-wallet with ONCHAINID)
- [x] 4.5 Corporate actions — **full execution engine**, not a localStorage demo
  - [x] Dividend distribution (fiat payout list + CSV export, or token payout via `batchMint`)
  - [x] Stock split (ratio-based `batchMint` to all holders)
  - [x] Voting proposal with weighted tally and results view
  - [x] Buyback with investor sell-requests (submit / accept / reject / settle)
  - [x] Announcements
  - [x] Record date / payment date, lifecycle: draft → active → executing → completed / cancelled
- [x] 4.6 Vesting schedules
  - [x] Create schedule per beneficiary (total, start, end, cliff, interval, revocable)
  - [x] Linear vesting computation — vested / claimable / progress %
  - [x] Upcoming release projection (next 5 tranches)
  - [x] Issuer vesting management page + investor vesting view
  - [x] Manual release with on-chain mint (`markReleased`)
  - [x] Revoke / cancel schedule
- [x] 4.7 Transfer approvals
  - [x] `transfer_approvals` table + module
  - [x] Investor submits transfer request; issuer sees pending queue
  - [x] Approve / reject with notes; requester can cancel
  - [x] In-app notification to issuer on request and to investor on decision
  - [x] Issuer "Transfer Approvals" page per token; investor "My Requests" page
- [x] 4.8 Token document / data room per token (upload, list, download, delete)

### Carried forward
- [ ] Automated vesting release on schedule (cron/queue-driven) → Sprint 14
- [ ] Cap-table historical snapshots → Sprint 14
- [ ] Investor communication / announcement broadcast to investor inboxes → Sprint 14

### Deliverables — met
Full issuer dashboard on live data, cap table with on-chain sync and export, corporate
actions executing on-chain, vesting, transfer approvals.

---

## 8. Sprint 5: Smart Contracts & Blockchain Service — ✅ DONE

### Goals
Build and test the ERC-3643 contract suite; build the blockchain integration layer.

### Tasks
- [x] 5.1 Compile & test smart contracts
  - [x] Full T-REX suite — 75 Solidity files
  - [x] `Token`, `TokenStorage`, `IToken`
  - [x] Registries: `IdentityRegistry`, `IdentityRegistryStorage`, `ClaimTopicsRegistry`,
        `TrustedIssuersRegistry` (+ storage & interfaces)
  - [x] `ModularCompliance` + 12 modules + legacy compliance feature set
  - [x] `TREXFactory`, `TREXGateway`, `TREXImplementationAuthority`, `IAFactory`
  - [x] Proxy layer for every registry + token + compliance
  - [x] `AgentRole` / `AgentRoleUpgradeable` / `Roles`
  - [x] Hardhat compile clean
  - [x] **71 tests passing** (Token 30, Compliance 25, Factory 16)
- [x] 5.2 Deployment scripts — `deploy-factory`, `deploy-gateways`, `deploy-modules`,
      `deploy-token`, `deploy-demo-token`, `deploy-sepolia-full`, `setup-id-factory`,
      `verify-contracts`
- [x] 5.3 Blockchain service (`apps/blockchain-service`)
  - [x] Provider management per chain
  - [x] Contract deployer
  - [x] Contract interaction (mint, burn, pause, freeze)
  - [x] Event listener
  - [x] Transaction manager + `transactions` entity
  - [x] Gas estimator
  - [x] Endpoints: chains, chain status, transaction lookup, token balance, transfer
- [x] 5.4 Token service ↔ blockchain integration
  - [x] Deploy flow: `draft → deploying → active` with rollback to `draft` on failure
  - [x] Contract addresses persisted (token, IR, compliance, CTR, TIR)
  - [x] Lifecycle calls operating against live contracts
  - [x] `BLOCKCHAIN_MODE=local|live` switch for offline development
- [x] 5.5 Multi-chain configuration — 5 chains seeded (Ethereum Mainnet, Sepolia,
      Polygon Mainnet, Polygon Amoy, Bharat Blockchain) with RPC + explorer URLs
- [x] 5.6 Wallet integration (frontend)
  - [x] wagmi + viem + WalletConnect + MetaMask across issuer and investor portals
  - [x] Contract ABIs and bytecode bundled to the frontend (`lib/contracts/artifacts.ts`)
  - [x] Chain-switch enforcement, receipt waiting, human-readable revert parsing
  - [x] Block explorer links on transactions

### Carried forward
- [ ] Gas optimization report → Sprint 14
- [ ] Deploy to Polygon Amoy → Sprint 14
- [ ] Bharat Blockchain deployment & EVM-compatibility verification → Sprint 14
- [ ] Etherscan source verification of the deployed Sepolia suite → Sprint 14
- [ ] Consolidation debt: the unified API now calls chains directly via ethers.js, so
      `blockchain-service` is largely bypassed. Decide whether to retire it or route
      all chain traffic through it → Sprint 14

### Deliverables — met
Complete audited-standard T-REX implementation, 71 passing contract tests, deployment
scripts, blockchain integration layer, wallet-signed transactions from both portals.

---

## 9. Sprint 6: Payments (Stripe) & Notifications — ✅ DONE

### Goals
Fiat payment rails and the notification system.

### Tasks
- [x] 6.1 Payment service
  - [x] Stripe integration with **real test keys configured** (mock mode retained as a fallback
        when no key is present)
  - [x] Checkout session creation with line items, success/cancel URLs, metadata
  - [x] Webhook handler with raw-body signature verification —
        `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`
  - [x] Idempotency guard on webhook replay
  - [x] Payment history (investor), all payments (admin), payments by token (issuer)
  - [x] Payment status machine: pending → paid → completed / failed / cancelled / refunded
- [x] 6.2 Token purchase flow (fiat)
  - [x] Investor selects token → enters amount → price × amount → checkout
  - [x] **Compliance pre-check wired** — `TokenEligibilityService.canPurchase()` runs the
        on-chain IdentityRegistry check, claim check, and full compliance rule engine before
        a session is created
  - [x] Linked-wallet requirement enforced before purchase
  - [x] On payment success → payment marked `PAID` → issuer confirms → **on-chain mint from
        the issuer's own wallet** → tx hash recorded → payment `COMPLETED` → cap table synced
  - [x] Payment confirmation / cancel pages
- [x] 6.3 **Wire transfer / bank transfer rail** (added beyond original scope)
  - [x] Investor requests wire payment → reference number issued (`PAY-XXXXXXXXXXXX`)
  - [x] Wire instructions page
  - [x] Issuer confirms receipt → same mint pipeline as card payments
- [x] 6.4 Notification service
  - [x] In-app notifications (PostgreSQL) — create, list, mark read, mark all read, unread count
  - [x] 4 types (info/success/warning/error), 4 channels (in_app/email/sms/push), categories,
        JSONB metadata, tenant scoping
  - [x] Handlebars notification templates
  - [x] **Event-driven triggers wired for real events**: `payment.minted` on mint,
        transfer-approval request / approved / rejected, KYC and qualification events
- [x] 6.5 Notification UI — bell with live unread count, dropdown panel, mark as read /
      mark all read, preferences
- [x] 6.6 Audit logging on payments — `payment.created`, `payment.paid`, `payment.completed`

### Carried forward
- [ ] Real email delivery — `EmailService` currently logs to console instead of calling
      AWS SES. Templates and call sites exist; only the transport is stubbed. → **Sprint 14**
- [ ] PDF invoice / receipt generation & download → Sprint 14
- [ ] Crypto (stablecoin) payment rail → Sprint 15+

### Deliverables — met
Card and wire purchase flows with compliance gating, issuer-confirmed minting,
in-app notifications on real events, payment audit trail.

---

## 10. Sprint 7: Admin Console, Multi-Tenancy & Issuer Onboarding — ✅ DONE

### Goals
Platform administration and production-ready multi-tenancy.

### Tasks
- [x] 7.1 Admin service
  - [x] Tenant CRUD (create, list, get, update, activate/suspend)
  - [x] Tenant schema auto-creation (invokes `create_tenant_schema` SQL function)
  - [x] Platform analytics from live DB counts
  - [x] Audit log management (PostgreSQL-backed)
  - [x] Platform user management (list with filters, activate/suspend)
- [x] 7.2 Tenant onboarding flow
  - [x] Create tenant (name, slug, plan)
  - [x] Auto-create isolated database schema
  - [x] **Create initial issuer admin user** with generated temporary password + reset token
        (`POST /admin/tenants/:id/issuer`)
- [x] 7.3 Tenant management UI — list with status/plan/stats, detail page, activate/suspend
- [x] 7.4 Platform analytics dashboard — total tenants, users, tokens, transactions, payments,
      per-tenant stats
- [x] 7.5 Audit logging
  - [x] Global `AuditModule` injectable across every feature module
  - [x] Searchable audit log viewer with tenant / action / date-range filters
  - [x] Wired into auth, tokens, KYC, payments, compliance, admin actions
- [x] 7.6 Multi-tenant request routing
  - [x] Tenant resolution from `X-Tenant-ID` header, propagated through every service
  - [x] Tenant-scoped queries throughout (`tenantId` on tokens, payments, notifications,
        compliance rules, corporate actions)
- [x] 7.7 **Issuer lead capture & self-serve onboarding funnel** (added beyond original scope)
  - [x] Public issuer contact/apply page (`/contact`) → `POST /issuer-leads`
  - [x] Lead status lookup by ID
  - [x] Admin issuer-leads queue with stats and filters
  - [x] **Approve lead → transactional provisioning**: creates tenant + schema + issuer user +
        temp password + password-reset token in a single DB transaction
  - [x] Reject lead with reason

### Carried forward
- [ ] Tenant resolution from subdomain (header-based resolution works today) → Sprint 14
- [ ] Per-tenant rate limiting → Sprint 14
- [ ] Tenant plan upgrade / downgrade → Sprint 14
- [ ] Tenant branding (logo, theme colour) → Sprint 15+
- [ ] Supported-chains admin CRUD + chain health monitoring (chains are seeded via SQL today)
      → Sprint 14
- [ ] Platform settings persistence — the admin Settings page renders but **does not call any
      API and does not persist**. Needs a `platform_settings` table + endpoints. → Sprint 14
- [ ] Audit log CSV export → Sprint 14

### Deliverables — met
Admin onboards tenants manually or via the lead funnel, full audit trail, tenant-scoped
routing, platform analytics.

---

## 11. Sprint 8: ERC-3643 Testnet Go-Live (Sepolia) — ✅ DONE
> *Not in the original plan. Delivered after Sprint 7.*

### Goals
Take the T-REX suite from "compiles and tests pass" to "deployed and transacting on a public
testnet", with token deployment driven by the issuer's own wallet.

### Tasks
- [x] 8.1 Deploy T-REX implementation contracts to Sepolia
      (Token, CTR, IR, IRS, TIR, ModularCompliance implementations)
- [x] 8.2 Deploy `TREXImplementationAuthority` and `IAFactory`
- [x] 8.3 Deploy `TREXFactory` and bind it to the implementation authority
- [x] 8.4 Deploy ONCHAINID infrastructure — Identity implementation,
      `OIDImplementationAuthority`, `IdFactory`
- [x] 8.5 Deploy the platform `ClaimIssuer` contract
- [x] 8.6 Deploy `TREXGateway` and `OIDGateway`; configure deployer authorization
- [x] 8.7 Deploy all 9 compliance module templates on Sepolia
- [x] 8.8 Record every address in versioned deployment manifests
      (`contracts/deployments/*.json`) and in environment configuration
- [x] 8.9 Backend token deployment via `TREXGateway.deployTREXSuite()`
  - [x] Build `TokenDetails` (owner, name, symbol, decimals, IRS, ONCHAINID, IR agents,
        token agents, compliance modules + settings)
  - [x] Build `ClaimDetails` (required claim topics, trusted issuers, issuer→topic mapping)
  - [x] Gateway authorization pre-check (`isDeployer` / `getPublicDeploymentStatus`)
  - [x] Parse `TREXSuiteDeployed` event to extract all 5 deployed addresses
  - [x] Persist addresses and flip status to `active`; roll back to `draft` on failure
- [x] 8.10 Post-deploy registry configuration
  - [x] Register the platform ClaimIssuer as trusted in the token's `TrustedIssuersRegistry`
  - [x] Populate the token's `ClaimTopicsRegistry` with required topics
  - [x] Retroactively register every already-approved investor in the new token's IR
- [x] 8.11 **Issuer-wallet-signed deployment path** — the issuer portal can deploy the entire
      T-REX suite directly from MetaMask via `deployTREXSuite`, then hand the addresses back to
      the API (`POST /tokens/:id/sync-deployment`)
- [x] 8.12 Platform agent authorization — deployer EOA added to `irAgents` + `tokenAgents`;
      `isAgent` check surfaced in the issuer UI with an `addAgent` action
- [x] 8.13 On-chain state reads in the UI — `paused`, `totalSupply`, `balanceOf`, `isAgent`,
      `canTransfer`
- [x] 8.14 `POST /tokens/:id/sync-status` to reconcile pause state chain → DB

### Deliverables — met
A live ERC-3643 deployment pipeline on Sepolia. Issuers deploy real token suites; the platform
records and reconciles the resulting contract topology.

---

## 12. Sprint 9: ONCHAINID & Claim-Based Identity Architecture — ✅ DONE
> *Not in the original plan (partially foreshadowed by old task 5.6). Delivered after Sprint 7.*

### Goals
Implement the ERC-734/735 identity layer that makes ERC-3643 compliance actually enforceable:
one reusable on-chain identity per investor, signed KYC claims, and per-token registration.

### Tasks
- [x] 9.1 `identity` module — 8 services, 2 controllers, 11 endpoints
- [x] 9.2 ONCHAINID deployment service
  - [x] Deploy identity contracts via `IdFactory` (`createWithMgmtKeys` / factory ownership dance)
  - [x] Idempotent `getOrDeployIdentity` — reuse an existing identity if the wallet has one
  - [x] On-chain verification that the contract exists and the wallet holds a management key
  - [x] Extract identity address from the deployment receipt
- [x] 9.3 ERC-734 key management — management key, wallet (action) key, claim key, recovery key,
      with `keyHasPurpose` verification
- [x] 9.4 **Investor-wallet-signed identity deployment** — investor deploys their own ONCHAINID
      from MetaMask (`deployIdentityForWallet`) and authorizes the platform claim key
      (`addKey`) so the platform can issue claims without custody of the identity
- [x] 9.5 Claim issuance service
  - [x] 4 claim topics: `KYC` (1), `AML` (2), `ACCREDITED_INVESTOR` (3),
        `COUNTRY_OF_RESIDENCE` (4)
  - [x] ECDSA claim signing by the platform ClaimIssuer key
  - [x] `addClaim` onto the investor's identity contract
  - [x] Post-issuance verification: claim exists, signature valid, issuer trusted
- [x] 9.6 `IdentityRegistry` service — `registerIdentity(wallet, identity, country)` per token,
      `isVerified()` as the authoritative whitelist, deletion on revocation
- [x] 9.7 `TrustedIssuersRegistry` service — add/remove trusted issuers with topic scoping
- [x] 9.8 `ClaimTopicsRegistry` service — required-topic setup per token
- [x] 9.9 ISO-3166 numeric country code mapping (14 jurisdictions) for on-chain registration
- [x] 9.10 Data model
  - [x] `onchain_identities` — identity address, deployment tx, chain, claim topics issued,
        claim IDs, registered token IDs, sync status
  - [x] `investor_claims` — DB mirror of on-chain claims with claim ID, claim data, signature
        validity, issuer trust, revocation, chain-sync timestamp
  - [x] `token_required_claims` — which claim topics a given token demands
  - [x] Migrations `006`, `008`, `009`, `011`
- [x] 9.11 Layered eligibility engine
  - [x] `InvestorEligibilityService` — issuer qualification → required claims → on-chain
        registration, each with explicit reasons
  - [x] `TokenEligibilityService.canPurchase()` / `canPurchaseByWallet()` — combines the
        on-chain IR check with the full compliance rule engine
  - [x] Endpoints: `/kyc/eligibility/:tokenId`, `/tokens/:tokenId/claims-check`,
        `/tokens/:tokenId/onchain-check`, `/tokens/:tokenId/can-receive`
- [x] 9.12 **Mint is gated on identity** — `TokenLifecycleService.mint()` refuses to mint to a
      wallet that is not `isVerified()` in the token's IdentityRegistry, and returns the exact
      failing reasons
- [x] 9.13 Investor "ONCHAINID Identity" page — identity address, deployment status, issued
      claims with topics, registered tokens
- [x] 9.14 Issuer visibility — identity contract address and claim status on the qualification
      review screen

### Deliverables — met
A working reusable-identity architecture: one ONCHAINID per investor, signed claims verifiable
on-chain, per-token registration, and identity-gated minting and transfers.

---

## 13. Sprint 10: Async Blockchain Pipeline & Chain↔DB Sync — ✅ DONE
> *Not in the original plan. Delivered after Sprint 7.*

### Goals
Make the identity/whitelist pipeline reliable and asynchronous, and guarantee that the database
never disagrees with the chain.

### Tasks
- [x] 10.1 Redis + BullMQ wired into the API (`BullModule.forRootAsync`)
- [x] 10.2 `investor-qualification` queue + worker (concurrency 2)
  - [x] 5 retry attempts with exponential backoff (10s → 160s)
  - [x] Completed jobs retained 7 days; failed jobs retained for debugging
  - [x] Job progress reporting (10% → 95%)
- [x] 10.3 Six-step qualification pipeline, each step tracked in the DB
      (`blockchain_status`, `blockchain_job_id`, `blockchain_error`, `blockchain_completed_at`
      — migration `010`)
  1. Deploy ONCHAINID (idempotent)
  2. Issue KYC / AML / accreditation claims (reuse if already issued)
  3. Register identity in every one of the issuer's tokens
  4. Verify `IR.isVerified()` — the authoritative whitelist assertion
  5. Sync DB from chain (claims + whitelist, chain wins)
  6. Notify
- [x] 10.4 Deferred-execution handling — if the investor has no wallet linked, the pipeline
      parks as `deferred:no_wallet` and auto-resumes when the wallet is linked
      (`triggerDeferredForInvestor`)
- [x] 10.5 Manual retry endpoint (`POST /kyc/qualifications/:id/retry-pipeline`) with
      role checks
- [x] 10.6 `BlockchainSyncService` — chain is the source of truth
  - [x] `syncClaims()` — read claims back off-chain, re-verify signature and issuer trust,
        write claim IDs and sync timestamps
  - [x] `syncWhitelistEntry()` — read `IR.isVerified()` and upsert the whitelist row
  - [x] `syncAllForInvestor()` / `syncAllForWallet()` — full reconciliation
  - [x] `readIdentityOnChain()` / `readVerificationOnChain()` — pure reads, no writes
- [x] 10.7 `ContractEventListenerService` — real-time EVM event indexer
  - [x] `IdentityRegistry`: `IdentityRegistered`, `IdentityRemoved`
  - [x] `ONCHAINID`: `ClaimAdded`, `ClaimRemoved`
  - [x] `OIDGateway`: `WalletLinked`
  - [x] Auto-discovers newly deployed tokens and identities every 5 minutes
  - [x] Clean subscribe/unsubscribe on application bootstrap/shutdown
  - [x] Fallback direct DB write if a chain re-read fails
- [x] 10.8 On-chain verification columns on `whitelists` — `verified_on_chain`,
      `verification_tx_hash`, `ir_address`, `country_code`, `chain_synced_at` (migration `011`)
- [x] 10.9 Pipeline status surfaced in the issuer UI with a retry action

### Deliverables — met
Approvals no longer block on chain latency; failures retry automatically; the DB mirror is
continuously reconciled against on-chain state by both the pipeline and a live event indexer.

---

## 14. Sprint 11: Advanced On-Chain Compliance Modules — ✅ DONE
> *Not in the original plan (old task 5.7 covered 2 modules). Delivered after Sprint 7.*

### Goals
Expand compliance from 5 off-chain rules to 11 rule types with matching on-chain enforcement
modules, deployable and bindable by the issuer.

### Tasks
- [x] 11.1 Nine compliance modules implemented, tested and deployed to Sepolia
  - [x] `CountryRestrictModule` — jurisdiction blocking (ISO numeric)
  - [x] `MaxHolderModule` — cap on holder count
  - [x] `TransferWindowModule` — trading windows / blackout periods
  - [x] `SupplyLimitModule` — hard supply cap
  - [x] `MaxBalanceModule` — per-wallet balance cap
  - [x] `DayMonthLimitsModule` — rolling 24h / 30d volume limits
  - [x] `ExchangeMonthlyLimitsModule` — monthly deposit cap to registered exchanges
  - [x] `TransferFeeModule` — basis-point fee to a collector address
  - [x] `SenderWhitelistModule` — approved-sender allowlist
- [x] 11.2 `ModularCompliance` + `AbstractModule` / `AbstractModuleUpgradeable` +
      `ModuleProxy` infrastructure
- [x] 11.3 Off-chain rule engine expanded to 11 evaluators, each returning a
      human-readable pass/fail reason
- [x] 11.4 Module binding at deployment — `complianceModules[]` + ABI-encoded
      `complianceSettings[]` passed into `deployTREXSuite`
- [x] 11.5 **Post-deployment module lifecycle from the issuer's wallet** — the compliance page
      deploys a module contract, calls `addModule` on the token's `ModularCompliance`, applies
      its settings, and can `removeModule` on rule deletion or deactivation
- [x] 11.6 `enforcement: onchain | offchain` marker per rule so the UI is explicit about which
      rules are contract-enforced and which are advisory
- [x] 11.7 On-chain `canTransfer()` pre-flight before every mint and batch mint, with a
      422 response naming the likely blocking module
- [x] 11.8 Compliance simulation UI — issuer "Transfer Check" page evaluates a hypothetical
      transfer against all rules and shows per-rule verdicts and fee computation
- [x] 11.9 Transfer fee computation surfaced to the caller (fee bps, fee amount, net amount,
      collector)

### Carried forward
- [ ] `investor_class` and `transfer_restriction` have no matching on-chain module in the
      current suite and remain off-chain-only — either build the modules or document the
      limitation formally for the compliance sign-off → Sprint 14

### Deliverables — met
11 compliance rule types, 9 deployed on-chain modules, issuer-driven module deployment and
binding, and a simulation tool that explains every verdict.

---

## 15. Sprint 12: Issuer Portal Completion & Regulatory Operations — ✅ DONE
> *Not in the original plan. Delivered after Sprint 7.*

### Goals
Close every remaining gap in the issuer portal and add the regulatory operations a transfer
agent needs.

### Tasks
- [x] 12.1 Force transfer — court-order / regulatory override via `forcedTransfer`, recorded
      through the API
- [x] 12.2 Token recovery — lost wallet → new wallet using the investor's ONCHAINID
      (`recoveryAddress`), with identity lookup from the UI
- [x] 12.3 Vesting schedule management page — create, list, monitor progress, release, revoke
- [x] 12.4 Corporate actions full execution — dividend (fiat + token), stock split, voting
      finalization, buyback settlement, announcements; per-action detail page; dividend CSV export
- [x] 12.5 Analytics page on live data — 7 aggregate endpoints
      (`overview`, `revenue-by-day`, `holders-by-day`, `payment-volume-by-day`,
      `revenue-by-token`, `investor-breakdown`, `country-breakdown`)
- [x] 12.6 Token document / data room per token — upload, list, download, delete
- [x] 12.7 Transfer approvals queue per token
- [x] 12.8 Payments-by-token view with wire confirmation and mint completion
- [x] 12.9 Qualification review workflow — list, filters, stats, detail with documents,
      approve/reject, pipeline status, retry
- [x] 12.10 Approved-investor directory with wallet and identity addresses, feeding one-click
      IR registration
- [x] 12.11 Token logo upload and display
- [x] 12.12 Issuer settings — profile, company info, notification preferences, change password
- [x] 12.13 Public issuer marketing/apply page

### Deliverables — met
Issuer portal complete: 24 routes, every token lifecycle and regulatory operation available,
all wallet-signed, all reconciled to the API.

---

## 16. Sprint 13: Investor Portal Completion & Live Payments — ✅ DONE
> *Not in the original plan. Delivered after Sprint 7.*

### Goals
Close every remaining gap in the investor portal and deliver compliant peer-to-peer transfer —
originally deferred to Phase 2.

### Tasks
- [x] 13.1 **Compliant P2P token transfer** (originally Sprint 9+/Phase 2 scope)
  - [x] Select holding → recipient → amount
  - [x] Compliance pre-check via `POST /compliance/check-transfer` with per-rule verdicts
  - [x] Wallet-signed `transfer()` from the investor's own MetaMask
  - [x] Transaction status and block explorer link
  - [x] Transfer history
- [x] 13.2 Transfer approval requests — submit, track status, cancel
- [x] 13.3 On-chain balance reading — `balanceOf` and `decimals` read directly from the token
      contract, displayed alongside DB positions
- [x] 13.4 Portfolio page — positions, valuation, allocation chart, per-token position endpoint
- [x] 13.5 Vesting view — schedules, vested / claimable amounts, progress, upcoming releases
- [x] 13.6 ONCHAINID identity page — identity, claims, registered tokens
- [x] 13.7 KYC page rework — profile submission, document upload, wallet linking,
      per-issuer qualification requests, deploy-ONCHAINID button,
      authorize-platform-claim-key button
- [x] 13.8 Stripe checkout end-to-end with real test keys; success and cancel pages
- [x] 13.9 Wire transfer request + instructions page
- [x] 13.10 Portfolio auto-refresh after a successful mint
- [x] 13.11 Document vault and transaction history
- [x] 13.12 Settings — profile, wallet management, notification preferences

### Carried forward
- [ ] Investor-facing corporate actions UI — the backend supports `castVote`, voting results,
      and buyback sell-requests, but there is **no investor page to use them**. Investors
      currently cannot vote or tender shares. → **Sprint 14 (highest-value gap)**
- [ ] Automated vesting claim (currently an alert telling the investor to contact the issuer)
- [ ] Change password, 2FA management, transaction CSV export (backends exist)

### Deliverables — met
Investor portal complete: 21 routes, compliant wallet-signed P2P transfer, on-chain balances,
live payments, identity self-service.

---

## 17. Sprint 14: Testing, Security Audit & Production Deployment — ⬜ NOT STARTED

### Goals
Comprehensive testing, security hardening, and production deployment. **This is the gate to
production.**

### 14.1 Critical fixes (do these first)
- [ ] **Rotate and purge all committed secrets.** `.env.example` currently contains a real
      deployer private key, the ClaimIssuer private key, a live Stripe test secret key, a Stripe
      webhook secret, an Alchemy API key, and a WalletConnect project ID. Rotate every one,
      scrub git history, and replace with placeholders.
- [ ] **Fix `S3UploadService`** — it writes to a hardcoded absolute macOS path
      (`/Users/hitendrasinhchauhan/Documents/Hiten/Assetro/uploads`), so KYC and investor-profile
      document uploads fail on any other machine. It also returns `localhost:3040` URLs while
      the API serves uploads from `/api/v1/uploads` on port 3000. Replace with real S3
      (`@aws-sdk/client-s3` + presigned URLs), matching the pattern already used correctly in
      `TokenDocumentService`.
- [ ] **Add the missing `POST /blockchain/deploy-approval` endpoint.** The investor
      `DeployOnchainIdButton` calls it twice; it does not exist in the API, so identity
      deployment approval silently fails.
- [ ] **Fix `TransferApprovalService.requestTransfer`** — it reads
      `(token as any).contractAddress`, which is not a field on the `Token` entity (the field is
      `tokenAddress`), so `tokenAddress` on every transfer approval is always `null`.
- [ ] **Disable `TypeORM synchronize: true`** and move all schema changes to reviewed
      migrations. Auto-sync against a production database is a data-loss risk.
- [ ] Persist the admin platform-settings page (currently pure local UI state, no API).

### 14.2 Unit tests
- [ ] Auth service (register, login, JWT, refresh, wallet login, 2FA, password reset)
- [ ] Token service (CRUD, status transitions, tenant scoping)
- [ ] Compliance rule engine — all 11 evaluators, pass and fail paths
- [ ] KYC + qualification services (submission, review, pipeline enqueue)
- [ ] Identity services (deployment idempotency, claim signing, IR registration)
- [ ] Payment service (checkout, webhook idempotency, wire, completion, cap-table sync)
- [ ] Vesting math (linear vesting, cliff, upcoming releases)
- [ ] Corporate actions (dividend, split ratio validation, vote tally, buyback)

### 14.3 Integration tests
- [ ] End-to-end auth flow
- [ ] Token create → deploy → mint → cap table
- [ ] KYC submit → qualify → approve → ONCHAINID → claims → IR register → whitelist
- [ ] Payment → issuer confirm → mint → cap table → notification
- [ ] Transfer with compliance checks (allowed and blocked)
- [ ] Transfer approval request → approve → execute
- [ ] Tenant provisioning from issuer lead approval
- [ ] BullMQ pipeline retry and `deferred:no_wallet` resume

### 14.4 Smart contract tests
- [x] `Token.test.ts` — 30 tests passing
- [x] `Compliance.test.ts` — 25 tests passing
- [x] `Factory.test.ts` — 16 tests passing
- [ ] Test coverage for the 9 deployed compliance modules individually
- [ ] Edge cases and attack vectors (reentrancy, access control, upgrade paths)
- [ ] Gas optimization report
- [ ] Coverage report (`solidity-coverage`)

### 14.5 Frontend tests
- [ ] Component tests (Vitest + React Testing Library)
- [ ] Login / register flows
- [ ] Token creation wizard (all 5 steps + validation)
- [ ] KYC form validation
- [ ] Compliance rule builder
- [ ] Wallet interaction mocking (wagmi test connector)

### 14.6 Security audit
- [ ] Smart contract audit — internal, then external
- [ ] OWASP Top 10 checklist
- [ ] Penetration testing
- [ ] JWT security review (expiry, rotation, refresh reuse detection)
- [ ] Private key handling review — the backend currently holds the deployer and ClaimIssuer
      keys in environment variables; evaluate KMS / HSM signing
- [ ] SQL injection review (raw `createQueryBuilder` string interpolation in the rule engine
      and analytics services)
- [ ] XSS / CSRF review
- [ ] Multi-tenant isolation review — verify no cross-tenant data leakage via `X-Tenant-ID`
      spoofing; bind tenant to the JWT rather than trusting the header
- [ ] File upload security (MIME sniffing, path traversal, malware scanning)

### 14.7 Security hardening
- [ ] Helmet.js HTTP security headers
- [ ] Rate limiting (global + per-tenant + per-endpoint)
- [ ] CORS configuration review for production origins
- [ ] Secrets management (AWS Secrets Manager / Parameter Store)
- [ ] Database encryption at rest + TLS in transit
- [ ] S3 bucket policies, private-by-default, presigned-URL-only access
- [ ] Tenant-scoped JWT validation
- [ ] Audit-log immutability (append-only, no update/delete path)

### 14.8 Performance testing
- [ ] Load testing (k6 or Artillery)
- [ ] Database query optimization + index review (analytics endpoints do full-table aggregates)
- [ ] N+1 query elimination (`getApprovedInvestorsWithWallets`, `whitelistForNewToken`,
      and the vesting/portfolio enrichers all query per row in a loop)
- [ ] API response time benchmarks
- [ ] Frontend Lighthouse scores
- [ ] RPC call budgeting and caching (on-chain reads are currently uncached)

### 14.9 Production infrastructure
- [ ] Terraform modules (VPC, EKS, RDS, ElastiCache, S3, CloudFront)
- [ ] Kubernetes production manifests — current manifests only cover a legacy `api-gateway`
      service that no longer exists; the unified `api`, `blockchain-service`, and the three
      web apps have no manifests
- [ ] Auto-scaling (HPA) for the unified API and web apps
- [ ] Redis/BullMQ production configuration + dead-letter handling
- [ ] Monitoring (Prometheus + Grafana), including queue depth and RPC error rate
- [ ] Alerting rules (failed pipelines, webhook failures, chain-sync drift)
- [ ] Log aggregation (CloudWatch / ELK)
- [ ] Backup & restore runbook for PostgreSQL and uploaded documents

### 14.10 Deployment & remaining chains
- [ ] Deploy to staging; smoke tests
- [ ] Deploy to production; DNS, SSL, CDN
- [ ] Deploy the T-REX suite to **Polygon Amoy** and verify on Polygonscan
- [ ] Deploy to **Bharat Blockchain** and verify EVM compatibility
- [ ] Verify the Sepolia contract suite on Etherscan
- [ ] Decide the fate of `blockchain-service` (retire, or route all chain traffic through it)

### 14.11 Documentation
- [ ] API documentation — Swagger/OpenAPI is **not currently wired up** despite 165 endpoints
- [ ] Postman collection
- [ ] Deployment guide (update `DEPLOY.md` for the unified-API architecture)
- [ ] Operations runbook
- [ ] User guides (Investor, Issuer, Admin)
- [ ] Compliance documentation — which rules are on-chain-enforced vs advisory

### 14.12 Deferred feature backlog (small, user-visible)
- [ ] Investor corporate-actions UI (voting + buyback tender) — backend ready
- [ ] Real email delivery via SES — templates and call sites ready
- [ ] PDF receipt / invoice generation
- [ ] Investor change-password and 2FA management UI — backends ready
- [ ] Transaction CSV export
- [ ] Batch whitelist CSV upload
- [ ] Bulk KYC approve
- [ ] Automated vesting release (cron/queue)
- [ ] Cap-table historical snapshots
- [ ] Subdomain-based tenant resolution
- [ ] Supported-chains admin CRUD + chain health monitoring
- [ ] Tenant plan upgrade/downgrade
- [ ] Audit log CSV export

### Deliverables
All tests passing, security audit report, production deployment on AWS, complete documentation.

---

## 18. Sprint 15+: Post-Launch / Phase 2 — ⬜ BACKLOG

### Marketplace & Secondary Trading
> Note: compliant wallet-to-wallet P2P transfer was pulled forward and **delivered in Sprint 13**.
- [ ] Order book / matching engine
- [ ] OTC deal module
- [ ] Regulated ATS / exchange integration
- [ ] Secondary market UI

### Advanced Features
- [ ] Automated KYC (Onfido / Sumsub / Hyperverge)
- [ ] Gas abstraction (meta-transactions / paymaster)
- [ ] Multi-sig wallet support (Safe)
- [ ] Crypto / stablecoin payment rail
- [ ] Advanced analytics & regulatory reporting
- [ ] Mobile app (React Native)
- [ ] Outbound webhooks for external systems
- [ ] White-label theming per tenant
- [ ] Multi-language support (i18n)
- [ ] Hyperledger / permissioned chain support

---

## 19. Appendix A — Sepolia Deployment Registry

Deployed by `0x64D2E12ACAFBfD3c0BFf5fbcCdbcA4b242FF49C1` on chain `11155111`.
Source of truth: `contracts/deployments/*.json`.

### T-REX Infrastructure
| Contract | Address |
|---|---|
| TREXFactory | `0x2c50461DF40dCb5B77FfD13BC8685F76f3598dc4` |
| TREXGateway | `0xE38B7f92768329bA633D6bcF36f393e7818D9f08` |
| TREXImplementationAuthority | `0xCb4bfd22B881df13788855c335372F3A83E043cD` |
| IAFactory | `0x4a9C9482Ae085fE0d73E809dcDC79f9Ed0d618A1` |

### Implementations
| Contract | Address |
|---|---|
| Token | `0xB2f405790d9d2235512ed021010749319AfEb1Df` |
| ClaimTopicsRegistry | `0xe712B2e9E303912B96a56d66B0186C81399c81a7` |
| IdentityRegistry | `0x0a1DA278c30946Dfb3d004D3A23A52cC64b6b95a` |
| IdentityRegistryStorage | `0x5A8549c423659E0aE7016bF6F0A1aD8233f3f682` |
| TrustedIssuersRegistry | `0x9Ee0ac40A03096cf080bc84E5030C144D3a17367` |
| ModularCompliance | `0xcFEa39D4e1677f44DA180A6f81DC8A4Dd9eB297F` |

### ONCHAINID Infrastructure
| Contract | Address |
|---|---|
| Identity implementation | `0xf264456D456463B85f37b8eB0caE90262Ea7E51A` |
| OIDImplementationAuthority | `0x3e5ac3F79eBADf6D163011Ca9698d0Ff0AF33D4f` |
| IdFactory | `0x426E98F361B3CD424665eab7D81CccdF9fc1fe14` |
| OIDGateway | `0xd5C978F7227763572d6f13826CEa12B8b3b0470F` |
| Platform ClaimIssuer | `0x02887aD383894049Ff9437E28296510C1785407a` |

### Compliance Modules
| Module | Address |
|---|---|
| CountryRestrictModule | `0x29993098e42260a5c67FF15A9eF6f1Be83b2ec15` |
| MaxHolderModule | `0x37Ecb58Ca547D5Efe3E545Fd0B34700a4a49f493` |
| TransferWindowModule | `0xAa441712692AF06065b78B4674819BD66A11FE19` |
| SupplyLimitModule | `0xd9A16eC53545B517B1e97432b5AcBa3e2eE54cDA` |
| MaxBalanceModule | `0x87DC2c7f2726b1E4aA852d303342Ce11D8C5aA0b` |
| DayMonthLimitsModule | `0x6CdFa754678Ef42abc1Dc945420108CF2413906e` |
| ExchangeMonthlyLimitsModule | `0xEC8f99124c6B38922FC803542284535204f0F9A5` |
| TransferFeeModule | `0xaAE9d6325877d694731b308B7645C02CAAD0689a` |
| SenderWhitelistModule | `0xFcb21c52981E6c57A03B5e09b769B203f73850B0` |

---

## 20. Appendix B — Known Gaps & Technical Debt Register

| # | Item | Severity | Impact | Target |
|---|---|---|---|---|
| 1 | Real secrets committed in `.env.example` (deployer + ClaimIssuer private keys, Stripe secret & webhook secret, Alchemy key) | **Critical** | Anyone with repo access controls the platform's on-chain signer and can issue claims | 14.1 |
| 2 | `S3UploadService` hardcodes an absolute macOS path; no real S3 | **Critical** | KYC and profile document uploads fail outside one developer's machine | 14.1 |
| 3 | Zero automated tests outside smart contracts (0 backend, 0 frontend) | **Critical** | No regression safety net on 165 endpoints and 51 pages | 14.2–14.5 |
| 4 | `TypeORM synchronize: true` enabled | **High** | Schema drift / data loss risk in production | 14.1 |
| 5 | `POST /blockchain/deploy-approval` called by the frontend but does not exist | **High** | Investor ONCHAINID deployment approval silently fails | 14.1 |
| 6 | Tenant identity taken from the `X-Tenant-ID` header, not the JWT | **High** | Potential cross-tenant data access by header spoofing | 14.6 |
| 7 | Backend holds deployer + ClaimIssuer private keys in env vars | **High** | Single compromised host = full on-chain control | 14.6 |
| 8 | No Helmet, no rate limiting | **High** | Brute force / header attacks | 14.7 |
| 9 | Email delivery is a console-log stub | **Medium** | No investor/issuer email notifications reach anyone | 14.12 |
| 10 | Investor corporate-actions UI missing (voting, buyback tender) | **Medium** | Investors cannot exercise governance rights the backend already supports | 14.12 |
| 11 | Admin platform-settings page does not persist | **Medium** | Feature appears functional but is inert | 14.1 |
| 12 | K8s manifests target a `api-gateway` service that no longer exists | **Medium** | Cannot deploy the current architecture as-is | 14.9 |
| 13 | No Swagger/OpenAPI despite 165 endpoints | **Medium** | Blocks integration partners and the Postman deliverable | 14.11 |
| 14 | `blockchain-service` largely bypassed by direct ethers calls in the API | **Medium** | Duplicated chain logic, ambiguous ownership | 14.10 |
| 15 | `TransferApproval.tokenAddress` always `null` (wrong field name) | **Low** | Missing data on approval records | 14.1 |
| 16 | N+1 query loops in qualification, whitelist, vesting, portfolio paths | **Low** | Degrades at scale | 14.8 |
| 17 | `investor_class` / `transfer_restriction` rules are off-chain-only | **Low** | Advisory rather than enforced — must be documented for compliance sign-off | 11 / 14.11 |
| 18 | Only Sepolia deployed; Polygon Amoy and Bharat Blockchain pending | **Low** | Multi-chain claim in the SoW not yet demonstrated | 14.10 |
| 19 | Sepolia contracts not verified on Etherscan | **Low** | Reduces third-party auditability | 14.10 |
| 20 | Automated vesting release is manual | **Low** | Operational overhead for issuers | 14.12 |

---

## 21. Appendix C — Delivery Metrics

| Metric | Value |
|---|---|
| Sprints planned originally | 8 |
| Sprints actually delivered | 13 (+ 1 remaining) |
| Backend services | 2 (unified `api` + `blockchain-service`) — consolidated from 9 microservices |
| API feature modules | 11 |
| REST endpoints | 165 (API) + 5 (blockchain-service) |
| Controllers / Services / Entities | 19 / 41 / 22 |
| Frontend apps | 3 portals, 51 routes |
| Frontend LOC (pages/components) | ~22,900 |
| Solidity files | 75 |
| Compliance modules deployed | 9 |
| Compliance rule types | 11 |
| Claim topics | 4 (KYC, AML, Accredited Investor, Country) |
| Smart contract tests | 71 passing |
| Backend / frontend tests | 0 |
| SQL migrations | 11 (+ 3 seeds + tenant schema template) |
| Database tables | 22 entity tables + 3 platform tables |
| Supported chains configured | 5 (Ethereum, Sepolia, Polygon, Polygon Amoy, Bharat) |
| Chains live | 1 (Sepolia) |
| User roles | 5 |
| Async job pipelines | 1 (investor qualification, 6 steps, 5 retries) |
| Contract event listeners | 5 event types across 3 contract families |

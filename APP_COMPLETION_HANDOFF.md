# Bodija Value Card - Completion Handoff

This document is the implementation brief for any AI or engineer continuing the
project. The target is a production-ready platform, with the 50-100 resident
pilot delivered first.

## 1. Non-negotiable project decisions

- Do not use Docker. Development and deployment use Node.js, Render, and Neon.
- Keep these as separate applications that share one Neon PostgreSQL database:
  - Resident, merchant, and BERA admin web app: `apps/web`
  - Main NestJS API: `apps/api`
  - SIGAR Bodija Community security app: `apps/security`
- Do not modify `C:\Users\User\Documents\Police surv`. The security app in this
  repository is an independent copy.
- Keep the visual direction brownish gold and blue.
- Payments are outside the MVP. Rewards are promotional value, not cash.
- Security and merchant verification must reveal only minimum resident data.
- Every resident, merchant, offer, renewal, and suspension requires a clear BERA
  approval state and audit trail.

## 2. Current technology and deployment shape

- Monorepo using npm workspaces.
- React 19, TypeScript, Vite, Lucide icons, and `react-qr-code` in `apps/web`.
- NestJS 11, Prisma, PostgreSQL, Passport JWT, class-validator, and bcrypt in
  `apps/api`.
- React, Express, Socket.IO, and `pg` in `apps/security`.
- Neon is the shared production database.
- `render.yaml` defines three Render services:
  - `bodija-value-card-api`
  - `bodija-value-card-web`
  - `sigar-bodija-community`

## 3. What already works

### Resident and card

- Resident registration with consent, name, phone, optional email, cluster,
  category, and password.
- Passwords are hashed with bcrypt.
- Resident login and seven-day JWT session recovery.
- Unique membership number and random QR token generation.
- New cards start as `PENDING_VERIFICATION`.
- Resident dashboard reads authenticated identity and card information.
- Active and pending card states, issue date, expiry date, and QR display.
- Responsive resident login and registration screens.

### BERA administration

- Admin login at `/admin`.
- Seeded admin email: `gisknigeria@gmail.com`.
- Protected admin API with role checks.
- Resident search and status filters.
- Resident approval, rejection, and suspension controls.
- Approval activates the card and sets one-year validity.
- Rejection disables activation; suspension sets the card to suspended.

### SIGAR security

- Separate SIGAR Bodija Community app copied from Police Surv.
- Existing incidents, officers, GPS, cameras, maps, chat, analytics, and PWA
  functionality remains present in the copy.
- Gate scanner accepts QR token or membership ID.
- Scanner reads resident and card data from the same Neon database.
- Scanner exposes only name, membership ID, cluster, category, status, and expiry.
- Entry and exit decisions are recorded in `security_access_events`.
- Pending, suspended, and expired cards are denied.
- End-to-end test proves: pending card denied, admin approval succeeds, same card
  allowed, and temporary test resident removed.
- Access Point users now get a dedicated gate-focused experience with no map,
  QR scan support, visitor-pass verification, automatic GPS sharing, camera
  sharing, walk-in guest logging, merchant notification, and exit-code
  verification.
- Merchant users can now receive walk-in notifications from the security gate,
  acknowledge them, and receive a generated exit code for the guest.

### Existing data model

Prisma already models users, residents, dependants, cards, merchants, merchant
users, offers, transactions, reward balances, renewals, complaints, and
verification scans. Extend these models through migrations; do not replace the
schema or create a second resident/card database.

## 4. Immediate security work - P0

- [ ] Remove all visible demo passwords and credentials from production UI.
- [ ] Change the local seeded admin password before deployment.
- [ ] Require `ADMIN_INITIAL_PASSWORD` in production instead of using a fallback.
- [ ] Change SIGAR defaults `admin@command.local` / `admin123` before deployment.
- [ ] Add change-password flows for residents, merchants, BERA admins, and SIGAR
  staff.
- [ ] Add forgot-password and reset-password flow using short-lived, single-use
  tokens. Connect a real email provider.
- [ ] Add login rate limiting, temporary lockout, and generic authentication
  errors to reduce account enumeration.
- [ ] Validate and normalize Nigerian/international phone numbers consistently.
- [ ] Add email verification and phone verification where operationally possible.
- [ ] Decide between secure HttpOnly cookies and bearer tokens. If bearer tokens
  remain, document XSS risk, shorten token lifetime, add refresh-token rotation,
  and implement logout/revocation.
- [ ] Add Helmet/security headers, request size limits, strict production CORS,
  and trusted proxy configuration.
- [ ] Add authorization guards to every non-public endpoint. The current public
  verification endpoint must not permit anonymous sensitive lookups.
- [ ] Validate admin query parameters and reject invalid enum/status values.
- [ ] Add immutable audit records for admin approvals, rejections, suspensions,
  renewals, offer changes, and account changes. Record actor, action, target,
  timestamp, previous value, new value, and optional reason.
- [ ] Never log passwords, JWTs, database URLs, QR tokens, or sensitive resident
  payloads.
- [ ] Perform a privacy/legal review covering consent, retention, deletion,
  breach response, staff access, and Nigerian data-protection obligations.

## 5. Resident experience - P1

### Profile and identity

- [ ] Add resident profile view and edit flow.
- [ ] Decide which profile changes require re-approval.
- [ ] Add profile photo if BERA requires visual gate confirmation.
- [ ] Add optional identity/residency evidence upload with private object storage;
  never store uploaded files directly in PostgreSQL or expose public URLs.
- [ ] Add admin document review and deletion/retention rules.
- [ ] Add clear approval timeline and rejection reason in the resident portal.
- [ ] Add notification center for approval, rejection, suspension, renewal, and
  complaint updates.

### Dependants

- [ ] Add create, edit, remove, and view dependant flows.
- [ ] Define whether dependants get their own QR/card or are verified through the
  primary resident.
- [ ] Add admin approval and audit history for dependants.
- [ ] Define expiry and suspension behavior inherited from the primary resident.

### Renewals and expiry

- [x] Add resident renewal request UI and API.
- [x] Add admin renewal queue, approve/reject action, reason, and processed-by
  fields.
- [x] Preserve membership ID and historical issue/expiry dates.
- [x] Add a card lifecycle/history table; the current single card record is not
  enough for complete renewal history.
- [x] Add a scheduled job that marks cards expired when `expiresAt` passes.
- [x] Show renewal reminders before expiry.
- [x] Confirm SIGAR and merchant verification deny expired cards.

### Resident value and support

- [x] Replace hard-coded metrics and activity in `apps/web/src/App.tsx` and
  `apps/web/src/data.ts` with API data.
- [x] Load merchant offers and categories from the existing API.
- [x] Add pagination and server-side filters for merchant directory results.
- [x] Add transaction and reward history APIs and connect the activity screen.
- [x] Add merchant-specific reward balance display.
- [x] Add complaint/dispute submission, attachment support if required, status,
  replies, and history.
- [x] Implement profile, renewal details, notification, help, and verification-code
  buttons that are currently visual placeholders.

## 6. Merchant platform - P1

The merchant platform is the largest missing product area.

### Merchant onboarding and access

- [ ] Build merchant registration with business name, category, contact person,
  phone, email, location/service area, password, consent, and optional evidence.
- [ ] Create merchant login, logout, session recovery, forgot password, and change
  password.
- [ ] Support one or more staff users per merchant with owner/staff permissions.
- [ ] Add BERA merchant approval, rejection, suspension, reason, and audit trail.
- [ ] Prevent suspended merchants and staff from verifying or logging benefits.

### Merchant profile and offers

- [ ] Build merchant dashboard and profile management.
- [ ] Build offer create, edit, pause, resume, and archive flows.
- [ ] Support all defined benefit types: percentage, fixed rate, free service,
  loyalty points, merchant credit, and voucher.
- [ ] Support immediate and accumulated redemption models.
- [ ] Validate value, rule, validity dates, category, and redemption constraints.
- [ ] Require BERA approval for new offers and material offer changes.
- [ ] Keep historical offer versions so old transactions remain explainable.

### Verification, transactions, and rewards

- [ ] Add merchant QR camera scanning and manual membership/phone lookup.
- [ ] Return only minimum identity and benefit eligibility data.
- [ ] Log every verification attempt with merchant, staff user, card, result,
  timestamp, and device/session context.
- [ ] Build transaction logging with purchase amount optional, benefit value,
  offer, redemption model, staff user, and timestamp.
- [ ] Calculate percentage benefits server-side using decimal-safe arithmetic.
- [ ] Never trust benefit values supplied by the browser.
- [ ] Update merchant-specific accumulated reward balance transactionally.
- [ ] Add reward redemption with balance checks and an immutable ledger.
- [ ] Add correction/reversal workflow; do not delete financial/reward history.
- [ ] Build merchant reports for visits, benefit value, rewards issued/redeemed,
  offer usage, and date ranges.

## 7. BERA admin platform - P1

- [ ] Add detailed resident review page with all submitted fields, evidence,
  consent time, card history, scan summary, transactions, renewals, complaints,
  and action history.
- [ ] Require an admin reason for rejection and suspension.
- [ ] Add merchant review, approval, rejection, and suspension screens.
- [ ] Add offer review and approval screens with before/after change comparison.
- [ ] Add renewal queue and card lifecycle management.
- [ ] Add complaint/dispute queue, assignment, notes, status, and resolution.
- [ ] Add transaction audit queue with flag, approve, investigate, reverse, and
  notes.
- [ ] Add admin user management with least-privilege roles rather than one broad
  `ADMIN` role. Suggested roles: super admin, resident reviewer, merchant
  reviewer, support, auditor, and read-only reporter.
- [ ] Add reports for resident counts, approval times, active/expired cards,
  merchants, offers, transactions, reward liability, scans, denied access,
  renewals, complaints, and popular categories.
- [ ] Add CSV export with permission checks and audit logging.
- [ ] Add pagination to all admin lists.
- [ ] Add safe bulk actions only after single-record workflows and audit coverage
  are proven.

## 8. SIGAR completion - P1

- [x] Add a dedicated Access Point role experience with no map, scan workflows,
  visitor verification, GPS sharing, camera sharing, and walk-in exit-code
  handling.
- [ ] Replace default SIGAR accounts with named security staff accounts.
- [ ] Decide whether SIGAR authentication remains separate or uses the main User
  table. Document the decision and avoid conflicting account ownership.
- [ ] Add security role and gate assignment so staff only access allowed areas.
- [ ] Add photo display only if approved by the privacy policy.
- [ ] Make camera scanning reliable on supported Android/iOS browsers and show a
  clear fallback when `BarcodeDetector` is unavailable.
- [ ] Prevent repeated accidental scans with a cooldown/idempotency key.
- [ ] Add offline/unavailable state that never falsely reports access as allowed.
- [ ] Add scan reason and optional security note for manual overrides.
- [ ] Define and implement a tightly controlled override process. Every override
  must be audited.
- [ ] Add gate event filters, pagination, export, and date range.
- [ ] Add a BERA read-only view of gate events without exposing unrelated SIGAR
  operational data.
- [ ] Move `security_access_events` and other shared-table creation into formal
  versioned database migrations. Runtime `CREATE TABLE` calls should not own the
  production schema long-term.
- [ ] Add retention rules for GPS, incident, chat, camera, and access-event data.
- [ ] Verify Socket.IO authentication and room authorization for every event.
- [ ] Test PWA install, service-worker updates, camera permissions, reconnection,
  and mobile performance.

## 9. Database and API work - P1/P2

- [ ] Add schema fields for rejection/suspension reasons, processedBy, processedAt,
  resident profile photo/evidence metadata, and email/phone verification.
- [ ] Add `AuditLog`, password-reset token, refresh session, notification, card
  lifecycle/history, offer version, reward ledger, and file metadata models.
- [ ] Add indexes for every common filter and relation, especially statuses,
  dates, membership IDs, phones, merchant/category, transaction dates, and scan
  dates.
- [ ] Add explicit `onDelete` behavior to Prisma relations. Do not rely on unclear
  defaults.
- [ ] Decide data archival and soft-delete rules. Do not hard-delete audited
  transactions, scans, approvals, or reward ledger entries.
- [ ] Use database transactions for approval, transaction logging, reward updates,
  redemption, reversal, and renewal.
- [ ] Add idempotency keys for transaction creation, reward redemption, and scan
  submission where duplicate requests are harmful.
- [ ] Add consistent API response and error formats.
- [ ] Add request IDs and structured logs across NestJS and SIGAR.
- [ ] Add OpenAPI/Swagger documentation generated from DTOs.
- [ ] Add API pagination conventions and maximum page sizes.
- [ ] Add health, readiness, and database-connectivity checks suitable for Render.

## 10. Frontend quality - P2

- [ ] Introduce real routing with protected resident, merchant, and admin routes.
- [ ] Split the current large React components into feature modules without
  changing the visual language.
- [ ] Add a shared API client with timeout, cancellation, 401 handling, typed
  errors, and retry only for safe requests.
- [ ] Add form validation messages beside fields, not only a general error.
- [ ] Add loading, empty, error, success, disabled, and stale-data states to every
  workflow.
- [ ] Add confirmation and reason dialogs for destructive/privileged actions.
- [ ] Add toast or inline success feedback after mutations.
- [ ] Test keyboard navigation, focus management, labels, contrast, screen-reader
  names, and reduced motion.
- [ ] Test layouts at 320, 375, 390, 768, 1024, 1440, and wide desktop widths.
- [ ] Prevent any horizontal overflow or overlapping controls.
- [ ] Add error boundaries and a useful 404 page.
- [ ] Remove Google Fonts dependency or ensure an acceptable system-font fallback
  for slow/offline networks.
- [ ] Add installable PWA behavior to the resident/merchant app only if BERA wants
  it; do not let stale service-worker caches hide card status changes.

## 11. Testing requirements - P0 through P2

### API and database

- [ ] Unit tests for authentication, membership generation, card lifecycle,
  benefit calculation, rewards, and role guards.
- [ ] Integration tests using an isolated PostgreSQL test database, not production
  Neon data.
- [ ] Tests for duplicate phone/email, invalid status, inactive accounts, wrong
  roles, expired JWTs, and tampered tokens.
- [ ] Tests for approval, rejection, suspension, expiry, renewal, and reactivation.
- [ ] Tests proving all protected endpoints reject anonymous and wrong-role users.
- [ ] Transaction and concurrency tests for rewards and duplicate requests.
- [ ] Migration tests from a copy of the current schema.

### End-to-end

- [ ] Resident registration -> admin approval -> SIGAR allowed.
- [ ] Pending/rejected/suspended/expired resident -> SIGAR denied.
- [ ] Merchant registration -> admin approval -> offer submission -> offer approval.
- [ ] Merchant scan -> transaction -> resident history -> admin audit.
- [ ] Accumulated reward issue -> balance -> redemption -> reversal.
- [ ] Renewal request -> admin approval -> new expiry -> SIGAR allowed.
- [ ] Complaint creation -> admin handling -> resident resolution view.
- [ ] Password reset and session revocation.

### Browser and device QA

- [ ] Automated Playwright tests for Chromium, Firefox, and WebKit.
- [ ] Real Android and iPhone camera-scanning tests.
- [ ] Slow network, Neon cold start, Render cold start, offline, and reconnect tests.
- [ ] Accessibility scan plus manual keyboard/screen-reader check.
- [ ] Load test the expected pilot size and a larger safety target.

## 12. Production operations - P0/P2

- [ ] Put source code in a private remote repository with protected main branch and
  pull-request checks.
- [ ] Add CI for install, Prisma validation/generation, type-check, lint, unit
  tests, integration tests, and production builds.
- [ ] Create separate Neon projects/branches for development, test, staging, and
  production.
- [ ] Confirm Neon region, pooling, backups, point-in-time recovery, connection
  limits, and restore procedure.
- [ ] Create separate Render staging and production services.
- [ ] Configure all environment variables in Render; never commit `.env` files.
- [ ] Set the same production `DATABASE_URL` for the API and SIGAR, with least
  privilege where practical.
- [ ] Use `DIRECT_URL` only for Prisma migrations.
- [ ] Configure strong, different JWT secrets for the main API and SIGAR.
- [ ] Set exact production `WEB_ORIGIN` and `VITE_API_URL` values.
- [ ] Add custom domains, HTTPS, DNS, and allowed-origin checks.
- [ ] Add error monitoring, uptime checks, structured log collection, and alerts.
- [ ] Add database, API latency, error-rate, login-failure, and denied-scan metrics.
- [ ] Write incident response, credential rotation, backup restore, and rollback
  runbooks.
- [ ] Verify Render deploy order: migration -> seed safe system records -> API.
- [ ] Make seeds production-safe. Never reset passwords or overwrite live data on
  every deployment.
- [ ] Run a staging pilot with test accounts before importing real residents.
- [ ] Obtain BERA sign-off for privacy text, card wording, benefit rules, admin
  roles, and security-screen disclosures.

## 13. Environment variables

### Main API (`apps/api`)

- `DATABASE_URL` - Neon pooled connection string
- `DIRECT_URL` - Neon direct connection string for migrations
- `JWT_SECRET` - long unique random secret
- `ADMIN_INITIAL_PASSWORD` - only for first admin creation; rotate afterward
- `WEB_ORIGIN` - exact deployed web origin
- `PORT` - defaults to 4000 locally
- Future: email provider, object storage, monitoring, refresh-token secrets

### Web (`apps/web`)

- `VITE_API_URL` - deployed main API URL; blank locally when using Vite proxy

### SIGAR (`apps/security`)

- `DATABASE_URL` - same Neon database as the main API
- `JWT_SECRET` - unique SIGAR secret, different from the main API secret
- `NODE_ENV`
- `PORT` - defaults to 5001 locally
- Future: allowed origin, monitoring, file/object storage if required

## 14. Useful commands

Run these from the repository root unless a command says otherwise.

```powershell
npm.cmd install
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run build
npm.cmd run test
```

Focused commands:

```powershell
npm.cmd run build --workspace @bodija/api
npm.cmd run build --workspace @bodija/web
npm.cmd run test:auth-flow --workspace @bodija/api
npm.cmd run dev:web
npm.cmd run dev:api
```

SIGAR runs separately from `apps/security`:

```powershell
npm.cmd install
npm.cmd run dev
```

## 15. Suggested delivery order

1. Complete P0 security, audit logging, isolated test database, and CI.
2. Replace hard-coded resident offers/activity and finish profile, renewal, and
   complaint flows.
3. Build merchant onboarding, approval, offers, scanning, transactions, and
   rewards.
4. Complete admin merchant/offer/renewal/complaint/audit/report screens.
5. Harden SIGAR accounts, migrations, scanning, event reporting, and privacy.
6. Complete automated browser/device testing and accessibility.
7. Deploy staging, conduct BERA acceptance testing, fix findings, then deploy the
   production pilot.

## 16. Definition of done

The app is complete only when:

- Every core user can complete their workflow without database or developer help.
- No dashboard relies on hard-coded resident, merchant, transaction, reward, or
  report data.
- Every privileged action is authorized, validated, audited, and tested.
- Card status changes propagate correctly to resident, merchant, admin, and SIGAR
  views.
- Pending, rejected, suspended, and expired cards cannot receive access or
  merchant benefits.
- Rewards and transactions are consistent under retries and concurrent requests.
- Privacy-minimal verification is enforced by the API, not just hidden in the UI.
- Production secrets and default passwords are rotated.
- Migrations, backups, restore, monitoring, alerts, rollback, and incident
  procedures are tested.
- BERA completes staging acceptance testing and signs off on the pilot.

## 17. Current local test accounts

These are development-only and must be removed or rotated before production.

- Resident: `tolulope.adeyemi@example.com` / `resident123`
- BERA admin: `gisknigeria@gmail.com` / `BodijaAdmin@2026`
- SIGAR: `admin@command.local` / `admin123`

Do not place production credentials in this document.

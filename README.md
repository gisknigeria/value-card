# Bodija Value Card

Pilot implementation of the BERA resident identity, merchant benefits, loyalty,
and verification platform described in `PRODUCT_REQUIREMENTS.md`.

## Stack

- React 19, TypeScript, and Vite for the web application
- NestJS and TypeScript for the API
- Neon PostgreSQL and Prisma for managed persistence
- npm workspaces for the monorepo

## Project structure

- `apps/web` - responsive resident portal and benefit comparison experience
- `apps/api` - NestJS API, Prisma schema, verification, and merchant offer endpoints
- `apps/security` - SIGAR Bodija Community command, incident, GIS, and gate app
- `PRODUCT_REQUIREMENTS.md` - source product brief

## Run the resident portal

```powershell
cd apps/web
npm.cmd install --workspaces=false
npm.cmd run dev --workspaces=false
```

Open `http://localhost:5173`.

The BERA administration portal is available at `http://localhost:5173/admin`.
Its seeded administrator email is `gisknigeria@gmail.com`. Configure
`ADMIN_INITIAL_PASSWORD` before the first production seed.

## Start the complete platform locally

After configuring `apps/api/.env` with the values described below, run:

```powershell
npm.cmd install
npm.cmd run setup
npm.cmd run dev
```

This starts the resident, merchant, and BERA portal at
`http://localhost:5173`, the main API at `http://localhost:4000/api`, and
SIGAR Bodija Community at `http://localhost:5174`. The SIGAR API runs on port
`5001`.

## Configure and run the API

No Docker or local database service is required. Create a Neon project, copy its
pooled connection string to `DATABASE_URL`, and its direct connection string to
`DIRECT_URL` in `apps/api/.env`.

```powershell
cd apps/api
npm.cmd install --workspaces=false
npm.cmd run prisma:generate --workspaces=false
npm.cmd run prisma:deploy --workspaces=false
npm.cmd run prisma:seed --workspaces=false
npm.cmd run start:dev --workspaces=false
```

The API runs at `http://localhost:4000/api`. Its health endpoint is
`GET /api/health`.

## Current pilot slice

- Resident registration, password login, and JWT session recovery
- Live digital QR cards with pending, active, expired, and suspended states
- BERA administrator dashboard for resident search, approval, rejection, and suspension
- Shared card access state with SIGAR gate verification
- Merchant benefit directory and comparison filters
- Immediate and accumulated benefit presentation
- Resident transaction and reward history views
- Prisma models for users, residents, dependants, cards, merchants, offers,
  transactions, balances, renewals, complaints, and verification scans
- Public merchant offer/category endpoints
- Privacy-limited card verification endpoint
- Pilot resident, administrator, and merchant seed data

Merchant authentication, profile editing, password recovery, and full transaction
mutation flows are the next implementation milestone.

## Deploy on Render

The repository includes `render.yaml` with three services:

- `bodija-value-card-api` - NestJS web service
- `bodija-value-card-web` - React static site
- `sigar-bodija-community` - security command and gate-verification app

In Render, create a Blueprint from the repository and provide:

- `DATABASE_URL` - Neon pooled connection string
- `DIRECT_URL` - Neon direct connection string
- `WEB_ORIGIN` - deployed frontend URL
- `VITE_API_URL` - deployed API URL
- `ADMIN_INITIAL_PASSWORD` - strong initial BERA administrator password

Set the same Neon `DATABASE_URL` on both backend services. SIGAR stores its
security operations in dedicated tables while verifying cards against the shared
Value Card resident and card tables.

The API is configured for Render's Frankfurt region. Choose a nearby European
region for the Neon project.

Render generates `JWT_SECRET`. The API start command applies pending migrations
and safely creates missing pilot seed records before starting.
# value-card

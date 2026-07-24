# Migration Fix: visitor_passes

## Problem

The `20260724000001_visitor_passes` migration failed because the `visitor_passes` table already exists in the Neon database (created by the security server on first startup).

Prisma recorded this as a **failed migration** in the `_prisma_migrations` table, which blocks all future deployments.

## Solution

The migration SQL has been updated to be **fully idempotent** (uses `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, etc.), so it's safe to mark as applied.

### Fix (Run Once)

**Option 1: Via Render Shell**
1. Go to your API service in Render dashboard
2. Open Shell
3. Run:
   ```bash
   npx prisma migrate resolve --applied 20260724000001_visitor_passes
   ```

**Option 2: Locally (if DATABASE_URL is accessible)**
1. In `apps/api`:
   ```bash
   npx prisma migrate resolve --applied 20260724000001_visitor_passes
   ```

**Option 3: Direct SQL (if you have psql access to Neon)**
```sql
UPDATE _prisma_migrations
SET finished_at = NOW(),
    applied_steps_count = 1
WHERE migration_name = '20260724000001_visitor_passes';
```

### Verify

After running the fix, redeploy from Render. The deploy should succeed and migrations should show as all applied.

---

## What Changed

- **Web app**: Resident card page now has bigger QR (90px), download button, and visitor pass management (generate/revoke codes)
- **NestJS API**: New `/api/auth/resident/visitor-passes` endpoints (GET/POST/DELETE), VisitorPass Prisma model, migration SQL
- **Security app**: New "Visitor code" tab in gate scanner, `/api/visitor/verify` endpoint, removed reconnecting toast

All code changes are complete and ready. Only this one-time migration resolution is needed.

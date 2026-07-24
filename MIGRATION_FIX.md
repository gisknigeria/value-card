# Migration Fix: visitor_passes

## Problem

The `20260724000001_visitor_passes` migration failed because the `visitor_passes` table already exists in the Neon database (created by the security server on first startup).

Prisma recorded this as a **failed migration** in the `_prisma_migrations` table, which blocks all future deployments.

## Solution ✅ AUTOMATED

The `prisma:deploy` script in `apps/api/package.json` has been updated to automatically resolve this failed migration before deploying:

```json
"prisma:deploy": "prisma migrate resolve --applied 20260724000001_visitor_passes && prisma migrate deploy"
```

**No manual action needed.** The next deploy will automatically:
1. Mark the `20260724000001_visitor_passes` migration as successfully applied
2. Deploy all remaining migrations

### After First Successful Deploy (Optional Cleanup)

Once the deploy succeeds, you can optionally simplify the script back to:
```json
"prisma:deploy": "prisma migrate deploy"
```

Since the migration will be marked as applied, it won't need resolving again.

---

## What Changed

- **Web app**: Resident card page now has bigger QR (90px), download button, and visitor pass management (generate/revoke codes)
- **NestJS API**: New `/api/auth/resident/visitor-passes` endpoints (GET/POST/DELETE), VisitorPass Prisma model, idempotent migration SQL
- **Security app**: New "Visitor code" tab in gate scanner, `/api/visitor/verify` endpoint, removed reconnecting toast

All code changes are complete and the migration fix is automated in the deploy script.

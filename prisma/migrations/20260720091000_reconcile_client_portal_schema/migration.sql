-- Reconcile the checked-in Prisma model with the baseline migration. The portal
-- endpoint uses these fields and fresh deployments must match generated clients.
ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "portalEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "portalLastLogin" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "portalToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Client_portalToken_key" ON "Client"("portalToken");

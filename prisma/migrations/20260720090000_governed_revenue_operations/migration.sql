CREATE TABLE IF NOT EXISTS "RevenueProspect" (
  "id" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "ownerId" TEXT,
  "normalizedEmail" TEXT NOT NULL,
  "crmProvider" TEXT,
  "externalId" TEXT,
  "lifecycle" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "state" JSONB NOT NULL,
  "retryAt" TIMESTAMP(3),
  "linkedClientId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RevenueProspect_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevenueProspect_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevenueProspect_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevenueProspect_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevenueProspect_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "RevenueProspect_firmId_normalizedEmail_key" ON "RevenueProspect"("firmId", "normalizedEmail");
CREATE UNIQUE INDEX IF NOT EXISTS "RevenueProspect_firmId_crmProvider_externalId_key" ON "RevenueProspect"("firmId", "crmProvider", "externalId");
CREATE INDEX IF NOT EXISTS "RevenueProspect_firmId_lifecycle_ownerId_idx" ON "RevenueProspect"("firmId", "lifecycle", "ownerId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RevenueProspect_version_check') THEN
    ALTER TABLE "RevenueProspect" ADD CONSTRAINT "RevenueProspect_version_check" CHECK ("version" > 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "RevenueSuppression" (
  "id" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "normalizedEmail" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "externalReference" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevenueSuppression_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevenueSuppression_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "RevenueSuppression_firmId_normalizedEmail_key" ON "RevenueSuppression"("firmId", "normalizedEmail");
CREATE INDEX IF NOT EXISTS "RevenueSuppression_firmId_occurredAt_idx" ON "RevenueSuppression"("firmId", "occurredAt");

CREATE TABLE IF NOT EXISTS "RevenueDeliveryEvidence" (
  "id" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "consentReference" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevenueDeliveryEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevenueDeliveryEvidence_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "RevenueProspect"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "RevenueDeliveryEvidence_idempotencyKey_key" ON "RevenueDeliveryEvidence"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "RevenueDeliveryEvidence_prospectId_sentAt_idx" ON "RevenueDeliveryEvidence"("prospectId", "sentAt");

CREATE TABLE IF NOT EXISTS "RevenueAuditEvent" (
  "id" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "previousHash" TEXT NOT NULL,
  "eventHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevenueAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevenueAuditEvent_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "RevenueProspect"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevenueAuditEvent_sequence_check" CHECK ("sequence" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "RevenueAuditEvent_eventHash_key" ON "RevenueAuditEvent"("eventHash");
CREATE UNIQUE INDEX IF NOT EXISTS "RevenueAuditEvent_prospectId_sequence_key" ON "RevenueAuditEvent"("prospectId", "sequence");
CREATE INDEX IF NOT EXISTS "RevenueAuditEvent_firmId_prospectId_sequence_idx" ON "RevenueAuditEvent"("firmId", "prospectId", "sequence");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RevenueAuditEvent_sequence_check') THEN
    ALTER TABLE "RevenueAuditEvent" ADD CONSTRAINT "RevenueAuditEvent_sequence_check" CHECK ("sequence" > 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION reject_revenue_evidence_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'revenue evidence is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS revenue_audit_immutable ON "RevenueAuditEvent";
CREATE TRIGGER revenue_audit_immutable BEFORE UPDATE OR DELETE ON "RevenueAuditEvent"
FOR EACH ROW EXECUTE FUNCTION reject_revenue_evidence_mutation();

DROP TRIGGER IF EXISTS revenue_delivery_immutable ON "RevenueDeliveryEvidence";
CREATE TRIGGER revenue_delivery_immutable BEFORE UPDATE OR DELETE ON "RevenueDeliveryEvidence"
FOR EACH ROW EXECUTE FUNCTION reject_revenue_evidence_mutation();

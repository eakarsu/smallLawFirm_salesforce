CREATE TABLE "AiProviderReceipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRequestId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiProviderReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiProviderReceipt_provider_providerRequestId_key" ON "AiProviderReceipt"("provider", "providerRequestId");
CREATE INDEX "AiProviderReceipt_userId_createdAt_idx" ON "AiProviderReceipt"("userId", "createdAt");
ALTER TABLE "AiProviderReceipt" ADD CONSTRAINT "AiProviderReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAdminAction" (
    "id" TEXT NOT NULL,
    "platformAdminId" TEXT NOT NULL,
    "organizationId" TEXT,
    "propertyId" TEXT,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");

-- CreateIndex
CREATE INDEX "PlatformAdminAction_platformAdminId_idx" ON "PlatformAdminAction"("platformAdminId");

-- CreateIndex
CREATE INDEX "PlatformAdminAction_organizationId_idx" ON "PlatformAdminAction"("organizationId");

-- CreateIndex
CREATE INDEX "PlatformAdminAction_createdAt_idx" ON "PlatformAdminAction"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformAdminAction_action_idx" ON "PlatformAdminAction"("action");

-- AddForeignKey
ALTER TABLE "PlatformAdminAction" ADD CONSTRAINT "PlatformAdminAction_platformAdminId_fkey" FOREIGN KEY ("platformAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

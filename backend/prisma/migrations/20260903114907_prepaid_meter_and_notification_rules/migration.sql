-- CreateEnum
CREATE TYPE "PrepaidRecordType" AS ENUM ('TOPUP', 'USAGE', 'ADJUST');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('RENT_GENERATE', 'RENT_DUE', 'RENT_OVERDUE', 'OVERDUE_DIGEST', 'CONTRACT_EXPIRY', 'PREPAID_LOW');

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "prepaidBalance" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "prepaidEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prepaidLowAlertedAt" TIMESTAMP(3),
ADD COLUMN     "prepaidUnitPrice" DECIMAL(6,2);

-- CreateTable
CREATE TABLE "PrepaidRecord" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "type" "PrepaidRecordType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "kwh" DECIMAL(10,2),
    "balanceAfter" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrepaidRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "hour" INTEGER NOT NULL DEFAULT 9,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "daysBefore" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "intervalDays" INTEGER,
    "dayOfMonth" INTEGER,
    "threshold" DECIMAL(10,2),
    "remindOnDue" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrepaidRecord_unitId_createdAt_idx" ON "PrepaidRecord"("unitId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRule_enabled_hour_minute_idx" ON "NotificationRule"("enabled", "hour", "minute");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRule_userId_kind_key" ON "NotificationRule"("userId", "kind");

-- AddForeignKey
ALTER TABLE "PrepaidRecord" ADD CONSTRAINT "PrepaidRecord_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

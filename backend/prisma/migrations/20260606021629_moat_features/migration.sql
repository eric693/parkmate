-- CreateEnum
CREATE TYPE "DepositRefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'MATCHED', 'UNMATCHED', 'MANUAL');

-- CreateEnum
CREATE TYPE "HandoverType" AS ENUM ('MOVE_IN', 'MOVE_OUT');

-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('DRAFT', 'PENDING_TENANT', 'CONFIRMED');

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "complianceCheckedAt" TIMESTAMP(3),
ADD COLUMN     "complianceResult" JSONB,
ADD COLUMN     "signToken" TEXT,
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signerName" TEXT;

-- AlterTable
ALTER TABLE "MaintenanceRequest" ADD COLUMN     "aiAnalysis" JSONB,
ADD COLUMN     "aiClassified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'LANDLORD';

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "district" TEXT,
ADD COLUMN     "purchasePrice" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "areaPing" DECIMAL(6,2),
ADD COLUMN     "occupants" INTEGER;

-- CreateTable
CREATE TABLE "DepositRefund" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "depositAmount" DECIMAL(10,2) NOT NULL,
    "totalDeductions" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(10,2) NOT NULL,
    "status" "DepositRefundStatus" NOT NULL DEFAULT 'PENDING',
    "refundDate" TIMESTAMP(3),
    "notes" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositDeduction" (
    "id" TEXT NOT NULL,
    "depositRefundId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',

    CONSTRAINT "DepositDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "daysBefore" INTEGER NOT NULL DEFAULT 3,
    "remindOnDue" BOOLEAN NOT NULL DEFAULT true,
    "overdueEnabled" BOOLEAN NOT NULL DEFAULT true,
    "overdueInterval" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "rentRecordId" TEXT NOT NULL,
    "triggerKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingRecord" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "listedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,

    CONSTRAINT "ListingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirtualAccount" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SANDBOX',
    "bankCode" TEXT NOT NULL DEFAULT '000',
    "accountNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VirtualAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT,
    "rentRecordId" TEXT,
    "virtualAccountId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'SANDBOX',
    "providerTxnId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payerName" TEXT,
    "rawPayload" JSONB,
    "reconciledAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handover" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "HandoverType" NOT NULL,
    "status" "HandoverStatus" NOT NULL DEFAULT 'DRAFT',
    "items" JSONB NOT NULL DEFAULT '[]',
    "meterReadings" JSONB,
    "note" TEXT,
    "confirmToken" TEXT,
    "tenantSignedAt" TIMESTAMP(3),
    "signerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Handover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UtilityBill" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'EVEN',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UtilityBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UtilityAllocation" (
    "id" TEXT NOT NULL,
    "utilityBillId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "basis" DECIMAL(10,2),
    "billed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UtilityAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantCreditSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,
    "onTimeRate" DOUBLE PRECISION NOT NULL,
    "avgDelayDays" DOUBLE PRECISION NOT NULL,
    "totalRecords" INTEGER NOT NULL,
    "crossLandlord" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantCreditSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepositRefund_contractId_key" ON "DepositRefund"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderSetting_userId_key" ON "ReminderSetting"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_rentRecordId_triggerKey_key" ON "ReminderLog"("rentRecordId", "triggerKey");

-- CreateIndex
CREATE UNIQUE INDEX "VirtualAccount_contractId_key" ON "VirtualAccount"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "VirtualAccount_accountNumber_key" ON "VirtualAccount"("accountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerTxnId_key" ON "Payment"("providerTxnId");

-- CreateIndex
CREATE UNIQUE INDEX "Handover_confirmToken_key" ON "Handover"("confirmToken");

-- CreateIndex
CREATE UNIQUE INDEX "TenantCreditSnapshot_tenantId_key" ON "TenantCreditSnapshot"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_signToken_key" ON "Contract"("signToken");

-- AddForeignKey
ALTER TABLE "DepositRefund" ADD CONSTRAINT "DepositRefund_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositDeduction" ADD CONSTRAINT "DepositDeduction_depositRefundId_fkey" FOREIGN KEY ("depositRefundId") REFERENCES "DepositRefund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderSetting" ADD CONSTRAINT "ReminderSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_rentRecordId_fkey" FOREIGN KEY ("rentRecordId") REFERENCES "RentRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingRecord" ADD CONSTRAINT "ListingRecord_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VirtualAccount" ADD CONSTRAINT "VirtualAccount_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_rentRecordId_fkey" FOREIGN KEY ("rentRecordId") REFERENCES "RentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_virtualAccountId_fkey" FOREIGN KEY ("virtualAccountId") REFERENCES "VirtualAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityBill" ADD CONSTRAINT "UtilityBill_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityAllocation" ADD CONSTRAINT "UtilityAllocation_utilityBillId_fkey" FOREIGN KEY ("utilityBillId") REFERENCES "UtilityBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityAllocation" ADD CONSTRAINT "UtilityAllocation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantCreditSnapshot" ADD CONSTRAINT "TenantCreditSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

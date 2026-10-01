-- CreateEnum
CREATE TYPE "SpotType" AS ENUM ('FLAT', 'MECHANICAL_UPPER', 'MECHANICAL_LOWER', 'OTHER');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'SHORT_TERM');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'FULFILLED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "periodAmount" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "dailyRate" DECIMAL(10,2),
ADD COLUMN     "hasCharger" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxHeightCm" INTEGER,
ADD COLUMN     "maxWidthCm" INTEGER,
ADD COLUMN     "spotType" "SpotType",
ADD COLUMN     "vehicleKind" "VehicleType",
ADD COLUMN     "weeklyRate" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "vehicleKind" "VehicleType",
    "spotType" "SpotType",
    "needCharger" BOOLEAN NOT NULL DEFAULT false,
    "vehicleHeightCm" INTEGER,
    "notes" TEXT,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "notifiedAt" TIMESTAMP(3),
    "notifiedUnitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaitlistEntry_userId_status_idx" ON "WaitlistEntry"("userId", "status");

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;


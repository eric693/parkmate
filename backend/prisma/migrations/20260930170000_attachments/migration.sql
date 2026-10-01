-- CreateEnum
CREATE TYPE "AttachmentEntity" AS ENUM ('PROPERTY', 'UNIT', 'TENANT', 'VEHICLE', 'CONTRACT', 'MAINTENANCE', 'EXPENSE', 'RENT_RECORD');

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" "AttachmentEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "note" TEXT,
    "capturedAt" TIMESTAMP(3),
    "uploadedById" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storedName_key" ON "Attachment"("storedName");

-- CreateIndex
CREATE INDEX "Attachment_userId_entityType_entityId_idx" ON "Attachment"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Attachment_userId_category_idx" ON "Attachment"("userId", "category");


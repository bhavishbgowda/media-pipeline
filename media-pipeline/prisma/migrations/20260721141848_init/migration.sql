-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "filepath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "blurScore" DOUBLE PRECISION,
    "blurThreshold" DOUBLE PRECISION,
    "blurPassed" BOOLEAN,
    "brightnessAverage" DOUBLE PRECISION,
    "brightnessStatus" TEXT,
    "brightnessPassed" BOOLEAN,
    "isDuplicate" BOOLEAN,
    "duplicateOfId" TEXT,
    "vehicleNumberRaw" TEXT,
    "vehicleNumberValid" BOOLEAN,
    "ocrConfidence" DOUBLE PRECISION,
    "screenshotSuspected" BOOLEAN,
    "screenshotConfidence" DOUBLE PRECISION,
    "tamperSuspected" BOOLEAN,
    "tamperConfidence" DOUBLE PRECISION,
    "resultJson" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Upload_hash_idx" ON "Upload"("hash");

-- CreateIndex
CREATE INDEX "Upload_status_idx" ON "Upload"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Analysis_uploadId_key" ON "Analysis"("uploadId");

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

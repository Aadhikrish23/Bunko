-- CreateEnum
CREATE TYPE "SyncEventType" AS ENUM ('SESSION_RECORDED', 'ANNOTATION_CREATED', 'ANNOTATION_UPDATED', 'ANNOTATION_DELETED', 'NOTE_CREATED', 'NOTE_UPDATED', 'NOTE_DELETED', 'BOOKMARK_CREATED', 'BOOKMARK_DELETED', 'PREFERENCE_SET');

-- CreateEnum
CREATE TYPE "SyncEventStatus" AS ENUM ('APPLIED', 'SKIPPED', 'CONFLICT', 'REJECTED');

-- CreateEnum
CREATE TYPE "SyncConflictResolution" AS ENUM ('SERVER', 'DEVICE');

-- AlterTable
ALTER TABLE "ReadingPosition" ADD COLUMN     "updatedByDeviceId" TEXT;

-- CreateTable
CREATE TABLE "DeviceSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "type" "SyncEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "clientCreatedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SyncEventStatus" NOT NULL,
    "detail" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolution" "SyncConflictResolution",

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "copyId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByDeviceId" TEXT,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSession_userId_deviceId_key" ON "DeviceSession"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "SyncEvent_userId_status_idx" ON "SyncEvent"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SyncEvent_userId_clientEventId_key" ON "SyncEvent"("userId", "clientEventId");

-- CreateIndex
CREATE INDEX "Bookmark_userId_copyId_idx" ON "Bookmark"("userId", "copyId");

-- AddForeignKey
ALTER TABLE "DeviceSession" ADD CONSTRAINT "DeviceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "Copy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


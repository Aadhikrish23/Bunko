-- CreateEnum
CREATE TYPE "SoundtrackProvider" AS ENUM ('SPOTIFY', 'YOUTUBE', 'APPLE_MUSIC', 'SOUNDCLOUD');

-- CreateEnum
CREATE TYPE "SoundtrackTargetType" AS ENUM ('WORK', 'SHELF', 'GENRE', 'MOOD', 'SITUATION');

-- CreateTable
CREATE TABLE "Soundtrack" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "provider" "SoundtrackProvider" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Soundtrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoundtrackMapping" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "soundtrackId" TEXT NOT NULL,
    "targetType" "SoundtrackTargetType" NOT NULL,
    "targetKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoundtrackMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Soundtrack_userId_idx" ON "Soundtrack"("userId");

-- CreateIndex
CREATE INDEX "SoundtrackMapping_soundtrackId_idx" ON "SoundtrackMapping"("soundtrackId");

-- CreateIndex
CREATE UNIQUE INDEX "SoundtrackMapping_userId_targetType_targetKey_key" ON "SoundtrackMapping"("userId", "targetType", "targetKey");

-- AddForeignKey
ALTER TABLE "Soundtrack" ADD CONSTRAINT "Soundtrack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoundtrackMapping" ADD CONSTRAINT "SoundtrackMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoundtrackMapping" ADD CONSTRAINT "SoundtrackMapping_soundtrackId_fkey" FOREIGN KEY ("soundtrackId") REFERENCES "Soundtrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;


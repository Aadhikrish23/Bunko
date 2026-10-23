-- AlterTable
ALTER TABLE "ReadingSession" ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pausedSeconds" INTEGER NOT NULL DEFAULT 0;

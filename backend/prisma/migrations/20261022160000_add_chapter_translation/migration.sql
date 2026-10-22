-- CreateEnum
CREATE TYPE "TranslationStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "AiConsent" ADD COLUMN     "translation" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ChapterTranslation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "structuralId" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "status" "TranslationStatus" NOT NULL,
    "segmentsDone" INTEGER NOT NULL DEFAULT 0,
    "segmentsTotal" INTEGER NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "error" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChapterTranslation_userId_editionId_idx" ON "ChapterTranslation"("userId", "editionId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterTranslation_userId_editionId_structuralId_targetLang_key" ON "ChapterTranslation"("userId", "editionId", "structuralId", "targetLanguage");

-- AddForeignKey
ALTER TABLE "ChapterTranslation" ADD CONSTRAINT "ChapterTranslation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterTranslation" ADD CONSTRAINT "ChapterTranslation_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


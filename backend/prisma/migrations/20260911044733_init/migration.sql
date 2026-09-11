-- CreateEnum
CREATE TYPE "ReadingStatus" AS ENUM ('WANT_TO_READ', 'READING', 'FINISHED', 'DID_NOT_FINISH');

-- CreateEnum
CREATE TYPE "EditionFormat" AS ENUM ('PHYSICAL', 'EPUB', 'PDF');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "currentRefreshTokenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Author" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Author_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "seriesId" TEXT,
    "description" TEXT,
    "genres" TEXT[],
    "coverImageUrl" TEXT,
    "externalSource" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkAuthor" (
    "workId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "WorkAuthor_pkey" PRIMARY KEY ("workId","authorId")
);

-- CreateTable
CREATE TABLE "UserWork" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "status" "ReadingStatus" NOT NULL DEFAULT 'WANT_TO_READ',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Edition" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "publisher" TEXT,
    "language" TEXT,
    "format" "EditionFormat" NOT NULL,
    "isbn" TEXT,
    "pageCount" INTEGER,
    "chapterGraph" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Edition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Copy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "digitalFileId" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Copy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalFile" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigitalFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingJourney" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "canonicalPositionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingJourney_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingPosition" (
    "id" TEXT NOT NULL,
    "structuralId" TEXT,
    "chapterLabel" TEXT,
    "textAnchor" TEXT,
    "pageNumber" INTEGER,
    "confidence" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "copyId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "medium" "EditionFormat" NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "startPosition" TEXT,
    "endPosition" TEXT,
    "reflection" TEXT,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shelf" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Shelf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShelfWork" (
    "shelfId" TEXT NOT NULL,
    "userWorkId" TEXT NOT NULL,

    CONSTRAINT "ShelfWork_pkey" PRIMARY KEY ("shelfId","userWorkId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Work_externalSource_externalId_key" ON "Work"("externalSource", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "UserWork_userId_workId_key" ON "UserWork"("userId", "workId");

-- CreateIndex
CREATE UNIQUE INDEX "Copy_digitalFileId_key" ON "Copy"("digitalFileId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingJourney_canonicalPositionId_key" ON "ReadingJourney"("canonicalPositionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingJourney_userId_workId_key" ON "ReadingJourney"("userId", "workId");

-- CreateIndex
CREATE INDEX "ReadingSession_userId_startTime_idx" ON "ReadingSession"("userId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "Shelf_userId_name_key" ON "Shelf"("userId", "name");

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAuthor" ADD CONSTRAINT "WorkAuthor_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAuthor" ADD CONSTRAINT "WorkAuthor_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWork" ADD CONSTRAINT "UserWork_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWork" ADD CONSTRAINT "UserWork_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Copy" ADD CONSTRAINT "Copy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Copy" ADD CONSTRAINT "Copy_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Copy" ADD CONSTRAINT "Copy_digitalFileId_fkey" FOREIGN KEY ("digitalFileId") REFERENCES "DigitalFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingJourney" ADD CONSTRAINT "ReadingJourney_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingJourney" ADD CONSTRAINT "ReadingJourney_canonicalPositionId_fkey" FOREIGN KEY ("canonicalPositionId") REFERENCES "ReadingPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingSession" ADD CONSTRAINT "ReadingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingSession" ADD CONSTRAINT "ReadingSession_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "ReadingJourney"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingSession" ADD CONSTRAINT "ReadingSession_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "Copy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shelf" ADD CONSTRAINT "Shelf_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShelfWork" ADD CONSTRAINT "ShelfWork_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "Shelf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShelfWork" ADD CONSTRAINT "ShelfWork_userWorkId_fkey" FOREIGN KEY ("userWorkId") REFERENCES "UserWork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

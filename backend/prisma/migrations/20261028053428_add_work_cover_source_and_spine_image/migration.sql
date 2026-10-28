-- CreateEnum
CREATE TYPE "CoverImageSource" AS ENUM ('metadata', 'upload', 'generated');

-- AlterTable
ALTER TABLE "Work" ADD COLUMN     "coverImageSource" "CoverImageSource" NOT NULL DEFAULT 'metadata',
ADD COLUMN     "spineImageUrl" TEXT;

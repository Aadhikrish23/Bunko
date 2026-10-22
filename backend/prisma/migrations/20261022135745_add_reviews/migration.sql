-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "rating" INTEGER,
    "body" TEXT,
    "isFavourite" BOOLEAN NOT NULL DEFAULT false,
    "rereadIntention" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_workId_key" ON "Review"("userId", "workId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


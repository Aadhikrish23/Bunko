-- CreateTable
CREATE TABLE "ShelfArrangement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tabKey" TEXT NOT NULL,
    "workIds" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShelfArrangement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShelfArrangement_userId_tabKey_key" ON "ShelfArrangement"("userId", "tabKey");

-- AddForeignKey
ALTER TABLE "ShelfArrangement" ADD CONSTRAINT "ShelfArrangement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

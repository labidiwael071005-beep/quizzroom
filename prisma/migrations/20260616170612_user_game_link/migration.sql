-- AlterTable
ALTER TABLE "User" ADD COLUMN     "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gamesWon" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalScore" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GamePlayerResult" (
    "id" TEXT NOT NULL,
    "pseudo" TEXT NOT NULL,
    "pseudoKey" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "won" BOOLEAN NOT NULL DEFAULT false,
    "roomCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "GamePlayerResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GamePlayerResult_userId_idx" ON "GamePlayerResult"("userId");

-- CreateIndex
CREATE INDEX "GamePlayerResult_pseudoKey_idx" ON "GamePlayerResult"("pseudoKey");

-- CreateIndex
CREATE INDEX "GamePlayerResult_createdAt_idx" ON "GamePlayerResult"("createdAt");

-- AddForeignKey
ALTER TABLE "GamePlayerResult" ADD CONSTRAINT "GamePlayerResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

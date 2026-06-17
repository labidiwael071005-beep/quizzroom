-- CreateTable
CREATE TABLE "PlayerReport" (
    "id" TEXT NOT NULL,
    "reportedUserId" TEXT,
    "reportedPseudo" TEXT NOT NULL,
    "reporterUserId" TEXT,
    "reporterPseudo" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "comment" TEXT,
    "roomCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerReport_reportedUserId_idx" ON "PlayerReport"("reportedUserId");

-- CreateIndex
CREATE INDEX "PlayerReport_status_idx" ON "PlayerReport"("status");

-- CreateIndex
CREATE INDEX "PlayerReport_createdAt_idx" ON "PlayerReport"("createdAt");

-- AddForeignKey
ALTER TABLE "PlayerReport" ADD CONSTRAINT "PlayerReport_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerReport" ADD CONSTRAINT "PlayerReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

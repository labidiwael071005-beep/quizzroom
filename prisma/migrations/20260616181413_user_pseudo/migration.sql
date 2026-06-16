-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pseudo" TEXT,
ADD COLUMN     "pseudoKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_pseudo_key" ON "User"("pseudo");

-- CreateIndex
CREATE UNIQUE INDEX "User_pseudoKey_key" ON "User"("pseudoKey");

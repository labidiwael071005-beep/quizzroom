-- CreateTable
CREATE TABLE "UserQuestionHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserQuestionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserQuestionHistory_userId_seenAt_idx" ON "UserQuestionHistory"("userId", "seenAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserQuestionHistory_userId_questionId_key" ON "UserQuestionHistory"("userId", "questionId");

-- AddForeignKey
ALTER TABLE "UserQuestionHistory" ADD CONSTRAINT "UserQuestionHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuestionHistory" ADD CONSTRAINT "UserQuestionHistory_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

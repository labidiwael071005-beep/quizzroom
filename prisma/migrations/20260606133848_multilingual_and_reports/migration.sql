-- ── Question : nouveau champ sourceRef (dédup d'import futur)
ALTER TABLE "Question" ADD COLUMN "sourceRef" TEXT;
CREATE UNIQUE INDEX "Question_sourceRef_key" ON "Question"("sourceRef");

-- ── QuestionReport : enrichissement (signalement structuré)
-- `reason` devient optionnel (on conserve les anciens reports éventuels).
ALTER TABLE "QuestionReport" ALTER COLUMN "reason" DROP NOT NULL;
ALTER TABLE "QuestionReport" ADD COLUMN "language" TEXT;
ALTER TABLE "QuestionReport" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'other';
ALTER TABLE "QuestionReport" ADD COLUMN "comment" TEXT;
ALTER TABLE "QuestionReport" ADD COLUMN "roomCode" TEXT;
ALTER TABLE "QuestionReport" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'open';
CREATE INDEX "QuestionReport_status_idx" ON "QuestionReport"("status");

-- ── Nouvelle table QuestionTranslation
CREATE TABLE "QuestionTranslation" (
  "id"          TEXT NOT NULL,
  "questionId"  TEXT NOT NULL,
  "language"    TEXT NOT NULL,
  "text"        TEXT NOT NULL,
  "options"     JSONB,
  "explanation" TEXT NOT NULL,
  "label"       TEXT,
  "country"     TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionTranslation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuestionTranslation_questionId_language_key"
  ON "QuestionTranslation"("questionId", "language");
CREATE INDEX "QuestionTranslation_language_idx"
  ON "QuestionTranslation"("language");
ALTER TABLE "QuestionTranslation" ADD CONSTRAINT "QuestionTranslation_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

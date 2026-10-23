-- AlterTable
ALTER TABLE "UserWork" ADD COLUMN     "finishedAt" TIMESTAMP(3);

-- Books already marked Finished: their most recent reading session is the best evidence of
-- when; books with no sessions stay unknown.
UPDATE "UserWork" uw
SET "finishedAt" = s."lastEnd"
FROM (
  SELECT j."userId", j."workId", MAX(rs."endTime") AS "lastEnd"
  FROM "ReadingJourney" j
  JOIN "ReadingSession" rs ON rs."journeyId" = j.id
  WHERE rs."endTime" IS NOT NULL
  GROUP BY j."userId", j."workId"
) s
WHERE uw."status" = 'FINISHED' AND uw."userId" = s."userId" AND uw."workId" = s."workId";

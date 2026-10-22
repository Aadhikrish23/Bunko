-- Least-privilege database role for ai-service (ARCHITECTURE.md §8).
-- Run once as a database owner, after `prisma migrate deploy`, supplying the
-- password at run time so it never lives in git:
--
--   psql "$DATABASE_URL" -v ai_password="$AI_DB_PASSWORD" -f ai-service/scripts/create_ai_role.sql
--
-- ai-service can read only the content its features need, and can write
-- only to its own embedding table.

SELECT format('CREATE ROLE bunko_ai LOGIN PASSWORD %L', :'ai_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bunko_ai')
\gexec

ALTER ROLE bunko_ai PASSWORD :'ai_password';

GRANT USAGE ON SCHEMA public TO bunko_ai;
GRANT SELECT ON
  "Annotation", "Note", "Review", "Work", "WorkAuthor", "Author",
  "UserWork", "Copy", "Edition", "ReadingSession", "ReadingJourney",
  "Shelf", "ShelfWork"
TO bunko_ai;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiEmbedding" TO bunko_ai;

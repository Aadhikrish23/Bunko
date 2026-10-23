-- Book search used to fill in "Japanese" as the original language whenever a catalogue
-- didn't say (R3-03). Clear it where it can't be right: the edition isn't Japanese and the
-- title has no Japanese script. A genuinely Japanese original caught by this shows no
-- original language rather than a wrong one.
UPDATE "Work"
SET "originalLanguage" = NULL
WHERE "originalLanguage" = 'Japanese'
  AND COALESCE("language", '') <> 'Japanese'
  AND "title" !~ '[぀-ヿ一-鿿]';

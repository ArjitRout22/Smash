-- Add a readable, unique slug for public tournament URLs (/t/<slug>).

-- 1) Add the column (nullable so the backfill can populate it before the index).
ALTER TABLE "Tournament" ADD COLUMN "slug" TEXT;

-- 2) Backfill from the tournament name: lowercase, non-alphanumerics -> "-",
--    trimmed; empty results become "tournament". De-duplicate by appending a
--    numeric suffix to all but the first row sharing a base slug.
WITH base AS (
  SELECT
    id,
    trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) AS s0
  FROM "Tournament"
),
normalized AS (
  SELECT id, CASE WHEN s0 IS NULL OR s0 = '' THEN 'tournament' ELSE s0 END AS s
  FROM base
),
ranked AS (
  SELECT id, s, row_number() OVER (PARTITION BY s ORDER BY id) AS rn
  FROM normalized
)
UPDATE "Tournament" t
SET "slug" = CASE WHEN r.rn = 1 THEN r.s ELSE r.s || '-' || r.rn END
FROM ranked r
WHERE t.id = r.id;

-- 3) Enforce uniqueness now that every row has a distinct slug.
CREATE UNIQUE INDEX "Tournament_slug_key" ON "Tournament"("slug");

-- Fix schema drift on "Incident": openedAt/slaDueAt were TIMESTAMPTZ
-- (WITH time zone) while every sibling date column (createdAt, updatedAt,
-- resolvedAt, closedAt) is plain TIMESTAMP(3) -- the original 0_init
-- migration declared all six identically as TIMESTAMP(3), matching
-- schema.prisma's DateTime fields (none of which carry @db.Timestamptz),
-- so this drifted away via an out-of-band ALTER TABLE at some point rather
-- than a tracked migration.
--
-- The mixed types are a live landmine: Postgres implicitly interprets the
-- naive side of any comparison/subtraction between a timestamptz column and
-- a plain timestamp column using the session's `timezone` GUC
-- (America/Mexico_City on this instance) rather than UTC. That silently
-- produced nonsensical negative "resolution time" values in real queries --
-- observed live via the SRE Assistant computing -11,699,252 seconds for
-- INC0000003's (resolvedAt - openedAt).
--
-- `AT TIME ZONE 'UTC'` (not a bare ::timestamp cast, which would convert
-- through the session timezone instead) converts each column to the naive
-- UTC wall-clock instant it actually represents, matching the convention
-- every other column on this table already uses.
ALTER TABLE "Incident"
  ALTER COLUMN "openedAt" TYPE TIMESTAMP(3) USING ("openedAt" AT TIME ZONE 'UTC'),
  ALTER COLUMN "slaDueAt" TYPE TIMESTAMP(3) USING ("slaDueAt" AT TIME ZONE 'UTC');

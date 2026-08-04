-- GuardianX — Patch lineage + attestation enhancements
-- Run in Supabase SQL Editor
--
-- Adds the `supersedes` column to Patch so a new patch can declare that it
-- supersedes an earlier (now-bypassed) patch. Used by the enhanced
-- auto-remediation pipeline to build a "Patch v1 → bypassed → Patch v2"
-- lineage timeline.
--
-- Also adds the `language` column (target language of the patch — drives
-- multi-language secure-coding guidance) and `patchExplanation` (structured
-- JSON with CWE-ID, fix strategy, behavior change) + `confidenceBreakdown`
-- (JSON breakdown of the 0..100 confidence score).

ALTER TABLE "Patch" ADD COLUMN IF NOT EXISTS "supersedes" TEXT;
ALTER TABLE "Patch" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'javascript';
ALTER TABLE "Patch" ADD COLUMN IF NOT EXISTS "patchExplanation" TEXT;
ALTER TABLE "Patch" ADD COLUMN IF NOT EXISTS "confidenceBreakdown" TEXT;
ALTER TABLE "Patch" ADD COLUMN IF NOT EXISTS "multiVectorSandbox" TEXT;

-- Grant permissions (same as previous migrations)
GRANT ALL ON "Patch" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Patch" TO anon, authenticated;

-- Index for lineage lookups (find all patches superseding a given one)
CREATE INDEX IF NOT EXISTS "Patch_supersedes_idx" ON "Patch" ("supersedes");

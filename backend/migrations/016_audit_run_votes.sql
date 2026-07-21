-- Migration 016: Audit Run Votes
-- Adds audit_run_id to votes table to track votes per audit run.
-- Run manually in Supabase SQL editor.

-- 1. Add audit_run_id column to votes table
ALTER TABLE votes 
ADD COLUMN IF NOT EXISTS audit_run_id UUID REFERENCES audit_runs(id) ON DELETE CASCADE;

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_votes_audit_run_id ON votes(audit_run_id);

-- 3. Drop old unique constraint
ALTER TABLE votes DROP CONSTRAINT IF EXISTS uq_votes_building_anonymous;

-- 4. Backfill existing votes: set audit_run_id to primary/first audit_run of that building
UPDATE votes v 
SET audit_run_id = (
    SELECT id FROM audit_runs ar 
    WHERE ar.building_id = v.building_id 
    ORDER BY created_at ASC 
    LIMIT 1
) 
WHERE v.audit_run_id IS NULL;

-- 5. Delete duplicate (audit_run_id, anonymous_id) pairs if any after backfill
DELETE FROM votes v1 USING votes v2
WHERE v1.id < v2.id
  AND v1.audit_run_id IS NOT NULL
  AND v1.audit_run_id = v2.audit_run_id
  AND v1.anonymous_id = v2.anonymous_id;

-- 6. Add new unique constraint for audit_run_id and anonymous_id
ALTER TABLE votes 
ADD CONSTRAINT uq_votes_audit_run_anonymous UNIQUE (audit_run_id, anonymous_id);

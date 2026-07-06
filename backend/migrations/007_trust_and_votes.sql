-- Migration 007: Trust and Votes

-- 1. Add columns to buildings table
ALTER TABLE buildings 
ADD COLUMN IF NOT EXISTS trust_status TEXT NOT NULL DEFAULT 'neutral' CONSTRAINT chk_trust_status CHECK (trust_status IN ('neutral', 'trusted', 'doubtful', 'reported')),
ADD COLUMN IF NOT EXISTS manually_set_by_admin BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS trust_score_cache DOUBLE PRECISION DEFAULT NULL,
ADD COLUMN IF NOT EXISTS vote_count_cache INTEGER NOT NULL DEFAULT 0;

-- 2. Create votes table
CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    anonymous_id TEXT NOT NULL,
    vote_type TEXT NOT NULL CONSTRAINT chk_vote_type CHECK (vote_type IN ('up', 'down')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_votes_building_anonymous UNIQUE (building_id, anonymous_id)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_votes_building_id ON votes(building_id);
CREATE INDEX IF NOT EXISTS idx_votes_anonymous_id ON votes(anonymous_id);

-- 3. Create building_reports table
CREATE TABLE IF NOT EXISTS building_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    anonymous_id TEXT NOT NULL,
    reporter_ip_hash TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_building_reports_building_id ON building_reports(building_id);
CREATE INDEX IF NOT EXISTS idx_building_reports_anonymous_id ON building_reports(anonymous_id);

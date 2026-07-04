-- Enable UUID extension if not already enabled (Supabase usually has this active)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Table: buildings
CREATE TABLE IF NOT EXISTS buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Table: audit_criteria
CREATE TABLE IF NOT EXISTS audit_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    category TEXT NOT NULL
);

-- 3. Table: audit_results
CREATE TABLE IF NOT EXISTS audit_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    criteria_id UUID NOT NULL REFERENCES audit_criteria(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('met', 'not_met', 'unknown', 'na')),
    source_agent TEXT NOT NULL,
    evidence_url TEXT,
    reasoning TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Table: annotations
CREATE TABLE IF NOT EXISTS annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    audit_result_id UUID REFERENCES audit_results(id) ON DELETE SET NULL,
    label TEXT NOT NULL,
    pitch DOUBLE PRECISION NOT NULL,
    yaw DOUBLE PRECISION NOT NULL,
    photo_url TEXT NOT NULL
);

-- Create Indexes for Foreign Key Columns to Optimize Query Performance
CREATE INDEX IF NOT EXISTS idx_audit_results_building_id ON audit_results(building_id);
CREATE INDEX IF NOT EXISTS idx_audit_results_criteria_id ON audit_results(criteria_id);
CREATE INDEX IF NOT EXISTS idx_annotations_building_id ON annotations(building_id);
CREATE INDEX IF NOT EXISTS idx_annotations_audit_result_id ON annotations(audit_result_id);

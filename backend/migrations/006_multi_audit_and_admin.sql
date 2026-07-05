-- Migration 006: Multi Audit and Admin

-- 1. Table: audit_runs
CREATE TABLE IF NOT EXISTS audit_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    contributor_name TEXT,
    gps_mismatch BOOLEAN NOT NULL DEFAULT false,
    gps_distance_meters DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Modify table: audit_results
ALTER TABLE audit_results 
ADD COLUMN IF NOT EXISTS audit_run_id UUID REFERENCES audit_runs(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_audit_results_audit_run_id ON audit_results(audit_run_id);

-- 3. Table: reports
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_result_id UUID NOT NULL REFERENCES audit_results(id) ON DELETE CASCADE,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'open' CONSTRAINT chk_report_status CHECK (status IN ('open', 'resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_reports_audit_result_id ON reports(audit_result_id);

-- 4. Table: admins
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration 013: Add photos to audit_runs table
ALTER TABLE audit_runs ADD COLUMN IF NOT EXISTS photos TEXT[];

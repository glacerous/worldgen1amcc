-- Migration 012: Audit Edit History

CREATE TABLE IF NOT EXISTS audit_run_edit_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_run_id UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
    previous_results_snapshot JSONB NOT NULL,
    edited_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for query performance
CREATE INDEX IF NOT EXISTS idx_audit_run_edit_history_run_id ON audit_run_edit_history(audit_run_id);

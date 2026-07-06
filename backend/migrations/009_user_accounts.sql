-- Migration 009: User Accounts

-- 1. Create table: users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add user_id column to audit_runs table
ALTER TABLE audit_runs 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 3. Add owner_user_id column to buildings table
ALTER TABLE buildings 
ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 4. Create indexes for the new foreign key columns
CREATE INDEX IF NOT EXISTS idx_audit_runs_user_id ON audit_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_buildings_owner_user_id ON buildings(owner_user_id);

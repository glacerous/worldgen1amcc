-- 1. Add status column to buildings table with default 'pending' and check constraint
ALTER TABLE buildings 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
CONSTRAINT chk_building_status CHECK (status IN ('pending', 'approved'));

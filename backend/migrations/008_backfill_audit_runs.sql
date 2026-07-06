-- Migration 008: Backfill Audit Runs (Data Migration)

DO $$
DECLARE
    r RECORD;
    new_run_id UUID;
    earliest_time TIMESTAMPTZ;
BEGIN
    -- Loop through each building that has audit_results with NULL audit_run_id
    FOR r IN 
        SELECT DISTINCT building_id 
        FROM audit_results 
        WHERE audit_run_id IS NULL
    LOOP
        -- Find the earliest created_at for this building's audit results with NULL audit_run_id
        SELECT MIN(created_at) INTO earliest_time 
        FROM audit_results 
        WHERE building_id = r.building_id AND audit_run_id IS NULL;
        
        -- Insert a new row in audit_runs
        INSERT INTO audit_runs (building_id, contributor_name, gps_mismatch, gps_distance_meters, created_at)
        VALUES (r.building_id, 'Data Migrasi Awal', false, NULL, COALESCE(earliest_time, NOW()))
        RETURNING id INTO new_run_id;
        
        -- Update the matching audit_results to point to the new audit_run_id
        UPDATE audit_results
        SET audit_run_id = new_run_id
        WHERE building_id = r.building_id AND audit_run_id IS NULL;
    END LOOP;
END $$;

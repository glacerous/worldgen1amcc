-- Migration to add scenes and update annotations mapping
CREATE TABLE IF NOT EXISTS scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'panorama_360' CHECK (type IN ('panorama_360', 'gaussian_splat')),
    file_url TEXT NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Drop old annotations table
DROP TABLE IF EXISTS annotations;

-- Recreate annotations table bound to scenes
CREATE TABLE IF NOT EXISTS annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    pitch DOUBLE PRECISION NOT NULL,
    yaw DOUBLE PRECISION NOT NULL,
    audit_result_id UUID REFERENCES audit_results(id) ON DELETE SET NULL
);

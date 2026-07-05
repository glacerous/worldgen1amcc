-- Migration 005: Add scene_links table to replace local JSON file storage
--
-- NAMING CONVENTION:
--   annotations  = "Penanda Info"      → marks accessibility features on a single panorama
--                                         (ramp, toilet, etc.), linked to audit_result_id
--   scene_links  = "Penanda Navigasi"  → navigation links between panoramas for virtual tour
--                                         (like Matterport), linked to source/target scene IDs
--
-- These are two DIFFERENT concepts. Do NOT confuse them.

CREATE TABLE IF NOT EXISTS scene_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    target_scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    pitch DOUBLE PRECISION NOT NULL,
    yaw DOUBLE PRECISION NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookup by source and target scene
CREATE INDEX IF NOT EXISTS idx_scene_links_source_scene_id ON scene_links(source_scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_links_target_scene_id ON scene_links(target_scene_id);

-- Migration 014: API Keys for Public API Feature
-- Creates api_keys and api_key_usage_log tables.
-- Run manually in Supabase SQL editor. DO NOT execute via migration script.

-- ─────────────────────────────────────────────────────────────────────────────
-- Table: api_keys
-- Stores one API key per user, with tier (free/pro) and rate limit config.
-- UNIQUE on user_id enforces one-key-per-user policy at DB level.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    api_key             TEXT        UNIQUE NOT NULL,
    tier                TEXT        NOT NULL DEFAULT 'free'
                                    CONSTRAINT chk_api_keys_tier CHECK (tier IN ('free', 'pro')),
    rate_limit_per_day  INT         NOT NULL DEFAULT 100,
    pro_requested_at    TIMESTAMPTZ,
    pro_approved_at     TIMESTAMPTZ,
    pro_approved_by     TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: fast lookup by api_key value (used on every authenticated request)
CREATE INDEX IF NOT EXISTS idx_api_keys_api_key  ON api_keys(api_key);

-- Index: fast lookup by user_id (used on dashboard / key management pages)
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id  ON api_keys(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Table: api_key_usage_log
-- Append-only log of every API call made with a given key.
-- Used for rate-limit enforcement and usage analytics.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_key_usage_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id  UUID        REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint    TEXT        NOT NULL,
    called_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: composite index for rate-limit queries
-- (count calls by key within a time window, e.g. last 24 hours)
CREATE INDEX IF NOT EXISTS idx_api_key_usage_log_key_time
    ON api_key_usage_log(api_key_id, called_at);

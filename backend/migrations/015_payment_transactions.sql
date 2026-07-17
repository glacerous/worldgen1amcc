-- Migration 015: Payment Transactions
-- Creates payment_transactions table and adds pro_expires_at column to api_keys.
-- Run manually in Supabase SQL editor. DO NOT execute via migration script.

-- Add pro_expires_at column to api_keys if it doesn't already exist
ALTER TABLE api_keys 
ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ;

-- Create payment_transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    external_id TEXT UNIQUE NOT NULL,
    xendit_invoice_id TEXT,
    amount INT NOT NULL DEFAULT 49000,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'failed')),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: lookup by api_key_id
CREATE INDEX IF NOT EXISTS idx_payment_transactions_api_key_id ON payment_transactions(api_key_id);

-- Index: lookup by external_id
CREATE INDEX IF NOT EXISTS idx_payment_transactions_external_id ON payment_transactions(external_id);

-- Index: lookup by xendit_invoice_id (useful for webhooks/callbacks)
CREATE INDEX IF NOT EXISTS idx_payment_transactions_xendit_invoice_id ON payment_transactions(xendit_invoice_id);

-- Additive delivery tracking. Existing publishers can continue GET + ACK unchanged.
ALTER TABLE command_queue ADD COLUMN received_at TEXT;
ALTER TABLE command_queue ADD COLUMN lease_token TEXT;
ALTER TABLE command_queue ADD COLUMN lease_expires_at TEXT;
ALTER TABLE command_queue ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0);
ALTER TABLE command_queue ADD COLUMN next_attempt_at TEXT;
ALTER TABLE command_queue ADD COLUMN error_code TEXT;
CREATE INDEX IF NOT EXISTS command_queue_lease_idx ON command_queue(state, lease_expires_at);

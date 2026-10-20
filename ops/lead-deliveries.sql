-- Additive, explicit release step; no push/migrate of the application schema.
-- Back up the database first. Leave this table in place on application rollback.
CREATE TABLE IF NOT EXISTS lead_deliveries (
  lead_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  payload JSON NOT NULL,
  state ENUM('pending', 'delivered', 'blocked') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token VARCHAR(36) NULL,
  lease_until TIMESTAMP NULL,
  last_error VARCHAR(40) NULL,
  delivered_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX lead_deliveries_due_idx (state, next_attempt_at)
);

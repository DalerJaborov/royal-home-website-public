-- Preserve existing values; allow a genuinely unknown market type.
SET NAMES utf8mb4;
ALTER TABLE listings
  MODIFY COLUMN type ENUM('Новостройки', 'Вторичка') NULL DEFAULT NULL,
  MODIFY COLUMN stage VARCHAR(255) NULL DEFAULT NULL,
  MODIFY COLUMN repair VARCHAR(255) NULL DEFAULT NULL;

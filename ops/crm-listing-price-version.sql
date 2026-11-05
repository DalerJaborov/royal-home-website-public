-- Apply before deploying the versioned CRM listing receiver.
ALTER TABLE listings ADD COLUMN crm_price_version INT NULL;

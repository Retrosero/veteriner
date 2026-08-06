-- =============================================================================
-- W1.3: Bildirim altyapısı DB persistence.
-- Faz 2/13 — in-memory `InboxStore` ve `NotificationRecord` Map'leri DB'ye taşındı.
--
-- İş kuralları:
-- - `notifications`: tüm kanallardan (email/sms/in_app/whatsapp) gönderilen
--   bildirimlerin kalıcı kaydı. `idempotencyKey` ile duplicate gönderim
--   engellenir.
-- - `notification_consents`: kullanıcı bazlı kanal rıza kaydı (KVKK uyumlu).
-- - Append-only: fiziksel silme YOKTUR.
-- =============================================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  channel VARCHAR(20) NOT NULL,
  category VARCHAR(30) NOT NULL,
  template_key VARCHAR(100) NOT NULL,
  locale VARCHAR(10) NOT NULL DEFAULT 'tr-TR',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error VARCHAR(2000),
  rendered JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipient VARCHAR(200) NOT NULL,
  idempotency_key VARCHAR(200),
  read_at TIMESTAMPTZ(6),
  sent_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, idempotency_key)
);

CREATE INDEX notifications_tenant_user_created_idx ON notifications(tenant_id, user_id, created_at);
CREATE INDEX notifications_tenant_status_idx ON notifications(tenant_id, status);
CREATE INDEX notifications_tenant_channel_status_idx ON notifications(tenant_id, channel, status);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_tenant_isolation ON notifications
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));

-- ---------------------------------------------------------------------------

CREATE TABLE notification_consents (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  channel VARCHAR(20) NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, user_id, channel)
);

CREATE INDEX notification_consents_tenant_user_idx ON notification_consents(tenant_id, user_id);

ALTER TABLE notification_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_consents_tenant_isolation ON notification_consents
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));

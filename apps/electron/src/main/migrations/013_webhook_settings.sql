-- Configurações do canal de alertas via webhook (POST JSON para uma URL
-- configurável), alternativa/complemento ao e-mail SMTP já existente.

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('webhook_enabled', 'false'),
  ('webhook_url', '');

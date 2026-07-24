-- Configurações SMTP usadas para envio de alertas por e-mail.

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('smtp_enabled', 'false'),
  ('smtp_host', ''),
  ('smtp_port', '587'),
  ('smtp_secure', 'false'),
  ('smtp_user', ''),
  ('smtp_pass', ''),
  ('smtp_from', ''),
  ('smtp_to', '');

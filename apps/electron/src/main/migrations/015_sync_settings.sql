-- Sincronização entre dispositivos via arquivo .fin numa pasta gerenciada
-- por um serviço de nuvem próprio do usuário (Dropbox, Google Drive etc.).

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('sync_enabled', 'false'),
  ('sync_folder', '');

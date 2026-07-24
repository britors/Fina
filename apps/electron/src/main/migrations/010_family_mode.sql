-- Base para modo família/casal: membros em settings e responsável por transação.

ALTER TABLE transactions ADD COLUMN owner TEXT;

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('family_mode', 'false'),
  ('family_members', '');

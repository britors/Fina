-- Pareamento com o app mobile (Android): cada linha é um celular autorizado
-- a enviar lançamentos via rede local, autenticado pela chave pública gerada
-- no pareamento (QR + código de confirmação). Fica de fora do sync
-- desktop-desktop de propósito — é estado de segurança local deste PC, não
-- deve viajar em backups incrementais nem no patch entre desktops.
CREATE TABLE IF NOT EXISTS paired_devices (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  public_key  TEXT NOT NULL,
  owner       TEXT,
  paired_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_sync_at TEXT,
  revoked_at  TEXT
);

-- Rastreiam a origem de um lançamento criado pelo celular, para atribuir
-- (owner) e para idempotência: reenviar o mesmo client_id (gerado na fila
-- local do app mobile) nunca duplica a transação.
ALTER TABLE transactions ADD COLUMN mobile_device_id TEXT;
ALTER TABLE transactions ADD COLUMN mobile_client_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_mobile_origin
  ON transactions (mobile_device_id, mobile_client_id)
  WHERE mobile_device_id IS NOT NULL AND mobile_client_id IS NOT NULL;

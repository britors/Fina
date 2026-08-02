-- Mantém separado o saldo inicial convertido dos efeitos posteriores do
-- livro-caixa. Isso permite recalcular saldos sem copiar snapshots absolutos
-- de outro dispositivo e preserva contas em moeda estrangeira na atualização
-- cambial.
ALTER TABLE accounts ADD COLUMN opening_balance_brl REAL;
ALTER TABLE accounts ADD COLUMN remote_balance REAL;

-- Reconstrói a base histórica dos bancos existentes antes desta migration.
-- transaction_payments cobre lançamentos comuns; transferências e baixas
-- recorrentes não geram necessariamente uma transação própria.
UPDATE accounts
SET opening_balance_brl = ROUND(balance - (
  COALESCE((
    SELECT SUM(
      (CASE WHEN t.type = 'income' THEN p.amount ELSE -p.amount END)
      * CASE WHEN accounts.type = 'credit_card' THEN -1 ELSE 1 END
    )
    FROM transactions t
    JOIN transaction_payments p ON p.transaction_id = t.id
    WHERE t.status = 'confirmed' AND t.type != 'transfer' AND p.account_id = accounts.id
  ), 0)
  + COALESCE((
    SELECT SUM(CASE
      WHEN t.account_id = accounts.id THEN -t.amount
      WHEN t.to_account_id = accounts.id THEN t.amount
      ELSE 0
    END)
    FROM transactions t
    WHERE t.status = 'confirmed' AND t.type = 'transfer'
      AND (t.account_id = accounts.id OR t.to_account_id = accounts.id)
  ), 0)
  + COALESCE((
    SELECT SUM(-p.amount * CASE WHEN accounts.type = 'credit_card' THEN -1 ELSE 1 END)
    FROM bills b
    JOIN bill_payments p ON p.bill_id = b.id
    WHERE b.status = 'paid' AND b.recurring = 1 AND p.account_id = accounts.id
  ), 0)
  + COALESCE((
    SELECT SUM(p.amount * CASE WHEN accounts.type = 'credit_card' THEN -1 ELSE 1 END)
    FROM receivables r
    JOIN receivable_payments p ON p.receivable_id = r.id
    WHERE r.status = 'received' AND r.recurring = 1 AND p.account_id = accounts.id
  ), 0)
), 2)
WHERE opening_balance_brl IS NULL;

-- Para contas conectadas, o saldo remoto passa a ser a base contra a qual
-- preservamos ajustes manuais locais nas próximas sincronizações.
UPDATE accounts
SET remote_balance = balance
WHERE openfinance_provider IS NOT NULL AND remote_balance IS NULL;

CREATE TRIGGER IF NOT EXISTS incremental_tombstone_openfinance_connections
AFTER DELETE ON openfinance_connections BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'openfinance_connections', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_pix_payments
AFTER DELETE ON pix_payments BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'pix_payments', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_pix_recipients
AFTER DELETE ON pix_recipients BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'pix_recipients', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_financial_documents
AFTER DELETE ON financial_documents BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'financial_documents', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_ai_conversations
AFTER DELETE ON ai_conversations BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'ai_conversations', OLD.id, datetime('now'));
END;

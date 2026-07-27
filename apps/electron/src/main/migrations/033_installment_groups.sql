-- Agrupamento de parcelas geradas por transactions:createInstallments. Antes,
-- as parcelas só eram ligadas por um padrão de texto na descrição ("(i/n)"),
-- frágil demais para somar o comprometimento futuro de parcelas com confiança.
ALTER TABLE transactions ADD COLUMN installment_group_id TEXT;
ALTER TABLE transactions ADD COLUMN installment_index INTEGER;
ALTER TABLE transactions ADD COLUMN installment_total INTEGER;

CREATE INDEX IF NOT EXISTS idx_transactions_installment_group ON transactions(installment_group_id);

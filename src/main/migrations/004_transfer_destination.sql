-- Transferências entre contas precisam de uma conta de destino para que o
-- dinheiro debitado da conta de origem seja efetivamente creditado em algum
-- lugar, em vez de simplesmente desaparecer do saldo total.
ALTER TABLE transactions ADD COLUMN to_account_id TEXT REFERENCES accounts(id);

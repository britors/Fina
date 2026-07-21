-- Permite marcar um meio de pagamento (conta corrente ou cartão de crédito) como pago via Pix.

ALTER TABLE transaction_payments ADD COLUMN is_pix INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bill_payments ADD COLUMN is_pix INTEGER NOT NULL DEFAULT 0;

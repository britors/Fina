-- Vales passam a guardar diretamente o valor disponível para gastar.
-- Antes, balance era o total já gasto e credit_limit era o saldo inicial.
UPDATE accounts
SET balance = CASE
  WHEN credit_limit IS NOT NULL THEN ROUND(credit_limit - balance, 2)
  ELSE balance
END,
    updated_at = datetime('now')
WHERE type IN ('meal_voucher', 'food_voucher');

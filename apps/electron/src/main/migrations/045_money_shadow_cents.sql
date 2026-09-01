-- Etapa reversível da migração monetária: preserva as colunas REAL e cria
-- sombras INTEGER. O runner executa auditoria e backup consistente antes de
-- iniciar esta transação. Triggers mantêm leitores/escritores v1 e v2 iguais.

ALTER TABLE "accounts" ADD COLUMN "balance_cents" INTEGER;
ALTER TABLE "accounts" ADD COLUMN "credit_limit_cents" INTEGER;
ALTER TABLE "accounts" ADD COLUMN "original_balance_cents" INTEGER;
ALTER TABLE "accounts" ADD COLUMN "opening_balance_brl_cents" INTEGER;
ALTER TABLE "accounts" ADD COLUMN "remote_balance_cents" INTEGER;
ALTER TABLE "transactions" ADD COLUMN "amount_cents" INTEGER;
ALTER TABLE "budgets" ADD COLUMN "limit_amount_cents" INTEGER;
ALTER TABLE "bills" ADD COLUMN "amount_cents" INTEGER;
ALTER TABLE "assets" ADD COLUMN "acquisition_value_cents" INTEGER;
ALTER TABLE "assets" ADD COLUMN "current_value_cents" INTEGER;
ALTER TABLE "investments" ADD COLUMN "applied_amount_cents" INTEGER;
ALTER TABLE "investments" ADD COLUMN "current_value_cents" INTEGER;
ALTER TABLE "goals" ADD COLUMN "target_amount_cents" INTEGER;
ALTER TABLE "goals" ADD COLUMN "current_amount_cents" INTEGER;
ALTER TABLE "debts" ADD COLUMN "original_amount_cents" INTEGER;
ALTER TABLE "debts" ADD COLUMN "outstanding_balance_cents" INTEGER;
ALTER TABLE "debts" ADD COLUMN "installment_amount_cents" INTEGER;
ALTER TABLE "transaction_payments" ADD COLUMN "amount_cents" INTEGER;
ALTER TABLE "bill_payments" ADD COLUMN "amount_cents" INTEGER;
ALTER TABLE "bill_price_history" ADD COLUMN "amount_cents" INTEGER;
ALTER TABLE "account_balance_snapshots" ADD COLUMN "balance_cents" INTEGER;
ALTER TABLE "pix_payments" ADD COLUMN "amount_cents" INTEGER;
ALTER TABLE "credit_card_invoices" ADD COLUMN "amount_cents" INTEGER;
ALTER TABLE "receivables" ADD COLUMN "amount_cents" INTEGER;
ALTER TABLE "receivable_payments" ADD COLUMN "amount_cents" INTEGER;
ALTER TABLE "receivable_price_history" ADD COLUMN "amount_cents" INTEGER;
ALTER TABLE "transaction_categories" ADD COLUMN "amount_cents" INTEGER;
ALTER TABLE "bill_categories" ADD COLUMN "amount_cents" INTEGER;
ALTER TABLE "receivable_categories" ADD COLUMN "amount_cents" INTEGER;
ALTER TABLE "transaction_member_splits" ADD COLUMN "share_amount_cents" INTEGER;
ALTER TABLE "goal_contributions" ADD COLUMN "amount_cents" INTEGER;
ALTER TABLE "investment_operations" ADD COLUMN "fees_cents" INTEGER;
ALTER TABLE "mei_das_payments" ADD COLUMN "amount_cents" INTEGER;

UPDATE "accounts" SET "balance_cents" = CAST(ROUND("balance" * 100) AS INTEGER), "credit_limit_cents" = CAST(ROUND("credit_limit" * 100) AS INTEGER), "original_balance_cents" = CAST(ROUND("original_balance" * 100) AS INTEGER), "opening_balance_brl_cents" = CAST(ROUND("opening_balance_brl" * 100) AS INTEGER), "remote_balance_cents" = CAST(ROUND("remote_balance" * 100) AS INTEGER);
UPDATE "transactions" SET "amount_cents" = CAST(ROUND("amount" * 100) AS INTEGER);
UPDATE "budgets" SET "limit_amount_cents" = CAST(ROUND("limit_amount" * 100) AS INTEGER);
UPDATE "bills" SET "amount_cents" = CAST(ROUND("amount" * 100) AS INTEGER);
UPDATE "assets" SET "acquisition_value_cents" = CAST(ROUND("acquisition_value" * 100) AS INTEGER), "current_value_cents" = CAST(ROUND("current_value" * 100) AS INTEGER);
UPDATE "investments" SET "applied_amount_cents" = CAST(ROUND("applied_amount" * 100) AS INTEGER), "current_value_cents" = CAST(ROUND("current_value" * 100) AS INTEGER);
UPDATE "goals" SET "target_amount_cents" = CAST(ROUND("target_amount" * 100) AS INTEGER), "current_amount_cents" = CAST(ROUND("current_amount" * 100) AS INTEGER);
UPDATE "debts" SET "original_amount_cents" = CAST(ROUND("original_amount" * 100) AS INTEGER), "outstanding_balance_cents" = CAST(ROUND("outstanding_balance" * 100) AS INTEGER), "installment_amount_cents" = CAST(ROUND("installment_amount" * 100) AS INTEGER);
UPDATE "transaction_payments" SET "amount_cents" = CAST(ROUND("amount" * 100) AS INTEGER);
UPDATE "bill_payments" SET "amount_cents" = CAST(ROUND("amount" * 100) AS INTEGER);
UPDATE "bill_price_history" SET "amount_cents" = CAST(ROUND("amount" * 100) AS INTEGER);
UPDATE "account_balance_snapshots" SET "balance_cents" = CAST(ROUND("balance" * 100) AS INTEGER);
UPDATE "pix_payments" SET "amount_cents" = CAST(ROUND("amount" * 100) AS INTEGER);
UPDATE "credit_card_invoices" SET "amount_cents" = CAST(ROUND("amount" * 100) AS INTEGER);
UPDATE "receivables" SET "amount_cents" = CAST(ROUND("amount" * 100) AS INTEGER);
UPDATE "receivable_payments" SET "amount_cents" = CAST(ROUND("amount" * 100) AS INTEGER);
UPDATE "receivable_price_history" SET "amount_cents" = CAST(ROUND("amount" * 100) AS INTEGER);
UPDATE "transaction_categories" SET "amount_cents" = CAST(ROUND("amount" * 100) AS INTEGER);
UPDATE "bill_categories" SET "amount_cents" = CAST(ROUND("amount" * 100) AS INTEGER);
UPDATE "receivable_categories" SET "amount_cents" = CAST(ROUND("amount" * 100) AS INTEGER);
UPDATE "transaction_member_splits" SET "share_amount_cents" = CAST(ROUND("share_amount" * 100) AS INTEGER);
UPDATE "goal_contributions" SET "amount_cents" = CAST(ROUND("amount" * 100) AS INTEGER);
UPDATE "investment_operations" SET "fees_cents" = CAST(ROUND("fees" * 100) AS INTEGER);
UPDATE "mei_das_payments" SET "amount_cents" = CAST(ROUND("amount" * 100) AS INTEGER);

CREATE TABLE "_money_shadow_guard" (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "accounts" WHERE "balance_cents" IS NOT CAST(ROUND("balance" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "accounts" WHERE "credit_limit_cents" IS NOT CAST(ROUND("credit_limit" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "accounts" WHERE "original_balance_cents" IS NOT CAST(ROUND("original_balance" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "accounts" WHERE "opening_balance_brl_cents" IS NOT CAST(ROUND("opening_balance_brl" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "accounts" WHERE "remote_balance_cents" IS NOT CAST(ROUND("remote_balance" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "transactions" WHERE "amount_cents" IS NOT CAST(ROUND("amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "budgets" WHERE "limit_amount_cents" IS NOT CAST(ROUND("limit_amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "bills" WHERE "amount_cents" IS NOT CAST(ROUND("amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "assets" WHERE "acquisition_value_cents" IS NOT CAST(ROUND("acquisition_value" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "assets" WHERE "current_value_cents" IS NOT CAST(ROUND("current_value" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "investments" WHERE "applied_amount_cents" IS NOT CAST(ROUND("applied_amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "investments" WHERE "current_value_cents" IS NOT CAST(ROUND("current_value" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "goals" WHERE "target_amount_cents" IS NOT CAST(ROUND("target_amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "goals" WHERE "current_amount_cents" IS NOT CAST(ROUND("current_amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "debts" WHERE "original_amount_cents" IS NOT CAST(ROUND("original_amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "debts" WHERE "outstanding_balance_cents" IS NOT CAST(ROUND("outstanding_balance" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "debts" WHERE "installment_amount_cents" IS NOT CAST(ROUND("installment_amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "transaction_payments" WHERE "amount_cents" IS NOT CAST(ROUND("amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "bill_payments" WHERE "amount_cents" IS NOT CAST(ROUND("amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "bill_price_history" WHERE "amount_cents" IS NOT CAST(ROUND("amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "account_balance_snapshots" WHERE "balance_cents" IS NOT CAST(ROUND("balance" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "pix_payments" WHERE "amount_cents" IS NOT CAST(ROUND("amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "credit_card_invoices" WHERE "amount_cents" IS NOT CAST(ROUND("amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "receivables" WHERE "amount_cents" IS NOT CAST(ROUND("amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "receivable_payments" WHERE "amount_cents" IS NOT CAST(ROUND("amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "receivable_price_history" WHERE "amount_cents" IS NOT CAST(ROUND("amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "transaction_categories" WHERE "amount_cents" IS NOT CAST(ROUND("amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "bill_categories" WHERE "amount_cents" IS NOT CAST(ROUND("amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "receivable_categories" WHERE "amount_cents" IS NOT CAST(ROUND("amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "transaction_member_splits" WHERE "share_amount_cents" IS NOT CAST(ROUND("share_amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "goal_contributions" WHERE "amount_cents" IS NOT CAST(ROUND("amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "investment_operations" WHERE "fees_cents" IS NOT CAST(ROUND("fees" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
INSERT INTO "_money_shadow_guard" (ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM "mei_das_payments" WHERE "amount_cents" IS NOT CAST(ROUND("amount" * 100) AS INTEGER)
) THEN 0 ELSE 1 END;
DROP TABLE "_money_shadow_guard";

CREATE TRIGGER "money_shadow_accounts_insert"
AFTER INSERT ON "accounts"
BEGIN
  UPDATE "accounts" SET "balance_cents" = CAST(ROUND(NEW."balance" * 100) AS INTEGER), "credit_limit_cents" = CAST(ROUND(NEW."credit_limit" * 100) AS INTEGER), "original_balance_cents" = CAST(ROUND(NEW."original_balance" * 100) AS INTEGER), "opening_balance_brl_cents" = CAST(ROUND(NEW."opening_balance_brl" * 100) AS INTEGER), "remote_balance_cents" = CAST(ROUND(NEW."remote_balance" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_accounts_from_decimal"
AFTER UPDATE OF "balance", "credit_limit", "original_balance", "opening_balance_brl", "remote_balance" ON "accounts"
WHEN NEW."balance_cents" IS NOT CAST(ROUND(NEW."balance" * 100) AS INTEGER) OR NEW."credit_limit_cents" IS NOT CAST(ROUND(NEW."credit_limit" * 100) AS INTEGER) OR NEW."original_balance_cents" IS NOT CAST(ROUND(NEW."original_balance" * 100) AS INTEGER) OR NEW."opening_balance_brl_cents" IS NOT CAST(ROUND(NEW."opening_balance_brl" * 100) AS INTEGER) OR NEW."remote_balance_cents" IS NOT CAST(ROUND(NEW."remote_balance" * 100) AS INTEGER)
BEGIN
  UPDATE "accounts" SET "balance_cents" = CAST(ROUND(NEW."balance" * 100) AS INTEGER), "credit_limit_cents" = CAST(ROUND(NEW."credit_limit" * 100) AS INTEGER), "original_balance_cents" = CAST(ROUND(NEW."original_balance" * 100) AS INTEGER), "opening_balance_brl_cents" = CAST(ROUND(NEW."opening_balance_brl" * 100) AS INTEGER), "remote_balance_cents" = CAST(ROUND(NEW."remote_balance" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_accounts_from_cents"
AFTER UPDATE OF "balance_cents", "credit_limit_cents", "original_balance_cents", "opening_balance_brl_cents", "remote_balance_cents" ON "accounts"
WHEN NEW."balance" IS NOT NEW."balance_cents" / 100.0 OR NEW."credit_limit" IS NOT NEW."credit_limit_cents" / 100.0 OR NEW."original_balance" IS NOT NEW."original_balance_cents" / 100.0 OR NEW."opening_balance_brl" IS NOT NEW."opening_balance_brl_cents" / 100.0 OR NEW."remote_balance" IS NOT NEW."remote_balance_cents" / 100.0
BEGIN
  UPDATE "accounts" SET "balance" = NEW."balance_cents" / 100.0, "credit_limit" = NEW."credit_limit_cents" / 100.0, "original_balance" = NEW."original_balance_cents" / 100.0, "opening_balance_brl" = NEW."opening_balance_brl_cents" / 100.0, "remote_balance" = NEW."remote_balance_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_transactions_insert"
AFTER INSERT ON "transactions"
BEGIN
  UPDATE "transactions" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_transactions_from_decimal"
AFTER UPDATE OF "amount" ON "transactions"
WHEN NEW."amount_cents" IS NOT CAST(ROUND(NEW."amount" * 100) AS INTEGER)
BEGIN
  UPDATE "transactions" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_transactions_from_cents"
AFTER UPDATE OF "amount_cents" ON "transactions"
WHEN NEW."amount" IS NOT NEW."amount_cents" / 100.0
BEGIN
  UPDATE "transactions" SET "amount" = NEW."amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_budgets_insert"
AFTER INSERT ON "budgets"
BEGIN
  UPDATE "budgets" SET "limit_amount_cents" = CAST(ROUND(NEW."limit_amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_budgets_from_decimal"
AFTER UPDATE OF "limit_amount" ON "budgets"
WHEN NEW."limit_amount_cents" IS NOT CAST(ROUND(NEW."limit_amount" * 100) AS INTEGER)
BEGIN
  UPDATE "budgets" SET "limit_amount_cents" = CAST(ROUND(NEW."limit_amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_budgets_from_cents"
AFTER UPDATE OF "limit_amount_cents" ON "budgets"
WHEN NEW."limit_amount" IS NOT NEW."limit_amount_cents" / 100.0
BEGIN
  UPDATE "budgets" SET "limit_amount" = NEW."limit_amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_bills_insert"
AFTER INSERT ON "bills"
BEGIN
  UPDATE "bills" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_bills_from_decimal"
AFTER UPDATE OF "amount" ON "bills"
WHEN NEW."amount_cents" IS NOT CAST(ROUND(NEW."amount" * 100) AS INTEGER)
BEGIN
  UPDATE "bills" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_bills_from_cents"
AFTER UPDATE OF "amount_cents" ON "bills"
WHEN NEW."amount" IS NOT NEW."amount_cents" / 100.0
BEGIN
  UPDATE "bills" SET "amount" = NEW."amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_assets_insert"
AFTER INSERT ON "assets"
BEGIN
  UPDATE "assets" SET "acquisition_value_cents" = CAST(ROUND(NEW."acquisition_value" * 100) AS INTEGER), "current_value_cents" = CAST(ROUND(NEW."current_value" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_assets_from_decimal"
AFTER UPDATE OF "acquisition_value", "current_value" ON "assets"
WHEN NEW."acquisition_value_cents" IS NOT CAST(ROUND(NEW."acquisition_value" * 100) AS INTEGER) OR NEW."current_value_cents" IS NOT CAST(ROUND(NEW."current_value" * 100) AS INTEGER)
BEGIN
  UPDATE "assets" SET "acquisition_value_cents" = CAST(ROUND(NEW."acquisition_value" * 100) AS INTEGER), "current_value_cents" = CAST(ROUND(NEW."current_value" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_assets_from_cents"
AFTER UPDATE OF "acquisition_value_cents", "current_value_cents" ON "assets"
WHEN NEW."acquisition_value" IS NOT NEW."acquisition_value_cents" / 100.0 OR NEW."current_value" IS NOT NEW."current_value_cents" / 100.0
BEGIN
  UPDATE "assets" SET "acquisition_value" = NEW."acquisition_value_cents" / 100.0, "current_value" = NEW."current_value_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_investments_insert"
AFTER INSERT ON "investments"
BEGIN
  UPDATE "investments" SET "applied_amount_cents" = CAST(ROUND(NEW."applied_amount" * 100) AS INTEGER), "current_value_cents" = CAST(ROUND(NEW."current_value" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_investments_from_decimal"
AFTER UPDATE OF "applied_amount", "current_value" ON "investments"
WHEN NEW."applied_amount_cents" IS NOT CAST(ROUND(NEW."applied_amount" * 100) AS INTEGER) OR NEW."current_value_cents" IS NOT CAST(ROUND(NEW."current_value" * 100) AS INTEGER)
BEGIN
  UPDATE "investments" SET "applied_amount_cents" = CAST(ROUND(NEW."applied_amount" * 100) AS INTEGER), "current_value_cents" = CAST(ROUND(NEW."current_value" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_investments_from_cents"
AFTER UPDATE OF "applied_amount_cents", "current_value_cents" ON "investments"
WHEN NEW."applied_amount" IS NOT NEW."applied_amount_cents" / 100.0 OR NEW."current_value" IS NOT NEW."current_value_cents" / 100.0
BEGIN
  UPDATE "investments" SET "applied_amount" = NEW."applied_amount_cents" / 100.0, "current_value" = NEW."current_value_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_goals_insert"
AFTER INSERT ON "goals"
BEGIN
  UPDATE "goals" SET "target_amount_cents" = CAST(ROUND(NEW."target_amount" * 100) AS INTEGER), "current_amount_cents" = CAST(ROUND(NEW."current_amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_goals_from_decimal"
AFTER UPDATE OF "target_amount", "current_amount" ON "goals"
WHEN NEW."target_amount_cents" IS NOT CAST(ROUND(NEW."target_amount" * 100) AS INTEGER) OR NEW."current_amount_cents" IS NOT CAST(ROUND(NEW."current_amount" * 100) AS INTEGER)
BEGIN
  UPDATE "goals" SET "target_amount_cents" = CAST(ROUND(NEW."target_amount" * 100) AS INTEGER), "current_amount_cents" = CAST(ROUND(NEW."current_amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_goals_from_cents"
AFTER UPDATE OF "target_amount_cents", "current_amount_cents" ON "goals"
WHEN NEW."target_amount" IS NOT NEW."target_amount_cents" / 100.0 OR NEW."current_amount" IS NOT NEW."current_amount_cents" / 100.0
BEGIN
  UPDATE "goals" SET "target_amount" = NEW."target_amount_cents" / 100.0, "current_amount" = NEW."current_amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_debts_insert"
AFTER INSERT ON "debts"
BEGIN
  UPDATE "debts" SET "original_amount_cents" = CAST(ROUND(NEW."original_amount" * 100) AS INTEGER), "outstanding_balance_cents" = CAST(ROUND(NEW."outstanding_balance" * 100) AS INTEGER), "installment_amount_cents" = CAST(ROUND(NEW."installment_amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_debts_from_decimal"
AFTER UPDATE OF "original_amount", "outstanding_balance", "installment_amount" ON "debts"
WHEN NEW."original_amount_cents" IS NOT CAST(ROUND(NEW."original_amount" * 100) AS INTEGER) OR NEW."outstanding_balance_cents" IS NOT CAST(ROUND(NEW."outstanding_balance" * 100) AS INTEGER) OR NEW."installment_amount_cents" IS NOT CAST(ROUND(NEW."installment_amount" * 100) AS INTEGER)
BEGIN
  UPDATE "debts" SET "original_amount_cents" = CAST(ROUND(NEW."original_amount" * 100) AS INTEGER), "outstanding_balance_cents" = CAST(ROUND(NEW."outstanding_balance" * 100) AS INTEGER), "installment_amount_cents" = CAST(ROUND(NEW."installment_amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_debts_from_cents"
AFTER UPDATE OF "original_amount_cents", "outstanding_balance_cents", "installment_amount_cents" ON "debts"
WHEN NEW."original_amount" IS NOT NEW."original_amount_cents" / 100.0 OR NEW."outstanding_balance" IS NOT NEW."outstanding_balance_cents" / 100.0 OR NEW."installment_amount" IS NOT NEW."installment_amount_cents" / 100.0
BEGIN
  UPDATE "debts" SET "original_amount" = NEW."original_amount_cents" / 100.0, "outstanding_balance" = NEW."outstanding_balance_cents" / 100.0, "installment_amount" = NEW."installment_amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_transaction_payments_insert"
AFTER INSERT ON "transaction_payments"
BEGIN
  UPDATE "transaction_payments" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_transaction_payments_from_decimal"
AFTER UPDATE OF "amount" ON "transaction_payments"
WHEN NEW."amount_cents" IS NOT CAST(ROUND(NEW."amount" * 100) AS INTEGER)
BEGIN
  UPDATE "transaction_payments" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_transaction_payments_from_cents"
AFTER UPDATE OF "amount_cents" ON "transaction_payments"
WHEN NEW."amount" IS NOT NEW."amount_cents" / 100.0
BEGIN
  UPDATE "transaction_payments" SET "amount" = NEW."amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_bill_payments_insert"
AFTER INSERT ON "bill_payments"
BEGIN
  UPDATE "bill_payments" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_bill_payments_from_decimal"
AFTER UPDATE OF "amount" ON "bill_payments"
WHEN NEW."amount_cents" IS NOT CAST(ROUND(NEW."amount" * 100) AS INTEGER)
BEGIN
  UPDATE "bill_payments" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_bill_payments_from_cents"
AFTER UPDATE OF "amount_cents" ON "bill_payments"
WHEN NEW."amount" IS NOT NEW."amount_cents" / 100.0
BEGIN
  UPDATE "bill_payments" SET "amount" = NEW."amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_bill_price_history_insert"
AFTER INSERT ON "bill_price_history"
BEGIN
  UPDATE "bill_price_history" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_bill_price_history_from_decimal"
AFTER UPDATE OF "amount" ON "bill_price_history"
WHEN NEW."amount_cents" IS NOT CAST(ROUND(NEW."amount" * 100) AS INTEGER)
BEGIN
  UPDATE "bill_price_history" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_bill_price_history_from_cents"
AFTER UPDATE OF "amount_cents" ON "bill_price_history"
WHEN NEW."amount" IS NOT NEW."amount_cents" / 100.0
BEGIN
  UPDATE "bill_price_history" SET "amount" = NEW."amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_account_balance_snapshots_insert"
AFTER INSERT ON "account_balance_snapshots"
BEGIN
  UPDATE "account_balance_snapshots" SET "balance_cents" = CAST(ROUND(NEW."balance" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_account_balance_snapshots_from_decimal"
AFTER UPDATE OF "balance" ON "account_balance_snapshots"
WHEN NEW."balance_cents" IS NOT CAST(ROUND(NEW."balance" * 100) AS INTEGER)
BEGIN
  UPDATE "account_balance_snapshots" SET "balance_cents" = CAST(ROUND(NEW."balance" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_account_balance_snapshots_from_cents"
AFTER UPDATE OF "balance_cents" ON "account_balance_snapshots"
WHEN NEW."balance" IS NOT NEW."balance_cents" / 100.0
BEGIN
  UPDATE "account_balance_snapshots" SET "balance" = NEW."balance_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_pix_payments_insert"
AFTER INSERT ON "pix_payments"
BEGIN
  UPDATE "pix_payments" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_pix_payments_from_decimal"
AFTER UPDATE OF "amount" ON "pix_payments"
WHEN NEW."amount_cents" IS NOT CAST(ROUND(NEW."amount" * 100) AS INTEGER)
BEGIN
  UPDATE "pix_payments" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_pix_payments_from_cents"
AFTER UPDATE OF "amount_cents" ON "pix_payments"
WHEN NEW."amount" IS NOT NEW."amount_cents" / 100.0
BEGIN
  UPDATE "pix_payments" SET "amount" = NEW."amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_credit_card_invoices_insert"
AFTER INSERT ON "credit_card_invoices"
BEGIN
  UPDATE "credit_card_invoices" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_credit_card_invoices_from_decimal"
AFTER UPDATE OF "amount" ON "credit_card_invoices"
WHEN NEW."amount_cents" IS NOT CAST(ROUND(NEW."amount" * 100) AS INTEGER)
BEGIN
  UPDATE "credit_card_invoices" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_credit_card_invoices_from_cents"
AFTER UPDATE OF "amount_cents" ON "credit_card_invoices"
WHEN NEW."amount" IS NOT NEW."amount_cents" / 100.0
BEGIN
  UPDATE "credit_card_invoices" SET "amount" = NEW."amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_receivables_insert"
AFTER INSERT ON "receivables"
BEGIN
  UPDATE "receivables" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_receivables_from_decimal"
AFTER UPDATE OF "amount" ON "receivables"
WHEN NEW."amount_cents" IS NOT CAST(ROUND(NEW."amount" * 100) AS INTEGER)
BEGIN
  UPDATE "receivables" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_receivables_from_cents"
AFTER UPDATE OF "amount_cents" ON "receivables"
WHEN NEW."amount" IS NOT NEW."amount_cents" / 100.0
BEGIN
  UPDATE "receivables" SET "amount" = NEW."amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_receivable_payments_insert"
AFTER INSERT ON "receivable_payments"
BEGIN
  UPDATE "receivable_payments" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_receivable_payments_from_decimal"
AFTER UPDATE OF "amount" ON "receivable_payments"
WHEN NEW."amount_cents" IS NOT CAST(ROUND(NEW."amount" * 100) AS INTEGER)
BEGIN
  UPDATE "receivable_payments" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_receivable_payments_from_cents"
AFTER UPDATE OF "amount_cents" ON "receivable_payments"
WHEN NEW."amount" IS NOT NEW."amount_cents" / 100.0
BEGIN
  UPDATE "receivable_payments" SET "amount" = NEW."amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_receivable_price_history_insert"
AFTER INSERT ON "receivable_price_history"
BEGIN
  UPDATE "receivable_price_history" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_receivable_price_history_from_decimal"
AFTER UPDATE OF "amount" ON "receivable_price_history"
WHEN NEW."amount_cents" IS NOT CAST(ROUND(NEW."amount" * 100) AS INTEGER)
BEGIN
  UPDATE "receivable_price_history" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_receivable_price_history_from_cents"
AFTER UPDATE OF "amount_cents" ON "receivable_price_history"
WHEN NEW."amount" IS NOT NEW."amount_cents" / 100.0
BEGIN
  UPDATE "receivable_price_history" SET "amount" = NEW."amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_transaction_categories_insert"
AFTER INSERT ON "transaction_categories"
BEGIN
  UPDATE "transaction_categories" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_transaction_categories_from_decimal"
AFTER UPDATE OF "amount" ON "transaction_categories"
WHEN NEW."amount_cents" IS NOT CAST(ROUND(NEW."amount" * 100) AS INTEGER)
BEGIN
  UPDATE "transaction_categories" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_transaction_categories_from_cents"
AFTER UPDATE OF "amount_cents" ON "transaction_categories"
WHEN NEW."amount" IS NOT NEW."amount_cents" / 100.0
BEGIN
  UPDATE "transaction_categories" SET "amount" = NEW."amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_bill_categories_insert"
AFTER INSERT ON "bill_categories"
BEGIN
  UPDATE "bill_categories" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_bill_categories_from_decimal"
AFTER UPDATE OF "amount" ON "bill_categories"
WHEN NEW."amount_cents" IS NOT CAST(ROUND(NEW."amount" * 100) AS INTEGER)
BEGIN
  UPDATE "bill_categories" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_bill_categories_from_cents"
AFTER UPDATE OF "amount_cents" ON "bill_categories"
WHEN NEW."amount" IS NOT NEW."amount_cents" / 100.0
BEGIN
  UPDATE "bill_categories" SET "amount" = NEW."amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_receivable_categories_insert"
AFTER INSERT ON "receivable_categories"
BEGIN
  UPDATE "receivable_categories" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_receivable_categories_from_decimal"
AFTER UPDATE OF "amount" ON "receivable_categories"
WHEN NEW."amount_cents" IS NOT CAST(ROUND(NEW."amount" * 100) AS INTEGER)
BEGIN
  UPDATE "receivable_categories" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_receivable_categories_from_cents"
AFTER UPDATE OF "amount_cents" ON "receivable_categories"
WHEN NEW."amount" IS NOT NEW."amount_cents" / 100.0
BEGIN
  UPDATE "receivable_categories" SET "amount" = NEW."amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_transaction_member_splits_insert"
AFTER INSERT ON "transaction_member_splits"
BEGIN
  UPDATE "transaction_member_splits" SET "share_amount_cents" = CAST(ROUND(NEW."share_amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_transaction_member_splits_from_decimal"
AFTER UPDATE OF "share_amount" ON "transaction_member_splits"
WHEN NEW."share_amount_cents" IS NOT CAST(ROUND(NEW."share_amount" * 100) AS INTEGER)
BEGIN
  UPDATE "transaction_member_splits" SET "share_amount_cents" = CAST(ROUND(NEW."share_amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_transaction_member_splits_from_cents"
AFTER UPDATE OF "share_amount_cents" ON "transaction_member_splits"
WHEN NEW."share_amount" IS NOT NEW."share_amount_cents" / 100.0
BEGIN
  UPDATE "transaction_member_splits" SET "share_amount" = NEW."share_amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_goal_contributions_insert"
AFTER INSERT ON "goal_contributions"
BEGIN
  UPDATE "goal_contributions" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_goal_contributions_from_decimal"
AFTER UPDATE OF "amount" ON "goal_contributions"
WHEN NEW."amount_cents" IS NOT CAST(ROUND(NEW."amount" * 100) AS INTEGER)
BEGIN
  UPDATE "goal_contributions" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_goal_contributions_from_cents"
AFTER UPDATE OF "amount_cents" ON "goal_contributions"
WHEN NEW."amount" IS NOT NEW."amount_cents" / 100.0
BEGIN
  UPDATE "goal_contributions" SET "amount" = NEW."amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_investment_operations_insert"
AFTER INSERT ON "investment_operations"
BEGIN
  UPDATE "investment_operations" SET "fees_cents" = CAST(ROUND(NEW."fees" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_investment_operations_from_decimal"
AFTER UPDATE OF "fees" ON "investment_operations"
WHEN NEW."fees_cents" IS NOT CAST(ROUND(NEW."fees" * 100) AS INTEGER)
BEGIN
  UPDATE "investment_operations" SET "fees_cents" = CAST(ROUND(NEW."fees" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_investment_operations_from_cents"
AFTER UPDATE OF "fees_cents" ON "investment_operations"
WHEN NEW."fees" IS NOT NEW."fees_cents" / 100.0
BEGIN
  UPDATE "investment_operations" SET "fees" = NEW."fees_cents" / 100.0 WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_mei_das_payments_insert"
AFTER INSERT ON "mei_das_payments"
BEGIN
  UPDATE "mei_das_payments" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_mei_das_payments_from_decimal"
AFTER UPDATE OF "amount" ON "mei_das_payments"
WHEN NEW."amount_cents" IS NOT CAST(ROUND(NEW."amount" * 100) AS INTEGER)
BEGIN
  UPDATE "mei_das_payments" SET "amount_cents" = CAST(ROUND(NEW."amount" * 100) AS INTEGER) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER "money_shadow_mei_das_payments_from_cents"
AFTER UPDATE OF "amount_cents" ON "mei_das_payments"
WHEN NEW."amount" IS NOT NEW."amount_cents" / 100.0
BEGIN
  UPDATE "mei_das_payments" SET "amount" = NEW."amount_cents" / 100.0 WHERE rowid = NEW.rowid;
END;



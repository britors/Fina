-- Quem pagou e como uma despesa é dividida entre membros da família — dá
-- pra calcular "quem deve quem" sem mudar nada para quem não usa esses
-- campos (ambos opcionais, comportamento atual preservado).
ALTER TABLE transactions ADD COLUMN paid_by_member_id TEXT REFERENCES family_members(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS transaction_member_splits (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  member_id      TEXT NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  share_amount   REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_member_splits_transaction ON transaction_member_splits(transaction_id);
CREATE INDEX IF NOT EXISTS idx_member_splits_member ON transaction_member_splits(member_id);

-- Aportes de meta por pessoa. `goals.current_amount` continua sendo a fonte
-- da verdade e continua editável direto como hoje; registrar uma
-- contribuição aqui apenas soma o valor a `current_amount` — quem não usa
-- membros continua editando a meta exatamente como antes.
CREATE TABLE IF NOT EXISTS goal_contributions (
  id        TEXT PRIMARY KEY,
  goal_id   TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  member_id TEXT REFERENCES family_members(id) ON DELETE SET NULL,
  amount    REAL NOT NULL DEFAULT 0,
  date      TEXT NOT NULL DEFAULT (date('now')),
  note      TEXT
);

CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal ON goal_contributions(goal_id);

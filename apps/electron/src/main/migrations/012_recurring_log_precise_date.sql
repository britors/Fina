-- Torna o log de recorrências preciso por data exata em vez de mês/ano.
-- Necessário para assinaturas com intervalo diferente do mensal (ex: semanal),
-- que podem gerar mais de uma ocorrência dentro do mesmo mês/ano.

CREATE TABLE recurring_log_new (
  source_id      TEXT NOT NULL,
  source_type    TEXT NOT NULL CHECK (source_type IN ('transaction','bill')),
  generated_date TEXT NOT NULL,
  PRIMARY KEY (source_id, source_type, generated_date)
);

INSERT INTO recurring_log_new (source_id, source_type, generated_date)
SELECT source_id, source_type, printf('%04d-%02d-01', generated_year, generated_month)
FROM recurring_log;

DROP TABLE recurring_log;
ALTER TABLE recurring_log_new RENAME TO recurring_log;

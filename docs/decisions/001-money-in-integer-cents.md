# ADR 001 — Valores monetários em centavos inteiros

Status: proposta aprovada para implementação incremental
Issue: #167

## Decisão

Valores monetários com duas casas decimais serão representados internamente
como inteiros em centavos. SQLite usará `INTEGER`; TypeScript usará `number`
limitado a `Number.MAX_SAFE_INTEGER`. Valores em reais continuam existindo
somente nas fronteiras: formulário, importador, API externa, IPC legado e
formatação para exibição.

O limite operacional será de `±9.007.199.254.740.991` centavos
(`±R$ 90.071.992.547.409,91`). Toda conversão deve rejeitar `NaN`, infinito,
overflow e mais precisão que a fronteira declarada suporta.

Não são centavos:

- taxas de juros e percentuais;
- taxas de câmbio;
- quantidades de ativos;
- preço unitário de ativos que precise de mais de duas casas;
- métricas calculadas que não sejam persistidas como dinheiro.

## Inventário de domínio

| Grupo | Campos monetários |
| --- | --- |
| Contas | `balance`, `credit_limit`, `original_balance`, `opening_balance_brl`, `remote_balance` |
| Lançamentos e rateios | `transactions.amount`, pagamentos, categorias e rateios familiares |
| Agenda | valores de contas a pagar/receber, pagamentos, categorias e históricos de preço |
| Planejamento | limites de orçamento, metas, aportes e valores de dívidas/parcelas |
| Patrimônio | aquisição e valor atual de bens; valor aplicado e atual de investimentos |
| Operações | taxas de investimento; `unit_price` permanece decimal enquanto suportar ativos fracionários |
| Cartões/Pix/MEI | valor de faturas, pagamentos Pix e DAS |
| Histórico | snapshots de saldo e bases de conciliação Open Finance |

## Compatibilidade

- O IPC público continua usando valores decimais durante a transição. A
  conversão para centavos ocorre imediatamente no processo principal.
- O protocolo mobile v1 continua aceitando `amount`; uma futura versão pode
  negociar `amount_cents` sem invalidar celulares antigos.
- Backups completos carregam o próprio schema e passam pelas migrações normais.
- Patches incrementais precisam declarar a unidade/formato antes de transportar
  colunas em centavos. Importação de patch antigo converte uma única vez.
- Open Finance e importadores convertem na entrada; exportações convertem na
  saída. Nenhuma integração grava `REAL` diretamente após a virada.

## Rollout

1. Introduzir primitivas centrais `toCents`, `fromCents`, parser decimal e
   divisão exata; substituir arredondamentos duplicados.
2. Adicionar auditoria pré-migração que enumera valores não finitos, fora do
   limite ou com precisão incompatível. Bloquear a migração e produzir
   diagnóstico se houver divergência.
3. Adicionar colunas sombra `*_cents INTEGER` e preenchê-las com
   `ROUND(valor * 100)`. Reconciliar por tabela, conta, fatura e rateio antes
   de marcar a migração como concluída.
4. Fazer uma versão escrever ambas as representações, sempre derivando `REAL`
   dos centavos. Leituras usam centavos e verificam divergência do legado.
5. Versionar patch incremental e sync mobile; aceitar formatos antigo e novo
   nas fronteiras.
6. Em versão posterior, reconstruir tabelas para remover colunas `REAL` que
   representam dinheiro e eliminar o dual-write.

## Invariantes e rollback

- Soma de parcelas, pagamentos, categorias e rateios deve ser exatamente igual
  ao total em centavos.
- Reversão de lançamento deve aplicar o negativo exato do efeito original.
- Soma de saldos e valores por tabela deve coincidir antes/depois da migração.
- A migração roda em transação e cria backup completo antes da primeira escrita.
- Enquanto houver dual-write, rollback consiste em voltar a ler o campo legado;
  depois da remoção de `REAL`, rollback exige restore do backup pré-migração.

## Casos obrigatórios de teste

- `0,01`, `1,005`, negativos, zero e valores próximos ao limite seguro;
- parcelas com resto, como `R$ 10,00 / 3`;
- rateios que não fecham e duplicidades;
- contas em BRL/USD/EUR e conversão cambial;
- faturas, estorno e transferência;
- backup completo, patch incremental antigo/novo e sync mobile v1/v2;
- reconciliação que falha sem alterar o banco original.

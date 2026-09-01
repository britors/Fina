# ADR 001 — Valores monetários em centavos inteiros

Status: implementação incremental em andamento
Issues: #167 (fundação), #169 (adoção canônica)

## Decisão

Valores monetários com duas casas decimais serão representados internamente
como inteiros em centavos. SQLite usará `INTEGER`; TypeScript usará `number`
limitado a `Number.MAX_SAFE_INTEGER`. Valores em reais continuam existindo
somente nas fronteiras: formulário, importador, API externa, IPC legado e
formatação para exibição.

O limite operacional será de `±9.007.199.254.740.991` centavos
(`±R$ 90.071.992.547.409,91`). Toda conversão deve rejeitar `NaN`, infinito,
overflow e mais precisão que a fronteira declarada suporta.

Esse limite é exato na representação canônica em centavos e em entradas
decimais textuais. O contrato legado em `number` pode perder centavos antes da
conversão em magnitudes extremas; por isso importadores e futuros contratos IPC
devem preferir texto decimal ou `amount_cents`. A conversão de `number` usa sua
representação decimal observável e nunca tenta reconstruir dígitos já perdidos.

Não são centavos:

- taxas de juros e percentuais;
- taxas de câmbio;
- quantidades de ativos;
- preço unitário de ativos que precise de mais de duas casas;
- métricas calculadas que não sejam persistidas como dinheiro.

## Escala por moeda

O modelo atual suporta contas em BRL, USD e EUR. As três moedas usam escala 2
no Fina: um inteiro representa `0,01` da moeda da conta. Portanto,
`original_balance_cents = 123` significa BRL 1,23, USD 1,23 ou EUR 1,23 de
acordo com `accounts.currency`; o nome `_cents` designa a unidade menor e não
implica BRL.

Taxas de câmbio continuam decimais e não usam `*_cents`. A conversão segue
estas etapas, sem arredondamentos intermediários adicionais:

1. validar o valor original com no máximo duas casas;
2. multiplicá-lo pela taxa decimal vigente;
3. arredondar uma única vez o resultado convertido para centavos de BRL;
4. persistir `original_balance_cents` na moeda da conta e
   `opening_balance_brl_cents`/`balance_cents` em BRL.

Uma futura moeda cuja unidade menor não tenha escala 2 exige evolução explícita
do schema e do protocolo. Ela não pode reutilizar silenciosamente estes campos.

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
- O protocolo mobile v1 continua aceitando `amount`; v2 negocia
  `amount_cents` sem invalidar celulares ou desktops antigos.
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

O inventário executável e o preflight da etapa 2 ficam em
`moneyMigrationAudit.ts`. A lista é deliberadamente estática: mudanças no
schema exigem revisão explícita do que é dinheiro, evitando converter por
engano percentuais, quantidades ou preços unitários fracionários.

As etapas 2–4 foram materializadas na migration
`045_money_shadow_cents.sql`. Antes dela, o runner:

1. audita precisão, overflow, tipos SQLite e fechamento de rateios;
2. cria `fina.db.pre-money-cents-v1.fin` com `VACUUM INTO` e permissão `0600`;
3. só então executa, numa única transação, o backfill e a instalação dos
   triggers de dual-write.

O backup pré-migração é preservado para recuperação. Durante esta fase,
versões anteriores ainda podem ler as colunas `REAL`; leitores novos podem
adotar `*_cents` gradualmente sem divergência.

## Formatos de transporte

- Patch incremental sem `money_format` é legado e equivale a `decimal-v1`.
- `decimal-v1` usa os nomes históricos (`amount`, `balance` etc.).
- `cents-v1` usa exclusivamente o sufixo `_cents`. Misturar os dois nomes na
  mesma linha é erro, mesmo quando os valores parecem equivalentes.
- O handshake mobile negocia `protocolVersion`: v1 envia `amount`; v2 envia
  somente `amount_cents`. Campo ausente no handshake significa v1.
- Inteiros recebidos em centavos precisam ser seguros em JavaScript. Valores
  decimais legados passam por validação de precisão antes da persistência.

## Invariantes e rollback

- Soma de parcelas, pagamentos, categorias e rateios deve ser exatamente igual
  ao total em centavos.
- Reversão de lançamento deve aplicar o negativo exato do efeito original.
- Soma de saldos e valores por tabela deve coincidir antes/depois da migração.
- A migração roda em transação e cria backup completo antes da primeira escrita.
- Enquanto houver dual-write, rollback consiste em voltar a ler o campo legado;
  depois da remoção de `REAL`, rollback exige restore do backup pré-migração.

## Plano para remoção das colunas `REAL`

A remoção não faz parte da migration 045 e só poderá ocorrer depois da janela
de compatibilidade. Os gates são cumulativos:

1. todas as leituras e escritas financeiras do processo principal usam
   `*_cents`; um teste de arquitetura bloqueia novas agregações monetárias em
   colunas legadas;
2. o diagnóstico local de integridade retorna zero divergências nas 33 colunas
   inventariadas após operações normais, restore completo e aplicação de patch;
3. patch `cents-v1` é o formato emitido por padrão e a leitura de
   `decimal-v1` permanece coberta como importação legada;
4. mobile v2 está disponível em produção e o suporte a mobile v1 foi encerrado
   em uma versão anterior, comunicada aos usuários;
5. existe ao menos um ciclo de release estável com dual-write após todos os
   gates anteriores, sem correção de divergência monetária pendente.

Cumpridos os gates, uma nova migration reconstruirá cada tabela SQLite sem os
campos monetários `REAL` e sem os triggers `money_shadow_*`. A migration deverá:

- criar backup completo dedicado antes da reconstrução;
- executar cada reconstrução e validação de chaves/índices em transação;
- comparar contagem de linhas e totais inteiros antes/depois;
- executar `foreign_key_check` e `integrity_check` antes do commit;
- manter conversão decimal apenas nas fronteiras públicas ainda necessárias.

O rollback dessa migration não recria valores por divisão ou arredondamento:
restaura o backup dedicado. Backups produzidos depois da remoção declaram a
versão de schema e não devem ser abertos por versões desktop anteriores.

## Casos obrigatórios de teste

- `0,01`, `1,005`, negativos, zero e valores próximos ao limite seguro;
- parcelas com resto, como `R$ 10,00 / 3`;
- rateios que não fecham e duplicidades;
- contas em BRL/USD/EUR e conversão cambial;
- faturas, estorno e transferência;
- backup completo, patch incremental antigo/novo e sync mobile v1/v2;
- reconciliação que falha sem alterar o banco original.

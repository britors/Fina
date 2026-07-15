# Subcategorias

Este documento define as regras funcionais da hierarquia de categorias do Fina.

## Hierarquia

- O primeiro release suporta um nível: categoria e subcategoria.
- Categorias raiz têm `parent_id = NULL`; subcategorias apontam para uma categoria raiz.
- Uma subcategoria não pode ser pai, apontar para si mesma ou formar ciclos.
- O nome é único, sem diferenciar maiúsculas e minúsculas, dentro do mesmo pai e tipo.
- Subcategorias herdam `type` e `kind` da categoria pai.
- Alterar `type` ou `kind` de um pai atualiza suas filhas na mesma transação.

## Lançamentos e filtros

- Categorias raiz e subcategorias podem receber lançamentos.
- Um lançamento associado diretamente ao pai representa "Sem subcategoria".
- Filtrar pelo pai inclui os lançamentos diretos e os de suas filhas.
- Filtrar por uma filha inclui somente essa subcategoria.
- Consolidados agrupam pelo pai e contam cada lançamento uma única vez.
- Detalhamentos separam as filhas e os lançamentos "Sem subcategoria".

## Orçamentos

- Um orçamento pode pertencer a uma categoria raiz ou a uma subcategoria.
- No mesmo mês e ano, não pode haver orçamento no pai e em uma de suas filhas.
- Um orçamento no pai soma os gastos diretos e os gastos de todas as filhas.
- Um orçamento na filha considera somente os gastos daquela subcategoria.
- Duas filhas podem ter orçamentos independentes.
- O carry-over permanece associado à categoria escolhida.

## Edição e exclusão

- Uma subcategoria pode ser movida apenas para outra categoria raiz compatível.
- Uma mudança não pode criar conflito de orçamento silenciosamente; nesses casos, deve ser bloqueada com uma mensagem clara.
- Uma categoria com filhas não pode ser excluída.
- Categorias vinculadas a lançamentos, contas a pagar ou orçamentos não podem ser excluídas.
- Dados existentes permanecem em categorias raiz após a migração.

## Apresentação e exportação

- Seletores mostram o caminho `Categoria › Subcategoria` quando necessário.
- Gráficos principais apresentam a visão consolidada por pai e permitem detalhamento.
- CSV mantém a coluna Categoria e acrescenta Subcategoria.
- PDF usa o caminho `Categoria › Subcategoria`.

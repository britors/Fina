# Manual do Usuário do Fina

Este manual explica como usar o Fina no dia a dia. Ele não trata de detalhes técnicos; o objetivo é mostrar para que serve cada item do menu e como usar as funções de cada tela.

## Visão geral

O Fina é um aplicativo de controle financeiro pessoal. Nele você pode cadastrar contas, registrar receitas e despesas, acompanhar orçamento, controlar contas a pagar, patrimônio, investimentos, metas, dívidas, indicadores de mercado e gerar um informe auxiliar para IRPF.

A navegação principal fica no menu lateral esquerdo. A parte superior da janela mostra o título da tela aberta e, quando existir, botões de ação como `Novo lançamento`, `Nova conta`, `Exportar PDF` ou `Atualizar`.

No canto superior direito ficam os controles da janela:

- `Minimizar`: recolhe a janela.
- `Maximizar`: alterna entre janela normal e maximizada.
- `Fechar`: fecha o aplicativo.

## Dashboard

O Dashboard é a tela inicial. Ele reúne os principais indicadores financeiros em um único lugar.

### Filtro de período

Use os campos `Período`, com mês inicial e mês final, para escolher quais meses entram nos cálculos da tela.

- O primeiro campo define o mês inicial.
- O segundo campo define o mês final.
- `Mês atual` volta rapidamente para o mês em andamento.

### Cartões principais

O Dashboard mostra três cartões no topo:

- `Saldo em contas`: soma o saldo das contas cadastradas. Também mostra o patrimônio líquido, considerando contas, investimentos, bens e dívidas.
- `Receitas`: total de receitas no período selecionado.
- `Despesas`: total de despesas no período selecionado e saldo do período.

### Últimas transações

Mostra as transações mais recentes do período selecionado. Cada item exibe descrição, conta, data, categoria e valor.

Use `Ver todas` para abrir a tela `Transações`.

### Gastos por categoria

Mostra um gráfico circular com as despesas agrupadas por categoria. Use esse bloco para identificar rapidamente onde o dinheiro está sendo gasto.

### Previsão de saldo

Mostra uma previsão para os próximos 30 dias. A previsão considera o saldo atual e movimentações futuras conhecidas pelo aplicativo.

Se houver risco de saldo negativo, a tela exibe um alerta.

### Contas a pagar

Mostra contas próximas do vencimento. Cada item exibe descrição, data de vencimento, situação e valor.

Use `Ver todas` para abrir a tela `Agenda`.

### Metas próximas

Mostra metas com prazo próximo ou atrasadas. Cada meta exibe progresso, valor acumulado, valor alvo e dias restantes.

Use `Ver todas` para abrir a tela `Metas`.

### Mercado

Mostra alguns indicadores financeiros, como câmbio, bolsa e Selic.

Use `Ver todos` para abrir a tela `Mercado`.

## Transações

A tela `Transações` é usada para registrar e consultar receitas, despesas e transferências.

### Botões da tela

- `Importar extrato`: importa transações a partir de arquivos CSV, OFX ou QFX.
- `Exportar CSV`: exporta as transações filtradas para um arquivo CSV.
- `Novo lançamento`: abre o cadastro de uma nova transação.

### Filtros

Na parte superior da tela existem filtros rápidos:

- `Todos`: mostra receitas, despesas e transferências.
- `Receitas`: mostra apenas entradas.
- `Despesas`: mostra apenas saídas.

Também existe o filtro de período:

- Escolha o mês inicial e o mês final.
- Use `Mês atual` para retornar ao mês corrente.

### Resumo do período

A tela mostra três cartões:

- `Total de receitas`: soma das receitas filtradas.
- `Total de despesas`: soma das despesas filtradas.
- `Saldo do período`: receitas menos despesas.

### Lista de transações

A tabela mostra:

- Descrição.
- Conta.
- Categoria.
- Data.
- Valor.
- Status.
- Ações.

As ações disponíveis são:

- `Editar`: altera os dados da transação.
- `Excluir`: remove a transação após confirmação.

Quando uma transação confirmada é criada, alterada ou excluída, o saldo da conta é atualizado automaticamente.

### Novo lançamento ou edição

Ao clicar em `Novo lançamento` ou `Editar`, preencha:

- `Descrição`: nome do lançamento, como supermercado, salário ou aluguel.
- `Valor`: valor da movimentação.
- `Tipo`: despesa, receita ou transferência.
- `Conta`: conta de origem.
- `Categoria`: categoria da transação.
- `Conta destino`: aparece quando o tipo é transferência. Deve ser diferente da conta de origem.
- `Data`: data da transação.
- `Status`: confirmado ou pendente.
- `Observações`: informação opcional.

Use `Salvar` para gravar. Use `Cancelar` para sair sem salvar.

### Importar extrato

Ao clicar em `Importar extrato`:

1. Selecione um arquivo CSV, OFX ou QFX.
2. Escolha a conta de destino.
3. Escolha uma categoria padrão.
4. Clique em `Pré-visualizar`.
5. Confira as transações encontradas.
6. Clique em `Importar`.

Duplicatas identificadas são indicadas na prévia e ignoradas na importação.

## Contas

A tela `Contas` gerencia contas bancárias, cartões e carteira.

### Botão da tela

- `Nova conta`: cadastra uma nova conta.

### Resumo

O topo da tela mostra:

- `Patrimônio líquido`: soma dos saldos cadastrados.
- `Em conta`: soma das contas que não são cartão de crédito.
- `Em débito`: soma dos valores de cartão de crédito.

### Cartões de conta

Cada conta mostra:

- Banco.
- Tipo da conta.
- Nome.
- Saldo disponível ou fatura atual.
- Limite e limite disponível, quando for cartão de crédito.
- Data de criação.

As ações disponíveis são:

- `Editar`: altera os dados da conta.
- `Excluir`: remove a conta. Ao excluir uma conta, as transações vinculadas também são removidas.

### Nova conta ou edição

Campos disponíveis:

- `Nome da conta`: nome que identifica a conta.
- `Tipo`: conta corrente, poupança, cartão de crédito ou carteira.
- `Banco`: nome da instituição.
- `Saldo`: saldo inicial ou atual.
- `Limite de crédito`: usado principalmente para cartões.

## Orçamento

A tela `Orçamento` permite definir limites mensais por categoria de despesa.

### Botão da tela

- `Novo orçamento`: cria um limite para uma categoria em um mês e ano.

### Seletor de mês

Use o campo de mês no topo da tela para escolher o período do orçamento.

### Resumo

A tela mostra:

- `Orçamento total`: soma dos limites definidos.
- `Gasto até agora`: total já gasto nas categorias orçadas.
- `Ainda disponível`: diferença entre limite e gasto.

Quando há orçamento cadastrado, uma barra mostra o progresso geral do mês.

### Linhas de orçamento

Cada linha mostra:

- Categoria.
- Valor gasto.
- Limite definido.
- Barra de progresso.
- Situação: dentro do limite, atenção ou excedido.

Ações disponíveis:

- `Editar`: altera categoria, mês, ano ou limite.
- `Excluir`: remove o orçamento.

### Novo orçamento ou edição

Campos disponíveis:

- `Categoria`: categoria de despesa.
- `Nova`: cria uma nova categoria de despesa sem sair da tela.
- `Mês`: mês do orçamento.
- `Ano`: ano do orçamento.
- `Limite`: valor máximo planejado.

## Relatórios

A tela `Relatórios` mostra análises visuais das receitas e despesas.

### Botão da tela

- `Exportar PDF`: gera um relatório em PDF do mês atual.

### Período dos gráficos

Use os botões:

- `3 meses`.
- `6 meses`.
- `12 meses`.

Eles controlam o histórico exibido no gráfico e na tabela.

### Gráfico de receitas e despesas

Mostra a comparação mensal entre receitas e despesas.

### Despesas por categoria

Mostra um gráfico circular com a participação de cada categoria de despesa no mês atual.

### Resumo do período

A tabela mostra, mês a mês:

- Receitas.
- Despesas.
- Saldo.

A última linha mostra o total do período selecionado.

## Agenda

A tela `Agenda` controla contas a pagar e contas pagas.

### Botão da tela

- `Nova conta`: cadastra uma nova conta a pagar.

### Resumo

O topo mostra:

- `Pendentes`: total em contas ainda não pagas.
- `Vencidas`: total em contas atrasadas.
- `Pagas (mês)`: total pago no mês atual.

### Listas

As contas aparecem separadas em:

- `Vencidas`.
- `A pagar`.
- `Pagas`.

Cada item mostra descrição, vencimento, status e valor.

Ações disponíveis:

- `Pagar`: marca a conta como paga.
- `Editar`: altera os dados da conta.
- `Excluir`: remove a conta.

### Nova conta a pagar ou edição

Campos disponíveis:

- `Descrição`: nome da conta.
- `Valor`: valor a pagar.
- `Vencimento`: data de vencimento.
- `Conta`: conta relacionada, opcional.
- `Status`: pendente, pago ou vencido.

## Patrimônio

A tela `Patrimônio` registra bens como imóveis, veículos, terrenos e outros ativos.

### Botão da tela

- `Novo bem`: cadastra um novo bem.

### Resumo

A tela mostra:

- `Valor total atual`: soma dos valores atuais dos bens.
- `Valor de aquisição`: soma dos valores de compra.
- `Valorização`: diferença entre valor atual e valor de aquisição.

### Lista por tipo

Os bens são agrupados por tipo:

- Imóvel.
- Veículo.
- Terreno.
- Investimento.
- Outro.

Cada linha mostra nome, descrição, valor de aquisição, valor atual e variação.

Ações disponíveis:

- Ícone de lápis: editar.
- Ícone de lixeira: excluir.

### Novo bem ou edição

Campos disponíveis:

- `Nome`: identificação do bem.
- `Tipo`: tipo do bem.
- `Valor de aquisição`: valor de compra.
- `Valor atual`: valor estimado atual.
- `Data de aquisição`: data de compra.
- `Descrição`: observações opcionais.

## Investimentos

A tela `Investimentos` acompanha sua carteira de aplicações.

### Botão da tela

- `Novo investimento`: cadastra um novo ativo.

### Resumo

A tela mostra:

- `Valor atual`: soma do valor atual dos investimentos.
- `Total aplicado`: soma do valor aplicado.
- `Rendimento`: diferença entre valor atual e valor aplicado, em reais e percentual.

### Tabela de ativos

Mostra:

- Nome.
- Instituição.
- Tipo.
- Valor aplicado.
- Valor atual.
- Retorno.
- Aviso de vencimento próximo, quando aplicável.

Ações disponíveis:

- Ícone de lápis: editar.
- Ícone de lixeira: excluir.

### Alocação por tipo

Mostra um gráfico circular com a distribuição dos investimentos por tipo.

Tipos disponíveis:

- Renda fixa.
- Renda variável.
- Fundos.
- Criptomoedas.
- Outros.

### Novo investimento ou edição

Campos disponíveis:

- `Nome`: nome do ativo.
- `Tipo`: classificação do investimento.
- `Instituição`: corretora, banco ou instituição.
- `Valor aplicado`: valor investido.
- `Valor atual`: valor atualizado.
- `Data de aplicação`: data da aplicação.
- `Vencimento`: data de vencimento, quando houver.
- `Observações`: notas opcionais.

## Metas

A tela `Metas` ajuda a acompanhar objetivos financeiros.

### Botão da tela

- `Nova meta`: cadastra uma meta.

### Resumo

A tela mostra:

- `Metas ativas`: quantidade de metas cadastradas.
- `Total acumulado`: soma já guardada.
- `Falta acumular`: diferença entre valor alvo e valor acumulado.

### Cartões de meta

Cada meta mostra:

- Nome.
- Tipo.
- Valor acumulado.
- Valor alvo.
- Barra de progresso.
- Prazo.
- Valor mensal necessário, quando houver prazo futuro.
- Situação: concluída, urgente ou atrasada.

Ações disponíveis:

- `Editar`: altera a meta.
- Ícone de lixeira: exclui a meta.

### Nova meta ou edição

Campos disponíveis:

- `Nome`: nome da meta.
- `Tipo`: viagem, imóvel, evento, reserva de emergência ou outro.
- `Valor alvo`: valor que deseja atingir.
- `Valor acumulado`: valor já guardado.
- `Data alvo`: prazo desejado.
- `Conta vinculada`: conta relacionada à meta, opcional.
- `Descrição`: observações opcionais.

## Dívidas

A tela `Dívidas` controla empréstimos, financiamentos, cartões e outros compromissos.

### Botão da tela

- `Nova dívida`: cadastra uma dívida.

### Resumo

A tela mostra:

- `Total em dívidas`: soma do saldo devedor das dívidas ativas.
- `Parcelas mensais`: soma das parcelas mensais.
- `Dívidas quitadas`: quantidade de dívidas marcadas como quitadas.

### Tabela de dívidas

Mostra:

- Descrição.
- Credor.
- Próximo vencimento.
- Tipo.
- Saldo devedor.
- Valor da parcela.
- Juros ao mês.
- Progresso das parcelas.
- Status.

Ações disponíveis:

- Ícone de calculadora: simular quitação.
- Ícone de calendário com mais: gerar conta a pagar na Agenda.
- Ícone de lápis: editar.
- Ícone de lixeira: excluir.

### Nova dívida ou edição

Campos disponíveis:

- `Descrição`: nome da dívida.
- `Tipo`: empréstimo pessoal, financiamento, cartão de crédito, cheque especial, dívida pessoal ou outro.
- `Credor`: banco, pessoa ou instituição.
- `Status`: em dia, em atraso, renegociada ou quitada.
- `Valor original`: valor inicial da dívida.
- `Saldo devedor`: quanto ainda falta pagar.
- `Juros`: taxa mensal.
- `Total de parcelas`: quantidade total.
- `Parcelas restantes`: parcelas ainda em aberto.
- `Valor da parcela`: valor mensal.
- `Próximo vencimento`: data da próxima parcela.

### Simular quitação

Ao clicar na calculadora:

1. Informe um pagamento extra mensal.
2. Clique em `Calcular`.

O Fina compara o cenário sem pagamento extra com o cenário informado e mostra:

- Meses para quitar.
- Juros totais.
- Economia em juros.
- Quantos meses antes a dívida pode ser quitada.

### Gerar conta a pagar

O botão de calendário cria uma conta na `Agenda` usando os dados da parcela da dívida. Use essa função para acompanhar a parcela como uma conta a pagar.

## Mercado

A tela `Mercado` mostra cotações e indicadores financeiros.

### Botões da tela

- `Atualizar`: força uma nova busca das cotações.
- `Tentar novamente`: aparece quando não foi possível obter dados.

### Indicadores

A tela pode exibir:

- Dólar.
- Euro.
- Bitcoin.
- Ibovespa.
- S&P 500.
- Nasdaq.
- Selic.

Cada cartão mostra cotação e variação do dia, quando aplicável.

### Cache e modo offline

As cotações usam cache de 15 minutos. Se não houver conexão, o Fina pode exibir a última cotação disponível com indicação de dados offline.

### Tabela de cotações

Mostra todos os indicadores em formato de tabela, com símbolo, cotação e variação do dia.

## IRPF

A tela `IRPF` gera um informe auxiliar com base nos dados lançados no Fina.

Importante: o informe do Fina é apenas um apoio. Confira sempre os informes oficiais de bancos, corretoras, empresas e demais instituições antes de enviar a declaração à Receita Federal.

### Controles da tela

- Seletor de ano: escolhe o ano-calendário.
- `Gerar`: calcula o informe.
- `Importar ano anterior`: importa dados de um CSV gerado anteriormente pelo Fina.
- `Exportar CSV`: gera arquivo CSV com os dados organizados por ficha.
- `Exportar PDF`: gera um PDF do informe.

Os botões de exportação ficam disponíveis depois que o informe é gerado.

### Informe gerado

O informe mostra:

- Cabeçalho com ano, nome do usuário, total de bens, total de dívidas e patrimônio líquido.
- `Rendimentos Tributáveis`.
- `Rendimentos Isentos`.
- `Deduções`, especialmente saúde e educação.
- `Bens e Direitos`.
- `Dívidas e Ônus Reais`.

### Exportar CSV

Gera um arquivo com os dados separados por ficha. Use esse arquivo como guia de preenchimento no programa da Receita Federal.

O Fina não exporta arquivo `.DEC`, pois esse formato é proprietário e não documentado pela Receita Federal.

### Importar ano anterior

Ao clicar em `Importar ano anterior`:

1. Selecione um CSV exportado pelo Fina.
2. Informe o ano-calendário.
3. Escolha uma conta para lançar rendimentos.
4. Clique em `Pré-visualizar`.
5. Confira totais de rendimentos, deduções, bens e dívidas.
6. Clique em `Importar`.

Também existe a opção `Baixar modelo CSV`, útil quando você quer preencher um arquivo manualmente no formato esperado.

## Configurações

A tela `Configurações` reúne ajustes do aplicativo. Ela possui um menu interno com seções.

### Perfil

Permite alterar:

- `Nome completo`: aparece no cabeçalho e relatórios.
- `E-mail`: usado como informação de contato.

Clique em `Salvar alterações` para gravar.

### Aparência

Permite alterar:

- `Tema`: escuro ou claro.
- `Cor de destaque`: cor usada em botões e elementos ativos.

As alterações visuais são aplicadas imediatamente.

### Notificações

Permite ativar ou desativar:

- `Contas a vencer`: alerta antes do vencimento.
- `Orçamento excedido`: alerta ao ultrapassar limites.
- `Resumo semanal`: opção de resumo semanal.

Use os interruptores para ligar ou desligar cada aviso.

### Categorias

Permite gerenciar categorias de receitas e despesas.

Ações disponíveis:

- `Nova`: cria uma categoria.
- `Editar`: altera categoria existente.
- `Excluir`: remove uma categoria.

Ao criar ou editar categoria, informe:

- Nome.
- Tipo: receita ou despesa.
- Ícone.
- Cor.

Categorias são usadas em transações, orçamentos, relatórios e gráficos.

### Dados e backup

Mostra o caminho do arquivo de banco de dados e permite cuidar dos backups.

Funções disponíveis:

- `Exportar`: salva um backup completo em arquivo `.fin`.
- `Importar`: restaura um backup `.fin`.
- `Quando fazer backup`: configura o auto-backup.
- `Escolher pasta`: define onde os backups automáticos serão salvos.

Atenção: importar um backup substitui todos os dados atuais do aplicativo.

Opções de auto-backup:

- Desativado.
- Ao abrir o programa.
- Ao fechar o programa.
- Diariamente.
- Semanalmente.
- Mensalmente.

Para o auto-backup funcionar, escolha também uma pasta de destino.

### Sobre

Mostra:

- Versão do Fina.
- Banco de dados usado.
- Runtime.
- Autor.

Também permite `Verificar atualizações`.

Se houver uma nova versão disponível, o botão muda para baixar a atualização. Se o Fina foi instalado via AUR, a atualização deve ser feita pelo gerenciador de pacotes do sistema.

## Recomendações de uso

Para começar a usar o Fina de forma organizada:

1. Cadastre suas contas em `Contas`.
2. Ajuste categorias em `Configurações > Categorias`, se necessário.
3. Registre receitas e despesas em `Transações`.
4. Cadastre contas futuras em `Agenda`.
5. Defina limites em `Orçamento`.
6. Use `Dashboard` e `Relatórios` para acompanhar a evolução.
7. Registre bens, investimentos, metas e dívidas conforme sua necessidade.
8. Faça backups regularmente em `Configurações > Dados e backup`.


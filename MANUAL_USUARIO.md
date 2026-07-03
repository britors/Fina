# Manual do Usuário do Fina

Este manual explica como usar o Fina no dia a dia. Ele não trata de detalhes técnicos; o objetivo é mostrar para que serve cada item do menu e como usar as funções de cada tela.

## Visão geral

O Fina é um aplicativo de controle financeiro pessoal. Nele você pode cadastrar contas, registrar receitas e despesas, acompanhar orçamento, controlar contas a pagar, patrimônio, investimentos, metas, dívidas, indicadores de mercado e gerar um informe auxiliar para IRPF.

A navegação principal fica no menu lateral esquerdo. O menu é organizado em grupos expansíveis. Clique no nome de um grupo para abrir ou recolher suas opções. Quando você entra em uma tela, o Fina mantém o grupo correspondente aberto e destaca o item ativo.

Os grupos do menu são:

- `Visão geral`: Dashboard, diagnóstico financeiro, plano mensal, alertas e Assistente IA.
- `Movimentação`: transações, contas, agenda e orçamento.
- `Dívidas e proteção`: controle de dívidas, plano de saída e reserva.
- `Patrimônio e crescimento`: patrimônio, investimentos, metas, simulador e jornada.
- `Análise`: relatórios, mercado e IRPF.
- `Sistema`: manual e configurações.

A parte superior da janela mostra o título da tela aberta e, quando existir, botões de ação como `Novo lançamento`, `Nova conta`, `Exportar PDF` ou `Atualizar`.

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

## Diagnóstico

A tela `Diagnóstico` interpreta os dados já cadastrados no Fina e mostra uma leitura prática da sua situação financeira.

Ela usa informações de contas, transações, dívidas, investimentos e patrimônio para indicar se a situação está em nível crítico, de atenção, estável ou de crescimento.

### Resultado do diagnóstico

O cartão principal mostra:

- Situação atual: crítico, atenção, estável ou crescimento.
- Explicação resumida do resultado.
- Próximos passos sugeridos.

Use essa área para entender o que deve receber prioridade no momento: controlar despesas, reduzir dívidas, criar reserva ou acelerar crescimento patrimonial.

### Indicadores principais

A tela mostra cartões com:

- `Renda média`: média de receitas dos últimos 3 meses.
- `Despesa média`: média de despesas dos últimos 3 meses.
- `Saldo mensal`: diferença média entre renda e despesas.
- `Comprometido com dívidas`: percentual da renda usado em parcelas.
- `Reserva estimada`: quantos meses de despesas o saldo em contas cobre.
- `Patrimônio líquido`: contas, bens e investimentos menos dívidas.

### Barras de diagnóstico

As barras ajudam a comparar pontos importantes:

- `Taxa de sobra mensal`: quanto da renda sobra após as despesas.
- `Comprometimento com dívidas`: quanto da renda está preso em parcelas.
- `Reserva sobre 3 meses`: quanto você já cobre de uma reserva mínima de 3 meses.

### Resumo patrimonial

Mostra a composição do patrimônio:

- Saldo em contas.
- Investimentos.
- Bens.
- Dívidas.
- Patrimônio líquido.

### Como usar

Atualize suas transações, contas, dívidas e investimentos antes de consultar o diagnóstico. Quanto mais completos os dados, mais útil será a recomendação exibida.

## Plano mensal

A tela `Plano mensal` sugere como usar a margem mensal disponível. Ela ajuda a transformar sua renda e seus gastos em uma orientação prática para o próximo mês.

O plano é calculado com base na média dos últimos 3 meses, considerando receitas, despesas, dívidas, saldo em contas, metas e investimentos.

### Cartões principais

A tela mostra:

- `Renda média`: média de receitas dos últimos 3 meses.
- `Despesas médias`: média de despesas dos últimos 3 meses.
- `Margem mensal`: diferença entre renda e despesas.

Se a margem estiver negativa, o Fina exibe um alerta informando quanto precisa ser recuperado para o mês fechar sem déficit.

### Plano sugerido

O bloco principal mostra uma sugestão de distribuição da margem mensal. Dependendo da sua situação, o plano pode priorizar:

- Pagamento extra de dívidas.
- Reserva de emergência.
- Metas financeiras.
- Investimentos.
- Flexibilidade para o mês.
- Corte de gastos ou renegociação, quando há déficit.

Cada linha mostra valor sugerido, descrição e uma barra proporcional.

### Leitura do plano

A tela também resume pontos que influenciam a sugestão:

- Dívidas ativas.
- Reserva estimada.
- Metas em aberto.
- Investimentos atuais.

### Como usar

Use o Plano mensal como referência de decisão. Ele não impede lançamentos nem altera seus dados automaticamente. A ideia é orientar quanto direcionar para cada prioridade no mês.

Revise o plano depois de atualizar suas transações, dívidas, metas e investimentos.

## Alertas

A tela `Alertas` mostra riscos e oportunidades identificados automaticamente pelo Fina.

Ela usa dados de transações, dívidas, contas, orçamentos e categorias para indicar situações que merecem atenção.

### Tipos de alerta

Os alertas são separados em:

- `Críticos`: exigem ação imediata.
- `Atenção`: indicam riscos que precisam de acompanhamento.
- `Oportunidades`: mostram chances de melhorar o planejamento.

### Exemplos de alertas

O Fina pode avisar quando:

- O mês médio está fechando negativo.
- As dívidas comprometem uma parte alta da renda.
- A reserva de emergência está baixa.
- Um orçamento foi excedido ou está quase no limite.
- Uma categoria de despesa cresceu muito em relação ao mês anterior.
- Há margem positiva para reserva, quitação de dívidas ou investimentos.

### Como usar

Cada alerta mostra o motivo e uma ação sugerida. Use essa tela como uma revisão rápida antes de tomar decisões no mês.

Mantenha transações, orçamentos e dívidas atualizados para que os alertas sejam mais úteis.

## Assistente IA

A tela `Assistente IA` permite fazer perguntas sobre sua situação financeira usando um provedor de IA configurado por você.

A integração fica desligada por padrão. Ela só funciona depois que você ativa a IA, salva uma chave de API e confirma o consentimento de envio de dados.

### Provedores

O Fina permite configurar:

- `ChatGPT / OpenAI`.
- `Gemini / Google`.

Você informa sua própria chave de API e pode escolher o modelo usado pelo provedor.

### Privacidade dos dados

Antes de enviar uma pergunta, o Fina mostra quais dados podem ser enviados.

Enviado somente com consentimento:

- renda e despesas agregadas;
- despesas por categoria;
- saldos totais por tipo de conta;
- dívidas por tipo e status;
- orçamentos do mês;
- metas, investimentos e bens agregados.

Não enviado por padrão:

- nome;
- e-mail;
- nomes de bancos;
- descrições de transações;
- observações pessoais;
- dados linha a linha;
- chaves de API.

### Consentimento por pergunta

Mesmo com a IA ativada, cada pergunta exige confirmação de envio do resumo financeiro agregado para o provedor escolhido.

Se você não marcar a confirmação, a pergunta não é enviada.

### Limitações

As respostas da IA são apenas informativas e educacionais. Elas não substituem conferência dos dados, planejamento próprio nem orientação profissional financeira, fiscal, jurídica ou de investimento.

### Chave de API

A chave é salva criptografada fora do banco de dados do Fina. Ela não aparece nos backups, exports, relatórios ou interface depois de salva.

Você pode remover a chave salva a qualquer momento na própria tela do assistente ou em `Configurações > IA`.

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

## Simulador

A tela `Simulador` projeta o crescimento do patrimônio ao longo do tempo.

Ela usa como ponto de partida o patrimônio atual aproximado, somando contas, investimentos e bens cadastrados. Você pode alterar os valores para comparar cenários.

### Cartões principais

A tela mostra:

- `Patrimônio projetado`: valor estimado no fim do prazo.
- `Aportes totais`: soma dos aportes mensais no período.
- `Ganho estimado`: diferença entre patrimônio final e total aplicado.

### Cenário

Você pode alterar:

- `Patrimônio inicial`.
- `Aporte mensal`.
- `Rendimento anual`.
- `Prazo em anos`.

Clique em `Simular` para recalcular.

### Evolução projetada

O gráfico mostra a evolução do patrimônio ao longo do prazo. Abaixo dele, o Fina destaca valores intermediários, como ano 1, metade do prazo e valor final.

Use essa tela para comparar o impacto de aumentar aporte, prazo ou rendimento esperado.

## Jornada

A tela `Jornada` organiza o uso do Fina em uma sequência guiada.

Ela ajuda a sair da desorganização financeira, passar pela redução de dívidas, formar reserva e avançar para crescimento patrimonial.

### Progresso

No topo, a tela mostra quantas etapas foram concluídas e uma barra de progresso.

O progresso é salvo no próprio aplicativo.

### Etapas

A jornada inclui:

- Entender a situação atual.
- Organizar contas e lançamentos.
- Identificar vazamentos.
- Montar plano contra dívidas.
- Construir reserva de emergência.
- Aumentar patrimônio.

Cada etapa possui:

- Caixa de seleção para marcar como concluída.
- Descrição do objetivo.
- Botão para abrir a tela correspondente.

### Como usar

Siga as etapas na ordem sugerida. Marque uma etapa como concluída quando tiver revisado os dados ou executado a ação proposta.

A jornada não altera seus lançamentos automaticamente. Ela funciona como um guia para usar melhor as telas do Fina.

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

## Plano de saída

A tela `Plano de saída` ajuda a comparar estratégias para quitar dívidas. Ela usa as dívidas ativas cadastradas no Fina e mostra uma simulação de prazo, juros e economia.

Se não houver dívidas ativas, a tela informa que não há plano a montar e oferece acesso à tela `Dívidas`.

### Resumo

No topo da tela aparecem:

- `Total em dívidas`: soma dos saldos devedores ativos.
- `Parcelas mínimas`: soma das parcelas mensais cadastradas.
- `Economia projetada`: economia estimada em juros com o pagamento extra informado.

### Pagamento extra mensal

Informe quanto você pretende pagar além das parcelas mínimas todo mês e clique em `Recalcular`.

Esse valor extra é direcionado para a dívida prioritária de cada estratégia. Ao pressionar `Enter` no campo, o plano também é recalculado.

### Estratégias comparadas

A tela compara duas estratégias:

- `Maior juros primeiro`: prioriza a dívida com maior taxa de juros. Geralmente reduz o total pago em juros.
- `Menor dívida primeiro`: prioriza a dívida com menor saldo. Geralmente ajuda a eliminar dívidas mais rápido e ganhar motivação.

Cada estratégia mostra:

- Prazo estimado de quitação.
- Juros estimados.
- Total pago.
- Economia em relação ao cenário sem pagamento extra.

### Ordem recomendada

O Fina mostra a ordem sugerida de pagamento, com prioridade, nome da dívida, saldo, juros ao mês e parcela.

Use essa ordem como referência para decidir onde colocar pagamentos extras.

## Reserva

A tela `Reserva` ajuda a calcular e acompanhar uma reserva de emergência.

Ela usa a média de despesas dos últimos 3 meses e o saldo disponível em contas que não são cartão de crédito.

### Cartões principais

A tela mostra:

- `Despesa média`: média de despesas dos últimos 3 meses.
- `Saldo em contas`: valor disponível em contas.
- `Reserva ideal`: valor necessário para o objetivo escolhido.

### Objetivo de reserva

Escolha um objetivo:

- `3 meses`: ponto de partida para proteção básica.
- `6 meses`: objetivo equilibrado.
- `12 meses`: proteção mais conservadora.

O Fina mostra o percentual concluído, quanto falta e uma barra de progresso.

### Contribuição necessária

A tela calcula quanto seria necessário guardar por mês para completar a reserva em:

- 3 meses.
- 6 meses.
- 12 meses.

Use esses valores para decidir uma contribuição mensal realista.

### Como interpretar

Se ainda não houver despesas registradas, o Fina informa que não há dados suficientes para calcular uma reserva realista.

Quanto mais completas forem as despesas registradas, melhor será a estimativa da reserva.

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

### IA

Permite configurar o Assistente IA.

Campos e opções disponíveis:

- `Ativar IA`: liga ou desliga a integração.
- `Provedor`: escolhe ChatGPT/OpenAI ou Gemini/Google.
- `Modelo`: define o modelo usado.
- `Chave de API`: salva ou substitui a chave do provedor.
- `Remover`: remove a chave salva.
- `Consentimento de envio`: registra que você entende que dados agregados poderão ser enviados quando solicitar uma análise.

O Fina avisa se a criptografia segura do sistema não estiver disponível. Nesse caso, a chave de API não é salva.

Mesmo com essa configuração ativa, o envio de dados exige confirmação na tela `Assistente IA`.

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

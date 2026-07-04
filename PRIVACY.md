# Privacidade no Fina

Este documento explica como o Fina lida com dados financeiros, backups, integrações externas e recursos de IA.

## Princípios

- Seus dados financeiros ficam armazenados localmente no seu computador.
- O Fina não possui servidor próprio para receber seus dados financeiros.
- Integrações externas são usadas somente para funções específicas.
- Recursos de IA são opcionais, desligados por padrão e exigem consentimento explícito.
- Dados sensíveis devem ser minimizados sempre que houver envio para terceiros.

## Dados armazenados localmente

O Fina usa SQLite para armazenar os dados no computador do usuário.

O banco pode conter:

- meios de pagamento;
- categorias;
- transações;
- orçamentos;
- contas a pagar;
- patrimônio;
- investimentos;
- metas;
- dívidas;
- configurações;
- logs internos de notificações e recorrências.

Por padrão, o arquivo fica em:

| Plataforma | Caminho |
|---|---|
| Linux | `~/.config/Fina/fina.db` |
| Windows | `%APPDATA%\Fina\fina.db` |

O caminho pode ser alterado com a variável `FINA_DB_PATH`.

## Backups

O Fina permite exportar e importar backups `.fin`.

Um backup contém uma cópia do banco de dados local. Portanto, pode conter dados financeiros sensíveis.

Recomendações:

- guarde backups em local seguro;
- evite enviar backups por e-mail ou mensageiros sem proteção;
- apague backups antigos quando não forem mais necessários;
- lembre-se de que importar um backup substitui os dados atuais.

## OCR de comprovantes e notas fiscais

O Fina pode ler o valor, a data e o estabelecimento de uma foto de comprovante ou nota fiscal para pré-preencher um lançamento.

Esse reconhecimento roda inteiramente no seu computador (biblioteca Tesseract OCR local) — a imagem do comprovante nunca é enviada para nenhum servidor. Na primeira vez que o recurso é usado, o Fina baixa um modelo de reconhecimento de texto em português (genérico, sem relação com seus dados) e guarda em cache para uso offline nas próximas vezes.

## Chaves de API de IA

As chaves de API de IA não são salvas no banco SQLite.

Elas são armazenadas em arquivo separado na pasta de dados do aplicativo e criptografadas com o mecanismo seguro disponível no sistema operacional via Electron `safeStorage`.

Se a criptografia segura não estiver disponível, o Fina não salva a chave.

As chaves de API não devem aparecer em:

- logs;
- backups;
- exports;
- relatórios;
- tela do aplicativo depois de salvas.

O usuário pode remover a chave salva em `Configurações > IA` ou na tela `Assistente IA`.

## Integração com IA

O Fina pode se integrar com:

- ChatGPT / OpenAI;
- Gemini / Google.

A integração com IA:

- fica desativada por padrão;
- exige ativação manual;
- exige chave de API do próprio usuário;
- exige consentimento de envio;
- exige confirmação antes de cada pergunta;
- pode ser desativada a qualquer momento.

## Dados enviados para IA

Quando o usuário confirma uma pergunta, o Fina envia apenas um resumo financeiro agregado e minimizado.

Dados que podem ser enviados:

- renda e despesas mensais agregadas;
- despesas por categoria;
- saldos totais por tipo de meio de pagamento;
- total de dívidas por tipo e status;
- taxas e parcelas agregadas de dívidas;
- orçamentos do mês;
- metas por tipo;
- investimentos por tipo;
- bens por tipo;
- evolução mensal resumida.

Dados que não são enviados por padrão:

- nome completo;
- e-mail;
- nomes de bancos;
- descrições de transações;
- observações pessoais;
- dados brutos linha a linha;
- chaves de API;
- backups;
- arquivos anexados pelo usuário.

Se algum modo futuro precisar enviar dados detalhados, ele deve exigir consentimento separado e explicar exatamente o que será enviado.

## Limites das respostas de IA

As respostas de IA são informativas e educacionais.

Elas não substituem:

- conferência dos seus dados;
- planejamento financeiro próprio;
- orientação profissional financeira;
- orientação fiscal;
- orientação jurídica;
- recomendação personalizada de investimento.

O usuário deve revisar as respostas antes de tomar decisões.

## Integrações de mercado

A tela `Mercado` busca cotações em APIs públicas para exibir câmbio, índices, cripto e Selic.

Essas consultas não precisam dos seus dados financeiros pessoais.

## Atualizações

A verificação de atualização consulta a API pública do GitHub para saber se existe uma nova release do Fina.

Essa consulta não envia seus dados financeiros.

## Responsabilidade do usuário

O usuário é responsável por:

- manter o computador protegido;
- guardar backups com cuidado;
- proteger suas chaves de API;
- revisar dados antes de enviar para provedores de IA;
- conferir informações importantes antes de tomar decisões financeiras.

## Alterações nesta política

Este documento deve ser atualizado quando novas integrações, novos tipos de dados ou novos fluxos de envio externo forem adicionados ao Fina.

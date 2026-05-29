# Fina — Gerenciador de Finanças Pessoais

Aplicativo desktop para controle de finanças pessoais, construído com **Electron + TypeScript + SQLite**.

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Desktop | Electron 34 |
| Linguagem | TypeScript 5 |
| Banco de dados | SQLite via `better-sqlite3` |
| Build | esbuild |
| Testes | `node:test` (built-in) |
| Ícones | Tabler Icons CDN |
| Fontes | Inter (Google Fonts) |

---

## Pré-requisitos

- **Node.js** ≥ 18 (testado com v24)
- **npm** ≥ 9
- Ferramentas de compilação nativa para `better-sqlite3`:
  - **Linux:** `gcc`, `make`, `python3` (`build-essential`)
  - **macOS:** Xcode Command Line Tools
  - **Windows:** Visual C++ Build Tools

---

## Instalação

```bash
# 1. Clone ou baixe o repositório
cd /caminho/para/Fina

# 2. Instale as dependências (already rebuilds better-sqlite3 via postinstall)
npm install

# 3. Compile o projeto
npm run build
```

---

## Uso em desenvolvimento

Abra dois terminais:

```bash
# Terminal 1 — watch (recompila ao salvar)
npm run watch

# Terminal 2 — inicia o Electron
npm start
```

---

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run build` | Compila main + preload + renderer |
| `npm run watch` | Compilação contínua (dev) |
| `npm start` | Abre o app Electron |
| `npm run typecheck` | Verificação de tipos sem compilar |
| `npm test` | Roda os testes unitários |
| `npm run build:tests` | Compila apenas os testes |

---

## Estrutura do projeto

```
src/
├── main/
│   ├── index.ts          # Main process: janela, splash, IPC
│   ├── preload.ts        # Context bridge (segurança)
│   ├── database.ts       # SQLite (better-sqlite3) + migrations
│   ├── ipc/              # Handlers IPC por domínio
│   │   ├── accounts.ts
│   │   ├── transactions.ts
│   │   ├── categories.ts
│   │   ├── budgets.ts
│   │   ├── bills.ts
│   │   └── settings.ts
│   └── migrations/
│       └── 001_initial.sql   # Schema completo + seed data
├── renderer/
│   ├── index.html        # Shell HTML + CSS (design system)
│   ├── splash.html       # Tela de abertura (banner Fina)
│   ├── index.ts          # Entry point
│   ├── router.ts         # Roteador hash-based
│   ├── api.ts            # Wrapper tipado do IPC
│   ├── components/
│   │   ├── sidebar.ts
│   │   ├── topbar.ts
│   │   ├── charts.ts     # SVG: donut + barras
│   │   └── modal.ts
│   └── pages/
│       ├── dashboard.ts
│       ├── transactions.ts
│       ├── accounts.ts
│       ├── budget.ts
│       ├── reports.ts
│       ├── settings.ts
│       └── agenda.ts
└── shared/
    ├── types.ts          # Interfaces TypeScript compartilhadas
    └── utils.ts          # Funções puras (formatação, cálculos)

tests/
├── accounts.test.ts
└── transactions.test.ts
```

---

## Banco de dados

O arquivo SQLite fica em:

| Plataforma | Caminho |
|---|---|
| Linux | `~/.config/Fina/fina.db` |
| macOS | `~/Library/Application Support/Fina/fina.db` |
| Windows | `%APPDATA%\Fina\fina.db` |

Para usar um caminho customizado:

```bash
FINA_DB_PATH=/meu/caminho/fina.db npm start
```

---

## Entidades do banco

| Tabela | Descrição |
|---|---|
| `accounts` | Contas (corrente, poupança, cartão, carteira) |
| `categories` | Categorias de receita e despesa |
| `transactions` | Lançamentos financeiros |
| `budgets` | Orçamentos mensais por categoria |
| `bills` | Contas a pagar/receber |
| `app_settings` | Configurações do usuário |
| `schema_migrations` | Controle de migrações executadas |

---

## Paleta de cores (dark mode)

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#0F1117` | Fundo geral |
| `--surface` | `#1A1D27` | Cards, sidebar |
| `--accent` | `#1D9E75` | Verde principal |
| `--danger` | `#D85A30` | Vermelho/despesas |
| `--warning` | `#EF9F27` | Amarelo/alertas |
| `--border` | `#2A2D3A` | Bordas sutis |

---

## Testes

```bash
npm test
# 28 testes — 8 suites — 0 falhas
```

Cobertura:
- Cálculo de saldo total e crédito disponível
- Filtragem de transações por intervalo de datas
- Resumo mensal (receitas, despesas, saldo)
- Percentual de orçamento (incluindo excedido)
- Formatação de datas e moeda

---

## Licença

MIT — uso pessoal e comercial livre.

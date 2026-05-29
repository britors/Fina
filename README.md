# Fina — Gerenciador de Finanças Pessoais

Aplicativo desktop para controle de finanças pessoais, construído com **Electron + TypeScript + SQLite**.

---

## Instalação

### Linux — Arch / Manjaro (AUR)

```bash
# Com yay
yay -S fina

# Com paru
paru -S fina
```

### Linux — Debian / Ubuntu (.deb)

```bash
# Baixe o .deb da página de releases
wget https://github.com/britors/Fina/releases/latest/download/fina_amd64.deb
sudo dpkg -i fina_amd64.deb
```

### Linux — Fedora / openSUSE (.rpm)

```bash
# Baixe o .rpm da página de releases
wget https://github.com/britors/Fina/releases/latest/download/fina_x86_64.rpm
sudo rpm -i fina_x86_64.rpm
# ou
sudo dnf install fina_x86_64.rpm
```

### Windows

Baixe o instalador `.exe` na [página de releases](https://github.com/britors/Fina/releases/latest) e execute-o.  
Compatível com Windows 10/11 (x64).

---

## Releases

Os pacotes são gerados automaticamente pelo GitHub Actions a cada tag `v*`.  
Acesse: **[github.com/britors/Fina/releases](https://github.com/britors/Fina/releases)**

| Plataforma | Arquivo | Gerado via |
| --- | --- | --- |
| Arch Linux | AUR (`fina`) | PKGBUILD — build from source |
| Debian / Ubuntu | `.deb` | GitHub Actions → electron-builder |
| Fedora / openSUSE | `.rpm` | GitHub Actions → electron-builder |
| Windows 10/11 | `.exe` (NSIS) | GitHub Actions → electron-builder |

### Criar um release

```bash
git tag v1.0.0
git push origin v1.0.0
```

O workflow `.github/workflows/release.yml` dispara automaticamente, gera os pacotes e cria o release com os artefatos.

---

## Desenvolvimento

### Pré-requisitos

- **Node.js** ≥ 18 (testado com v24)
- **npm** ≥ 9
- Ferramentas de compilação nativa para `better-sqlite3`:
  - **Linux:** `gcc`, `make`, `python3` (`build-essential`)
  - **Windows:** Visual C++ Build Tools

### Configuração

```bash
git clone https://github.com/britors/Fina.git
cd Fina
npm install
npm run build
npm start
```

### Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run build` | Compila main + preload + renderer |
| `npm run watch` | Compilação contínua (dev) |
| `npm start` | Abre o app Electron |
| `npm run typecheck` | Verificação de tipos |
| `npm test` | Testes unitários |
| `npm run dist` | Empacota para a plataforma atual |
| `npm run dist:linux` | Gera `.deb` e `.rpm` |
| `npm run dist:win` | Gera instalador `.exe` |

---

## Funcionalidades

| Módulo | Descrição |
|---|---|
| Dashboard | Resumo financeiro, previsão de saldo 30 dias, indicadores de mercado |
| Transações | Lançamentos com categorias, filtros e importação CSV/OFX |
| Contas | Corrente, poupança, cartão de crédito, carteira |
| Orçamento | Limites mensais por categoria com alertas |
| Relatórios | Histórico de até 12 meses, exportação PDF e CSV |
| Agenda | Contas a pagar e receber com recorrências automáticas |
| Patrimônio | Imóveis, veículos, terrenos e outros bens |
| Investimentos | Carteira com alocação e rendimento |
| Metas | Planejamento com prazo e progresso |
| Dívidas | Empréstimos, financiamentos e simulador de quitação |
| Mercado | Câmbio (USD/EUR/BTC), bolsas (Ibovespa, S&P 500, Nasdaq) e Selic |

---

## Estrutura do projeto

```text
src/
├── main/
│   ├── index.ts              # Main process: janela, splash, IPC
│   ├── preload.ts            # Context bridge (segurança)
│   ├── database.ts           # SQLite + migrations
│   ├── notifications.ts      # Notificações nativas
│   ├── recurrences.ts        # Geração de recorrências no startup
│   ├── ipc/                  # Handlers IPC por domínio
│   │   ├── accounts.ts
│   │   ├── transactions.ts
│   │   ├── categories.ts
│   │   ├── budgets.ts
│   │   ├── bills.ts
│   │   ├── settings.ts
│   │   ├── assets.ts
│   │   ├── investments.ts
│   │   ├── goals.ts
│   │   ├── debts.ts
│   │   ├── forecast.ts
│   │   ├── market.ts
│   │   ├── import.ts
│   │   └── export.ts
│   ├── import/
│   │   ├── csv-parser.ts
│   │   └── ofx-parser.ts
│   └── migrations/
│       ├── 001_initial.sql
│       ├── 002_assets_investments.sql
│       └── 003_goals_debts.sql
├── renderer/
│   ├── index.html            # Shell HTML + CSS (design system dark)
│   ├── splash.html           # Tela de abertura
│   ├── router.ts             # Roteador hash-based
│   ├── api.ts                # Wrapper tipado do IPC
│   ├── components/
│   │   ├── sidebar.ts
│   │   ├── topbar.ts
│   │   ├── charts.ts         # SVG: donut, barras, área
│   │   └── modal.ts
│   └── pages/
│       ├── dashboard.ts
│       ├── transactions.ts
│       ├── accounts.ts
│       ├── budget.ts
│       ├── reports.ts
│       ├── settings.ts
│       ├── agenda.ts
│       ├── patrimonio.ts
│       ├── investments.ts
│       ├── goals.ts
│       ├── debts.ts
│       └── market.ts
└── shared/
    ├── types.ts              # Interfaces TypeScript compartilhadas
    └── utils.ts              # Funções puras (formatação, cálculos)
```

---

## Banco de dados

O arquivo SQLite fica em:

| Plataforma | Caminho |
|---|---|
| Linux | `~/.config/Fina/fina.db` |
| Windows | `%APPDATA%\Fina\fina.db` |

Para usar um caminho customizado:

```bash
FINA_DB_PATH=/meu/caminho/fina.db npm start
```

---

## Testes

```bash
npm test
```

---

## Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Desktop | Electron 34 |
| Linguagem | TypeScript |
| Banco de dados | SQLite via `better-sqlite3` |
| Build | esbuild |
| Empacotamento | electron-builder |
| Testes | `node:test` (built-in) |
| Ícones | Tabler Icons CDN |
| Fontes | Inter (Google Fonts) |

---

## Licença

GPL-3.0 — veja [LICENSE](LICENSE).

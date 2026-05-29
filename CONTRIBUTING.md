# Contribuindo com o Fina

Obrigado pelo interesse em contribuir! Este documento explica como participar do projeto.

---

## Antes de começar

- Leia o [README](README.md) para entender a stack e como rodar o projeto.
- Verifique as [issues abertas](https://github.com/britors/Fina/issues) antes de começar algo novo.
- Para mudanças grandes, abra uma issue primeiro para discutir a abordagem.

---

## Configurando o ambiente

```bash
git clone git@github.com:britors/Fina.git
cd Fina
npm install          # instala deps + rebuild do better-sqlite3
npm run build        # compila main + preload + renderer
npm start            # abre o app
```

**Pré-requisitos:** Node.js ≥ 18, ferramentas de build nativas (`gcc`, `make`, `python3`).

---

## Fluxo de contribuição

1. **Fork** o repositório e clone o seu fork.
2. Crie uma branch descritiva a partir de `main`:
   ```bash
   git checkout -b feat/importacao-csv
   ```
3. Faça as alterações seguindo os padrões abaixo.
4. Rode os testes:
   ```bash
   npm test
   ```
5. Rode a verificação de tipos:
   ```bash
   npm run typecheck
   ```
6. Abra um **Pull Request** para `main` com uma descrição clara do que foi feito e por quê.

---

## Padrões de código

### Geral
- **TypeScript estrito** — sem `any` implícito, sem `as unknown`.
- **Sem frameworks frontend** — vanilla TypeScript + DOM. Nada de React, Vue, Svelte.
- **Sem ORM** — SQL puro via `better-sqlite3`.
- Funções puras e testáveis ficam em `src/shared/utils.ts`.

### Nomenclatura
- Arquivos: `kebab-case.ts`
- Funções/variáveis: `camelCase`
- Tipos/interfaces: `PascalCase`
- Canais IPC: `entidade:acao` (ex: `accounts:list`, `transactions:create`)

### Banco de dados
- Toda mudança de schema vai em um novo arquivo de migration: `src/main/migrations/002_descricao.sql`
- Migrations são idempotentes (`CREATE TABLE IF NOT EXISTS`, `INSERT OR IGNORE`).
- Amounts em `REAL` (nunca `TEXT` para valores numéricos).

### Commits
Seguimos [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: adiciona importação de extrato OFX
fix: corrige cálculo de saldo em transferências
chore: atualiza dependências
docs: documenta fluxo de Open Finance
```

---

## Testes

- Testes ficam em `tests/`, usam `node:test` (built-in do Node.js).
- **Apenas lógica pura** — sem dependência de Electron ou SQLite nos testes.
- Funções testáveis devem ser extraídas para `src/shared/utils.ts`.

```bash
npm test              # compila e roda todos os testes
npm run build:tests   # só compila os testes
```

---

## Reportando bugs

Abra uma [issue](https://github.com/britors/Fina/issues/new) com:

- Versão do Fina (`Configurações → Sobre`)
- Sistema operacional e versão
- Passos para reproduzir
- Comportamento esperado vs. observado
- Logs do DevTools se aplicável (`Ctrl+Shift+I`)

---

## Licença

Ao contribuir, você concorda que sua contribuição será licenciada sob a [GPLv3](LICENSE).

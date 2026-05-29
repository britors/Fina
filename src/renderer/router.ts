import { render as renderDashboard    } from './pages/dashboard';
import { render as renderTransactions } from './pages/transactions';
import { render as renderAccounts     } from './pages/accounts';
import { render as renderBudget       } from './pages/budget';
import { render as renderReports      } from './pages/reports';
import { render as renderSettings     } from './pages/settings';
import { render as renderAgenda       } from './pages/agenda';
import { render as renderPatrimonio   } from './pages/patrimonio';
import { render as renderInvestments  } from './pages/investments';
import { render as renderGoals        } from './pages/goals';
import { render as renderDebts        } from './pages/debts';
import { render as renderMarket       } from './pages/market';
import { setActiveRoute               } from './components/sidebar';
import { setTopbar                    } from './components/topbar';

interface Route {
  title: string | (() => string);
  subtitle?: string | (() => string);
  render: (el: HTMLElement) => void | Promise<void>;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'dia' : h < 18 ? 'tarde' : 'noite';
}

function monthLabel(): string {
  return new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function fullDateLabel(): string {
  return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const ROUTES: Record<string, Route> = {
  dashboard:    { title: 'Bem-vindo',                                   subtitle: fullDateLabel,  render: renderDashboard    },
  transactions: { title: 'Transações',                                  subtitle: monthLabel,     render: renderTransactions },
  accounts:     { title: 'Contas',                                                                render: renderAccounts     },
  budget:       { title: 'Orçamento',                                   subtitle: monthLabel,     render: renderBudget       },
  reports:      { title: 'Relatórios',    subtitle: 'Últimos 6 meses',                           render: renderReports      },
  settings:     { title: 'Configurações', subtitle: 'Personalize o Fina de acordo com suas preferências', render: renderSettings },
  agenda:       { title: 'Agenda',        subtitle: 'Contas a pagar e receber',                   render: renderAgenda       },
  patrimonio:   { title: 'Patrimônio',    subtitle: 'Imóveis, veículos e outros bens',             render: renderPatrimonio   },
  investments:  { title: 'Investimentos', subtitle: 'Carteira e rendimentos',                      render: renderInvestments  },
  goals:        { title: 'Metas',         subtitle: 'Planejamento financeiro',                      render: renderGoals        },
  debts:        { title: 'Dívidas',       subtitle: 'Empréstimos e financiamentos',                 render: renderDebts        },
  market:       { title: 'Mercado',       subtitle: 'Câmbio, bolsas e indicadores',                 render: renderMarket       },
};

export function initRouter(content: HTMLElement): void {
  async function navigate(hash: string): Promise<void> {
    const key   = hash.replace(/^#/, '') || 'dashboard';
    const route = ROUTES[key] ?? ROUTES.dashboard;

    setActiveRoute(key);
    setTopbar(
      typeof route.title    === 'function' ? route.title()    : route.title,
      typeof route.subtitle === 'function' ? route.subtitle() : route.subtitle,
    );

    content.innerHTML = '';
    content.className = 'page-enter';
    try {
      await route.render(content);
    } catch (err) {
      content.innerHTML = `<div class="alert alert-error">Erro ao carregar página: ${err}</div>`;
    }
  }

  window.addEventListener('hashchange', () => navigate(window.location.hash));
  navigate(window.location.hash || '#dashboard');
}

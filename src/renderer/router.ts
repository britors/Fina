import { render as renderDashboard    } from './pages/dashboard';
import { render as renderAlertas      } from './pages/alertas';
import { render as renderAssistente   } from './pages/assistente';
import { render as renderDiagnostico  } from './pages/diagnostico';
import { render as renderPlanoMensal  } from './pages/planoMensal';
import { render as renderScore        } from './pages/score';
import { render as renderRevisaoSemanal } from './pages/revisaoSemanal';
import { render as renderDecisoes     } from './pages/decisoes';
import { render as renderTransactions } from './pages/transactions';
import { render as renderAccounts     } from './pages/accounts';
import { render as renderBudget       } from './pages/budget';
import { render as renderReports      } from './pages/reports';
import { render as renderSettings     } from './pages/settings';
import { render as renderAgenda       } from './pages/agenda';
import { render as renderFixas        } from './pages/fixas';
import { render as renderCalendario   } from './pages/calendario';
import { render as renderPatrimonio   } from './pages/patrimonio';
import { render as renderInvestments  } from './pages/investments';
import { render as renderJornada      } from './pages/jornada';
import { render as renderSimuladorPatrimonio } from './pages/simuladorPatrimonio';
import { render as renderGoals        } from './pages/goals';
import { render as renderDebts        } from './pages/debts';
import { render as renderPlanoDividas } from './pages/planoDividas';
import { render as renderRenegociacao } from './pages/renegociacao';
import { render as renderReserva      } from './pages/reserva';
import { render as renderMarket       } from './pages/market';
import { render as renderIRPF         } from './pages/irpf';
import { render as renderManual       } from './pages/manual';
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
  alertas:      { title: 'Alertas',      subtitle: 'Riscos e oportunidades financeiras',           render: renderAlertas      },
  assistente:   { title: 'Assistente IA', subtitle: 'Análise educacional com dados minimizados',    render: renderAssistente   },
  diagnostico:  { title: 'Diagnóstico',  subtitle: 'Situação financeira e próximos passos',        render: renderDiagnostico  },
  'plano-mensal': { title: 'Plano mensal', subtitle: 'Sugestão de uso da renda do mês',             render: renderPlanoMensal  },
  score:        { title: 'Score', subtitle: 'Pontuação de saúde financeira',                         render: renderScore        },
  'revisao-semanal': { title: 'Revisão semanal', subtitle: 'Checklist financeiro da semana',          render: renderRevisaoSemanal },
  decisoes:     { title: 'Decisões', subtitle: 'Prioridades financeiras sugeridas',                    render: renderDecisoes     },
  transactions: { title: 'Transações',                                  subtitle: monthLabel,     render: renderTransactions },
  accounts:     { title: 'Meios de pagamento',                                                    render: renderAccounts     },
  budget:       { title: 'Orçamento',                                   subtitle: monthLabel,     render: renderBudget       },
  reports:      { title: 'Relatórios',    subtitle: 'Últimos 6 meses',                           render: renderReports      },
  settings:     { title: 'Configurações', subtitle: 'Personalize o Fina de acordo com suas preferências', render: renderSettings },
  agenda:       { title: 'Contas à pagar',        subtitle: 'Contas a pagar e receber',                   render: renderAgenda       },
  fixas:        { title: 'Despesas fixas', subtitle: 'Assinaturas e compromissos recorrentes',             render: renderFixas        },
  calendario:   { title: 'Calendário', subtitle: 'Vencimentos e lançamentos por dia',                      render: renderCalendario   },
  patrimonio:   { title: 'Patrimônio',    subtitle: 'Imóveis, veículos e outros bens',             render: renderPatrimonio   },
  investments:  { title: 'Investimentos', subtitle: 'Carteira e rendimentos',                      render: renderInvestments  },
  'simulador-patrimonio': { title: 'Simulador', subtitle: 'Projeção de patrimônio futuro',          render: renderSimuladorPatrimonio },
  jornada:      { title: 'Jornada',       subtitle: 'Passos guiados para evoluir financeiramente',  render: renderJornada      },
  goals:        { title: 'Metas',         subtitle: 'Planejamento financeiro',                      render: renderGoals        },
  debts:        { title: 'Dívidas',       subtitle: 'Empréstimos e financiamentos',                 render: renderDebts        },
  'plano-dividas': { title: 'Plano de saída', subtitle: 'Estratégias para quitar dívidas',           render: renderPlanoDividas },
  renegociacao: { title: 'Renegociação', subtitle: 'Prioridades e propostas para dívidas',            render: renderRenegociacao },
  reserva:      { title: 'Reserva',       subtitle: 'Proteção para emergências',                     render: renderReserva      },
  market:       { title: 'Mercado',       subtitle: 'Câmbio, bolsas e indicadores',                 render: renderMarket       },
  irpf:         { title: 'IRPF',          subtitle: 'Informe de rendimentos para declaração',        render: renderIRPF         },
  manual:       { title: 'Manual',        subtitle: 'Guia de uso do Fina',                           render: renderManual       },
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

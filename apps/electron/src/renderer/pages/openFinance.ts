import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { setTopbarActions } from '../components/topbar';
import { showAlert, showConfirm } from '../components/alertDialog';
import type { AccountType, OpenFinanceOverview, OpenFinanceProviderOverview } from '../../shared/types';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  credit_card: 'Cartão de crédito',
  meal_voucher: 'Vale refeição',
  food_voucher: 'Vale alimentação',
  wallet: 'Carteira',
};

const STATUS_BADGES: Record<OpenFinanceProviderOverview['status'], string> = {
  active: 'badge-confirmed',
  pending: 'badge-pending',
  incomplete: 'badge-warn',
  disabled: 'badge-pending',
  unsupported: 'badge-warn',
  awaiting_import: 'badge-warn',
};

export async function render(el: HTMLElement): Promise<void> {
  let overview = await invoke<OpenFinanceOverview>('openFinance:getOverview');

  setTopbarActions(`
    <button class="btn btn-secondary" id="btn-of-settings">
      <i class="ti ti-settings"></i> Configurar
    </button>
    <button class="btn btn-primary" id="btn-of-refresh">
      <i class="ti ti-refresh"></i> Atualizar
    </button>
  `);

  document.getElementById('btn-of-settings')?.addEventListener('click', () => {
    window.location.hash = '#settings';
  });
  document.getElementById('btn-of-refresh')?.addEventListener('click', async () => {
    overview = await invoke<OpenFinanceOverview>('openFinance:getOverview');
    renderPage();
  });

  function renderPage(): void {
    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Saldo conectado</div>
          <div class="stat-value stat-green">${formatCurrency(overview.totalBalance)}</div>
          <div class="stat-sub">${overview.accountCount} conta${overview.accountCount !== 1 ? 's' : ''} ou cartão${overview.accountCount !== 1 ? 's' : ''}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Provedores ativos</div>
          <div class="stat-value">${overview.providers.filter(p => p.enabled).length}</div>
          <div class="stat-sub">de ${overview.providers.length} configurados no Fina</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Instituições conectadas</div>
          <div class="stat-value">${new Set(overview.providers.flatMap(p => p.institutions.map(i => i.name))).size}</div>
          <div class="stat-sub">agrupadas por banco/instituição</div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        ${overview.providers.map(providerCard).join('')}
      </div>
    `;

    el.querySelectorAll<HTMLElement>('[data-sync-provider]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const provider = btn.dataset.syncProvider!;
        await syncProvider(provider);
      });
    });

    el.querySelectorAll<HTMLElement>('[data-sync-account]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const [provider, accountId] = (btn.dataset.syncAccount ?? '').split(':');
        if (!provider || !accountId) return;
        await syncProvider(provider, accountId);
      });
    });

    el.querySelectorAll<HTMLElement>('[data-disable-provider]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const provider = btn.dataset.disableProvider!;
        if (!await showConfirm('Desconectar este provedor? Credenciais e identificador serão removidos. Contas e lançamentos já importados serão mantidos como dados locais.', { danger: true, okLabel: 'Desconectar' })) return;
        overview = await invoke<OpenFinanceOverview>('openFinance:disableProvider', provider);
        renderPage();
      });
    });
  }

  async function syncProvider(provider: string, accountId?: string): Promise<void> {
    try {
      const result = await invoke<{ accountsCreated: number; accountsUpdated: number; transactionsImported: number; transactionsSkipped: number }>('openFinance:syncProvider', {
        provider,
        accountId,
      });
      showAlert([
        'Sincronização concluída.',
        `Contas criadas: ${result.accountsCreated}`,
        `Contas atualizadas: ${result.accountsUpdated}`,
        `Lançamentos importados: ${result.transactionsImported}`,
        `Duplicados ignorados: ${result.transactionsSkipped}`,
      ].join('\n'));
      overview = await invoke<OpenFinanceOverview>('openFinance:getOverview');
      renderPage();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Não foi possível sincronizar.');
    }
  }

  renderPage();
}

function providerCard(provider: OpenFinanceProviderOverview): string {
  const canSync = provider.supportedSync && provider.enabled && provider.hasCredentials && provider.hasConnectionId;
  return `
    <div class="card">
      <div class="card-header">
        <div style="display:flex;align-items:center;gap:10px">
          <span>${esc(provider.name)}</span>
          <span class="badge ${STATUS_BADGES[provider.status]}">${esc(provider.statusLabel)}</span>
        </div>
        <div style="font-size:0.78rem;color:var(--text-3)">
          ${provider.connectionIdMasked ? `Conexão ${esc(provider.connectionIdMasked)}` : 'Sem identificador de conexão'}
        </div>
      </div>
      <div class="card-hr"></div>
      <div class="card-body">
        <div class="grid-3" style="margin-bottom:14px">
          <div>
            <div class="stat-label">Saldo vinculado</div>
            <div style="font-weight:600">${formatCurrency(provider.totalBalance)}</div>
          </div>
          <div>
            <div class="stat-label">Contas e cartões</div>
            <div style="font-weight:600">${provider.accountCount}</div>
          </div>
          <div>
            <div class="stat-label">Sincronização</div>
            <div style="font-weight:600;color:${provider.supportedSync ? 'var(--accent)' : provider.supportsConnect ? 'var(--warning)' : 'var(--text-3)'}">${provider.supportedSync ? 'Automática' : provider.supportsConnect ? 'Manual (importação)' : 'Não disponível'}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:14px">
          <div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:10px 12px">
            <div class="stat-label">Última sincronização</div>
            <div style="font-size:0.86rem;color:var(--text-2)">${provider.lastSyncAt ? formatDateTime(provider.lastSyncAt) : 'Ainda não sincronizado'}</div>
          </div>
          <div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:10px 12px">
            <div class="stat-label">Último erro</div>
            <div style="font-size:0.86rem;color:${provider.lastError ? 'var(--danger)' : 'var(--text-3)'}">${provider.lastError ? esc(provider.lastError) : 'Nenhum erro registrado'}</div>
          </div>
        </div>

        ${provider.institutions.length === 0
          ? emptyProviderState(provider)
          : provider.institutions.map(institution => `
              <div style="border:0.5px solid var(--border);border-radius:8px;margin-top:10px;overflow:hidden">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;background:var(--bg);padding:10px 12px">
                  <div>
                    <div style="font-weight:600">${esc(institution.name)}</div>
                    <div style="font-size:0.76rem;color:var(--text-3)">${institution.accounts.length} produto${institution.accounts.length !== 1 ? 's' : ''} conectado${institution.accounts.length !== 1 ? 's' : ''}</div>
                  </div>
                  <strong>${formatCurrency(institution.totalBalance)}</strong>
                </div>
                <div>
                  ${institution.accounts.map(account => `
                    <div style="display:grid;grid-template-columns:minmax(0,1fr) 140px 130px auto;gap:12px;align-items:center;padding:10px 12px;border-top:0.5px solid var(--border)">
                      <div style="min-width:0">
                        <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(account.name)}</div>
                        <div style="font-size:0.75rem;color:var(--text-3)">${esc(ACCOUNT_TYPE_LABELS[account.type] ?? account.type)}</div>
                      </div>
                      <div style="font-size:0.78rem;color:var(--text-2)">${esc(provider.name)}</div>
                      <div style="font-weight:600;text-align:right">${formatCurrency(account.balance)}</div>
                      <button class="btn btn-ghost btn-sm" data-sync-account="${provider.provider}:${account.id}" ${canSync ? '' : 'disabled'} title="Sincronizar esta conta">
                        <i class="ti ti-refresh"></i>
                      </button>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')
        }

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" data-sync-provider="${provider.provider}" ${canSync ? '' : 'disabled'}>
            <i class="ti ti-refresh"></i> Sincronizar tudo
          </button>
          <button class="btn btn-ghost btn-sm" data-disable-provider="${provider.provider}" ${provider.enabled ? '' : 'disabled'}>
            <i class="ti ti-link-off"></i> Desconectar
          </button>
        </div>
      </div>
    </div>
  `;
}

function emptyProviderState(provider: OpenFinanceProviderOverview): string {
  const message = provider.status === 'disabled'
    ? 'Ative e configure este provedor em Configurações > Open Finance.'
    : provider.status === 'unsupported'
      ? 'Credenciais salvas, mas a sincronização automática deste provedor ainda não está implementada.'
      : provider.status === 'awaiting_import'
        ? 'Relatório solicitado à Klavi. Baixe o JSON no console da Klavi (ou copie o payload recebido no seu webhook) e importe em Configurações > Open Finance.'
        : provider.status === 'incomplete'
          ? 'Complete credenciais e identificador de conexão antes de sincronizar.'
          : provider.supportsConnect
            ? 'Nenhuma conta conectada ainda. Conclua a conexão em Configurações > Open Finance.'
            : 'Nenhuma conta sincronizada ainda.';

  return `
    <div class="empty" style="padding:24px">
      <i class="ti ti-plug-connected" style="font-size:2rem;color:var(--text-4)"></i>
      <div class="empty-title">Sem produtos conectados</div>
      <div class="empty-desc">${esc(message)}</div>
    </div>
  `;
}

function esc(s?: string | null): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g, '&quot;');
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

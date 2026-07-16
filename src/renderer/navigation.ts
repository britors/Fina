// Ponte para o drill-down dos gráficos de Relatórios: como o router só usa o
// hash como chave direta de rota (sem query string), o filtro desejado é
// deixado aqui antes de navegar e consumido uma única vez pela tela de
// destino, que limpa o valor após ler.
export interface PendingTransactionFilter {
  dateFrom?: string;
  dateTo?: string;
  type?: 'income' | 'expense';
  categoryId?: string;
  accountId?: string;
  owner?: string;
  status?: string;
  weekday?: number;
}

let pending: PendingTransactionFilter | null = null;

export function goToTransactions(filter: PendingTransactionFilter): void {
  pending = filter;
  if (window.location.hash === '#transactions') {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = '#transactions';
  }
}

export function consumePendingTransactionFilter(): PendingTransactionFilter | null {
  const value = pending;
  pending = null;
  return value;
}

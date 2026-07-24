function centsToDisplay(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Formata um valor numérico vindo do banco de dados para o texto inicial
// de um campo com máscara monetária (ex.: 1234.5 → "1.234,50").
export function formatMoneyValue(amount?: number | null): string {
  if (amount == null) return '';
  return amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Aplica a máscara de moeda brasileira a um <input type="text">: os dígitos
// digitados são sempre interpretados da direita para a esquerda como
// centavos (ex.: "12345" → "123,45"), no mesmo padrão usado por apps bancários.
// Um "-" em qualquer posição marca o valor como negativo (útil para saldos
// negativos, ex.: conta corrente no vermelho).
export function attachMoneyMask(input: HTMLInputElement | null): void {
  if (!input) return;
  input.addEventListener('input', () => {
    const negative = input.value.includes('-');
    const digits = input.value.replace(/\D/g, '');
    input.value = digits ? (negative ? '-' : '') + centsToDisplay(parseInt(digits, 10)) : '';
  });
}

// Lê o valor numérico atual de um campo com máscara monetária (NaN se vazio).
export function moneyInputValue(input: HTMLInputElement | null): number {
  const raw = input?.value ?? '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return NaN;
  const value = parseInt(digits, 10) / 100;
  return raw.includes('-') ? -value : value;
}

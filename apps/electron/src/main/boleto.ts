import { createWorker } from 'tesseract.js';
import { cacheDir } from './ocr';
import type { BoletoData } from '../shared/types';

// Data-base do fator de vencimento definida pela FEBRABAN para boletos de
// cobrança bancária (segmento que começa com o código do banco, não
// convênio/tributos — esses usam outro layout de código de barras e não são
// suportados aqui). Note: a partir de 2025 o fator, ao chegar a 9999,
// reinicia em 1000 em vez de 0000 — não afeta o cálculo abaixo, que só soma
// dias a partir da base, mas datas de vencimento muito distantes do
// presente merecem revisão manual antes de confirmar o lançamento.
const FEBRABAN_BASE_DATE_MS = Date.UTC(1997, 9, 7); // 07/10/1997

function fatorToDate(fator: number): string {
  const ms = FEBRABAN_BASE_DATE_MS + fator * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

// Módulo 10 usado para validar os 3 primeiros campos da linha digitável:
// peso alternado 2/1 a partir do dígito mais à direita do campo (sem o DV).
function mod10CheckDigit(digits: string): number {
  let peso = 2;
  let soma = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    let produto = Number(digits[i]) * peso;
    if (produto > 9) produto = Math.floor(produto / 10) + (produto % 10);
    soma += produto;
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

interface ParsedLinhaDigitavel {
  linha: string;
  valid: boolean;
  bankCode: string;
  dueDate: string | null;
  amount: number | null;
}

// Valida e decodifica uma linha digitável de 47 dígitos (sem separadores).
// Estrutura: campo1(9+DV) campo2(10+DV) campo3(10+DV) DVgeral(1) campo5(fator 4 + valor 10).
// O DV geral (módulo 11, calculado sobre o código de barras montado) não é
// verificado aqui — só os DVs de campo, que já dão forte indício de leitura
// correta sem precisar remontar o código de barras completo.
function parseLinhaDigits(digits: string): ParsedLinhaDigitavel | null {
  if (digits.length !== 47) return null;

  const campo1 = digits.slice(0, 9);
  const dv1 = Number(digits[9]);
  const campo2 = digits.slice(10, 20);
  const dv2 = Number(digits[20]);
  const campo3 = digits.slice(21, 31);
  const dv3 = Number(digits[31]);
  const campo5 = digits.slice(33, 47);

  const valid = mod10CheckDigit(campo1) === dv1 && mod10CheckDigit(campo2) === dv2 && mod10CheckDigit(campo3) === dv3;
  const fator = Number(campo5.slice(0, 4));
  const valorCentavos = Number(campo5.slice(4));

  return {
    linha: digits,
    valid,
    bankCode: digits.slice(0, 3),
    dueDate: fator > 0 ? fatorToDate(fator) : null,
    amount: Number.isFinite(valorCentavos) && valorCentavos > 0 ? valorCentavos / 100 : null,
  };
}

// Formato impresso padrão: 5.5 5.6 5.6 1 14 dígitos, com pontos/espaços
// flexíveis entre os grupos — muito mais confiável que procurar 47 dígitos
// soltos no texto (que poderia casar com outros números do boleto).
const LINHA_DIGITAVEL_GROUPED = /(\d{5})[.\s]+(\d{5})\s+(\d{5})[.\s]+(\d{6})\s+(\d{5})[.\s]+(\d{6})\s+(\d)\s+(\d{14})/;

function findLinhaDigitavel(text: string): ParsedLinhaDigitavel | null {
  const grouped = text.match(LINHA_DIGITAVEL_GROUPED);
  if (grouped) {
    const digits = grouped.slice(1).join('');
    const parsed = parseLinhaDigits(digits);
    if (parsed) return parsed;
  }

  // Fallback: OCR pode ter perdido os separadores. Varre todos os dígitos do
  // texto e testa cada janela de 47 dígitos contra os 3 checksums de campo —
  // uma janela aleatória tem chance desprezível de passar nos 3 ao mesmo tempo.
  const allDigits = text.replace(/\D/g, '');
  for (let i = 0; i + 47 <= allDigits.length; i++) {
    const candidate = allDigits.slice(i, i + 47);
    const parsed = parseLinhaDigits(candidate);
    if (parsed?.valid) return parsed;
  }
  return null;
}

const BENEFICIARIO_LABEL = /benefici[aá]rio|cedente|sacador/i;

// Mesma heurística de "primeira linha de conteúdo" do parseMerchant de
// comprovantes, mas procurando depois de um rótulo típico de boleto — o
// layout de boleto tem múltiplos blocos de texto, então a heurística
// ingênua de "primeira linha" de comprovante não serve aqui.
function parseBeneficiario(text: string): string | null {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (BENEFICIARIO_LABEL.test(lines[i])) {
      const sameLine = lines[i].replace(BENEFICIARIO_LABEL, '').replace(/^[:\s-]+/, '').trim();
      if (sameLine.length >= 3) return sameLine;
      const next = lines[i + 1];
      if (next && next.length >= 3) return next;
    }
  }
  return null;
}

export async function extractBoletoData(imagePath: string): Promise<BoletoData> {
  const worker = await createWorker('por', 1, { cachePath: cacheDir() });
  try {
    const { data } = await worker.recognize(imagePath);
    const rawText = data.text;
    const parsed = findLinhaDigitavel(rawText);
    return {
      raw_text: rawText,
      linha_digitavel: parsed?.linha ?? null,
      valid: parsed?.valid ?? false,
      bank_code: parsed?.bankCode ?? null,
      due_date: parsed?.dueDate ?? null,
      amount: parsed?.amount ?? null,
      beneficiario: parseBeneficiario(rawText),
    };
  } finally {
    await worker.terminate();
  }
}

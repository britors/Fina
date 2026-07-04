import * as path from 'node:path';
import { app } from 'electron';
import { createWorker } from 'tesseract.js';

export interface ReceiptData {
  rawText: string;
  amount: number | null;
  date: string | null;
  merchant: string | null;
}

// Onde o modelo de OCR (treinado para português) fica guardado depois de
// baixado uma vez — fora do diretório de instalação do app, que pode não
// ser gravável. Nada relacionado à imagem em si é enviado pra fora: o
// reconhecimento roda inteiramente local.
function cacheDir(): string {
  return path.join(app.getPath('userData'), 'ocr-cache');
}

const MONEY_REGEX = /(\d{1,3}(?:\.\d{3})*,\d{2})/g;

function toNumber(brMoney: string): number {
  return parseFloat(brMoney.replace(/\./g, '').replace(',', '.'));
}

// Procura o valor total do comprovante: prioriza uma linha contendo "total"
// com um valor monetário nela; sem isso, assume que o total é o maior valor
// monetário do texto (heurística razoável para cupons fiscais simples).
function parseAmount(text: string): number | null {
  for (const line of text.split('\n')) {
    if (/total/i.test(line)) {
      const matches = [...line.matchAll(MONEY_REGEX)];
      if (matches.length > 0) return toNumber(matches[matches.length - 1][1]);
    }
  }

  const all = [...text.matchAll(MONEY_REGEX)].map(m => toNumber(m[1]));
  return all.length > 0 ? Math.max(...all) : null;
}

function parseDate(text: string): string | null {
  const match = text.match(/(\d{2})[/.-](\d{2})[/.-](\d{2,4})/);
  if (!match) return null;
  const [, day, month, yearRaw] = match;
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  const d = Number(day), m = Number(month), y = Number(year);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Assume que o nome do estabelecimento é a primeira linha "de conteúdo" do
// comprovante (comum em cupons fiscais brasileiros) — é só um palpite
// inicial: o usuário sempre revisa antes de salvar o lançamento.
function parseMerchant(text: string): string | null {
  const line = text.split('\n')
    .map(l => l.trim())
    .find(l => l.length >= 3 && !/^\d+$/.test(l));
  return line ?? null;
}

export async function extractReceiptData(imagePath: string): Promise<ReceiptData> {
  const worker = await createWorker('por', 1, { cachePath: cacheDir() });
  try {
    const { data } = await worker.recognize(imagePath);
    const rawText = data.text;
    return {
      rawText,
      amount: parseAmount(rawText),
      date: parseDate(rawText),
      merchant: parseMerchant(rawText),
    };
  } finally {
    await worker.terminate();
  }
}

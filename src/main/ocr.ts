import * as path from 'node:path';
import { app } from 'electron';
import { createWorker } from 'tesseract.js';
import type { Bbox, Page, Worker } from 'tesseract.js';

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

// Palavras que costumam aparecer perto do valor final de um cupom fiscal
// brasileiro — "valor a pagar" nem sempre contém "total", e é o valor
// líquido de fato cobrado (após desconto/acréscimo).
const TOTAL_KEYWORDS = /total|desconto|acr[eé]scimo|pagar/i;

function toNumber(brMoney: string): number {
  return parseFloat(brMoney.replace(/\./g, '').replace(',', '.'));
}

function flattenLines(page: Page): { text: string; bbox: Bbox }[] {
  const lines: { text: string; bbox: Bbox }[] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        lines.push({ text: line.text, bbox: line.bbox });
      }
    }
  }
  return lines;
}

// Lê a largura/altura da imagem já processada pelo Tesseract a partir do
// cabeçalho do PNG que ele devolve (data.imageColor) — evita depender de
// uma biblioteca externa de imagem só para saber os limites antes de
// recortar uma região específica.
function pngDimensions(dataUri: string): { width: number; height: number } | null {
  const base64 = dataUri.split(',')[1];
  if (!base64) return null;
  const buf = Buffer.from(base64, 'base64');
  if (buf.length < 24) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Procura o valor total do comprovante. Fotos de cupons fiscais costumam ter
// a coluna de valores (à direita) mais apagada/desfocada que o restante, e o
// reconhecimento de página inteira às vezes perde só aqueles dígitos,
// deixando "VALOR TOTAL R$" e afins sem nenhum número na mesma linha. Nesse
// caso, refazer o OCR só na faixa vertical dessas linhas (até a borda da
// imagem) costuma recuperar os valores que se perderam na primeira passada.
async function parseAmount(worker: Worker, image: string | Buffer, page: Page): Promise<number | null> {
  const text = page.text;

  for (const line of text.split('\n')) {
    if (/total/i.test(line)) {
      const matches = [...line.matchAll(MONEY_REGEX)];
      if (matches.length > 0) return toNumber(matches[matches.length - 1][1]);
    }
  }

  const totalLines = flattenLines(page).filter(l => TOTAL_KEYWORDS.test(l.text));
  const dims = page.imageColor ? pngDimensions(page.imageColor) : null;

  if (totalLines.length > 0 && dims) {
    const left = Math.max(0, Math.min(...totalLines.map(l => l.bbox.x1)) - 10);
    const top = Math.max(0, Math.min(...totalLines.map(l => l.bbox.y0)) - 10);
    const bottom = Math.min(dims.height, Math.max(...totalLines.map(l => l.bbox.y1)) + 40);
    const width = dims.width - left;
    const height = bottom - top;

    if (width > 0 && height > 0) {
      try {
        const { data: focused } = await worker.recognize(image, { rectangle: { left, top, width, height } });
        const focusedMatches = [...focused.text.matchAll(MONEY_REGEX)].map(m => toNumber(m[1]));
        if (focusedMatches.length > 0) return focusedMatches[focusedMatches.length - 1];
      } catch {
        // Recorte inválido para essa imagem — segue para o fallback abaixo.
      }
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

export async function extractReceiptData(image: string | Buffer): Promise<ReceiptData> {
  const worker = await createWorker('por', 1, { cachePath: cacheDir() });
  try {
    const { data } = await worker.recognize(image, {}, { blocks: true, imageColor: true });
    const rawText = data.text;
    return {
      rawText,
      amount: await parseAmount(worker, image, data),
      date: parseDate(rawText),
      merchant: parseMerchant(rawText),
    };
  } finally {
    await worker.terminate();
  }
}

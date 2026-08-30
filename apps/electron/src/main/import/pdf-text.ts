import { readFileSync } from 'node:fs';
import type { PdfTextPage } from './bradesco-pdf-parser';

export async function extractPdfText(filePath: string): Promise<PdfTextPage[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes = new Uint8Array(readFileSync(filePath));
  const document = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  const pages: PdfTextPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({
        items: content.items.flatMap(item => {
          if (!('str' in item) || !item.str.trim()) return [];
          return [{ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }];
        }),
      });
    }
  } finally {
    await document.destroy();
  }
  return pages;
}

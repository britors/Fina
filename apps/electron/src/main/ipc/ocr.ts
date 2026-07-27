import { ipcMain, dialog } from 'electron';
import { extractReceiptData } from '../ocr';
import { extractBoletoData } from '../boleto';

export function registerOCRHandlers(): void {
  ipcMain.handle('ocr:scanReceipt', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Selecionar comprovante ou nota fiscal',
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'bmp'] }],
      properties: ['openFile'],
    });
    const filePath = filePaths?.[0];
    if (!filePath) return null;

    return extractReceiptData(filePath);
  });

  // Só imagem (foto/print do boleto), sem PDF: converter PDF para imagem
  // exigiria uma dependência nova só para essa etapa, fora do escopo desta
  // leva de features.
  ipcMain.handle('ocr:scanBoleto', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Selecionar imagem do boleto',
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'bmp'] }],
      properties: ['openFile'],
    });
    const filePath = filePaths?.[0];
    if (!filePath) return null;

    return extractBoletoData(filePath);
  });
}

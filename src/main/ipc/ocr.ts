import { ipcMain, dialog } from 'electron';
import { extractReceiptData } from '../ocr';

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
}

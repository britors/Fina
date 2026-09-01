import { BrowserWindow, dialog, type IpcMainInvokeEvent, type MessageBoxOptions } from 'electron';
import { localizeDialogOptions } from './i18n';

export async function confirmIpcAction(event: IpcMainInvokeEvent, options: MessageBoxOptions): Promise<boolean> {
  const localized = localizeDialogOptions(options);
  const parent = BrowserWindow.fromWebContents(event.sender);
  const result = parent
    ? await dialog.showMessageBox(parent, localized)
    : await dialog.showMessageBox(localized);
  return result.response === 0;
}

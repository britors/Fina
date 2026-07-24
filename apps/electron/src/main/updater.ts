import { autoUpdater } from 'electron-updater';
import { ipcMain, app, type BrowserWindow } from 'electron';

// No Linux o Fina é distribuído como .deb/.rpm/AUR, que o electron-updater não
// sabe baixar nem instalar sozinho — esses usuários seguem usando a checagem
// manual via GitHub (ver ipcMain.handle('app:checkUpdate', ...) em index.ts).
const SUPPORTED = process.platform === 'win32';

export function initUpdater(window: BrowserWindow): void {
  ipcMain.handle('updater:supported', () => SUPPORTED);
  if (!SUPPORTED) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const notify = (status: Record<string, unknown>) => {
    if (!window.isDestroyed()) window.webContents.send('updater:status', status);
  };

  autoUpdater.on('checking-for-update', () => notify({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => notify({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => notify({ state: 'up-to-date' }));
  autoUpdater.on('download-progress', (p) => notify({ state: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', () => notify({ state: 'downloaded' }));
  autoUpdater.on('error', (err) => notify({ state: 'error', message: err.message }));

  ipcMain.handle('updater:check', () => autoUpdater.checkForUpdates());
  ipcMain.handle('updater:download', () => autoUpdater.downloadUpdate());
  ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall());

  if (app.isPackaged) {
    void autoUpdater.checkForUpdates();
  }
}

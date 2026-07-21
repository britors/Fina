import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { openDatabase, runMigrations, closeDatabase, dbPath, needsUnlock } from './database';
import { registerUnlockHandler, registerSecurityHandlers } from './ipc/security';
import { registerAccountHandlers } from './ipc/accounts';
import { registerTransactionHandlers } from './ipc/transactions';
import { registerCategoryHandlers } from './ipc/categories';
import { registerBudgetHandlers } from './ipc/budgets';
import { registerBillHandlers } from './ipc/bills';
import { registerReceivableHandlers } from './ipc/receivables';
import { registerInvoiceHandlers } from './ipc/invoices';
import { registerSettingsHandlers } from './ipc/settings';
import { registerAssetHandlers } from './ipc/assets';
import { registerInvestmentHandlers } from './ipc/investments';
import { registerForecastHandlers } from './ipc/forecast';
import { registerImportHandlers } from './ipc/import';
import { registerExportHandlers } from './ipc/export';
import { registerBackupHandlers } from './ipc/backup';
import { registerSyncHandlers } from './ipc/sync';
import { getSyncStatus, pushSync } from './sync';
import { registerGoalHandlers } from './ipc/goals';
import { registerDebtHandlers } from './ipc/debts';
import { registerMarketHandlers } from './ipc/market';
import { registerIRPFHandlers } from './ipc/irpf';
import { registerAIHandlers } from './ipc/ai';
import { registerRecurrenceDetectionHandlers } from './ipc/recurrenceDetection';
import { registerAnomalyDetectionHandlers } from './ipc/anomalyDetection';
import { registerCategorySuggestionHandlers } from './ipc/categorySuggestion';
import { registerOpenFinanceHandlers } from './ipc/openFinance';
import { registerPixHandlers } from './ipc/pix';
import { registerOCRHandlers } from './ipc/ocr';
import { initUpdater } from './updater';
import { startNotificationScheduler } from './notifications';
import { generateRecurrences } from './recurrences';
import { runAutoBackup, startAutoBackupScheduler } from './autobackup';
import { runBackgroundTasksAndExit } from './backgroundRunner';
import { registerBackgroundServiceHandlers } from './ipc/backgroundService';

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Invocado pelo timer do systemd (Linux) ou pela Tarefa Agendada do Windows
// (ver src/main/ipc/backgroundService.ts): roda as tarefas periódicas e
// encerra, sem nunca criar uma janela nem registrar os handlers de IPC da
// interface normal.
const isBackgroundRun = process.argv.includes('--background-tasks');

function loadAppIcon(): Electron.NativeImage | undefined {
  const candidates = [
    path.join(__dirname, '../../build/icon.png'),
    path.join(__dirname, '../../build/icon.svg'),
    path.join(app.getAppPath(), 'build/icon.png'),
    path.join(app.getAppPath(), 'build/icon.svg'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return nativeImage.createFromPath(p);
  }
  return undefined;
}

function createSplash(): BrowserWindow {
  const w = new BrowserWindow({
    width: 700,
    height: 400,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#0C1A14',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  w.loadFile(path.join(__dirname, '../renderer/splash.html'));
  return w;
}

function createUnlockWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 420,
    height: 420,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0F1117',
    icon: loadAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  w.loadFile(path.join(__dirname, '../renderer/unlock.html'));
  return w;
}

function createMainWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#0F1117',
    autoHideMenuBar: true,
    icon: loadAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  w.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.env.NODE_ENV === 'development') {
    w.webContents.openDevTools({ mode: 'detach' });
  }

  return w;
}

function registerHandlers(): void {
  registerAccountHandlers();
  registerTransactionHandlers();
  registerCategoryHandlers();
  registerBudgetHandlers();
  registerBillHandlers();
  registerReceivableHandlers();
  registerInvoiceHandlers();
  registerRecurrenceDetectionHandlers();
  registerAnomalyDetectionHandlers();
  registerCategorySuggestionHandlers();
  registerSettingsHandlers();
  registerAssetHandlers();
  registerInvestmentHandlers();
  registerForecastHandlers();
  registerImportHandlers();
  registerExportHandlers();
  registerBackupHandlers();
  registerGoalHandlers();
  registerDebtHandlers();
  registerMarketHandlers();
  registerIRPFHandlers();
  registerAIHandlers();
    registerOpenFinanceHandlers();
    registerPixHandlers();
    registerOCRHandlers();
  registerSecurityHandlers();
  registerBackgroundServiceHandlers();
  registerSyncHandlers();

  ipcMain.handle('db:path', () => dbPath());
  ipcMain.handle('app:version', () => app.getVersion());

  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });
  ipcMain.handle('window:toggleMaximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.handle('window:focus', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.focus();
  });
  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });

  ipcMain.handle('app:checkUpdate', () => new Promise<object>((resolve) => {
    const currentVersion = app.getVersion();
    const isAur = app.getAppPath().startsWith('/usr/');
    const options = {
      hostname: 'api.github.com',
      path: '/repos/britors/Fina/releases/latest',
      headers: { 'User-Agent': 'fina-app' },
    };
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const latestVersion = (json.tag_name ?? '').replace(/^v/, '');
          const hasUpdate = latestVersion !== '' && latestVersion !== currentVersion;
          resolve({ currentVersion, latestVersion, hasUpdate, isAur, releaseUrl: json.html_url ?? '' });
        } catch {
          resolve({ currentVersion, latestVersion: '', hasUpdate: false, isAur, releaseUrl: '' });
        }
      });
    });
    req.on('error', () => resolve({ currentVersion, latestVersion: '', hasUpdate: false, isAur, releaseUrl: '' }));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ currentVersion, latestVersion: '', hasUpdate: false, isAur, releaseUrl: '' });
    });
  }));

  ipcMain.handle('dialog:openFile', () =>
    dialog.showOpenDialog({
      filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
      properties: ['openFile'],
    })
  );

  ipcMain.on('shell:openExternal', (_e, url: string) => {
    if (typeof url === 'string' && url.startsWith('https://')) {
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(async () => {
  if (isBackgroundRun) {
    await runBackgroundTasksAndExit();
    return;
  }

  const splash = createSplash();
  const t0 = Date.now();

  registerUnlockHandler();

  try {
    openDatabase();
  } catch (err) {
    console.error('[DB] Erro na inicialização:', err);
  }

  // Enquanto a janela de desbloqueio ou a splash estiverem de pé, nunca deixe
  // o app chegar a zero janelas abertas: o Electron trata isso como
  // 'window-all-closed' e encerra o processo (ver app.on('window-all-closed')
  // abaixo), o que aconteceria antes mesmo de mostrar a tela de senha.
  let unlockWin: BrowserWindow | null = null;
  let showedUnlockScreen = false;
  if (needsUnlock()) {
    showedUnlockScreen = true;
    unlockWin = createUnlockWindow();
    if (!splash.isDestroyed()) splash.destroy();
    await new Promise<void>(resolve => {
      ipcMain.once('security:unlocked', () => resolve());
    });
  }

  try {
    runMigrations();
    runAutoBackup('on_open');
  } catch (err) {
    console.error('[DB] Erro na inicialização:', err);
  }

  registerHandlers();

  if (!showedUnlockScreen) {
    const elapsed = Date.now() - t0;
    await new Promise<void>(r => setTimeout(r, Math.max(0, 1800 - elapsed)));
  }

  const win = createMainWindow();
  initUpdater(win);
  win.once('ready-to-show', () => {
    win.show();
    if (!splash.isDestroyed()) splash.destroy();
    if (unlockWin && !unlockWin.isDestroyed()) unlockWin.close();
    const rec = generateRecurrences();
    if (rec.transactions + rec.bills + rec.receivables > 0) {
      console.log(`[Recorrências] ${rec.transactions} transações, ${rec.bills} contas a pagar, ${rec.receivables} contas a receber geradas`);
    }
    startNotificationScheduler();
    startAutoBackupScheduler();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  runAutoBackup('on_close');
  try {
    const sync = getSyncStatus();
    if (sync.enabled && sync.folder) pushSync(sync.folder);
  } catch (err) {
    console.error('[Sync] Falha ao enviar sincronização ao fechar:', err);
  }
  closeDatabase();
});

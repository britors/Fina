import { ipcMain, app } from 'electron';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const LINUX_UNIT_NAME = 'fina-background.timer';
const WINDOWS_TASK_NAME = 'FinaBackgroundTasks';

// Como chamar o próprio app de novo com --background-tasks: em builds
// empacotados (.deb/.rpm/.exe do electron-builder) o binário já é o app
// inteiro; rodando via `electron <pasta-do-app>` (AUR, ou `npm start` em
// dev) é preciso passar a pasta do app também. `process.defaultApp` é
// exatamente essa distinção.
function backgroundCommand(): { exec: string; args: string[] } {
  if (process.defaultApp) {
    return { exec: process.execPath, args: [app.getAppPath(), '--background-tasks'] };
  }
  return { exec: process.execPath, args: ['--background-tasks'] };
}

function linuxUnitDir(): string {
  return path.join(os.homedir(), '.config', 'systemd', 'user');
}

function isSupported(): boolean {
  return process.platform === 'linux' || process.platform === 'win32';
}

function isEnabledLinux(): boolean {
  try {
    const out = execFileSync('systemctl', ['--user', 'is-enabled', LINUX_UNIT_NAME], { encoding: 'utf-8' });
    return out.trim() === 'enabled';
  } catch {
    return false;
  }
}

function isEnabledWindows(): boolean {
  try {
    execFileSync('schtasks', ['/query', '/tn', WINDOWS_TASK_NAME], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function enableLinux(): void {
  const { exec, args } = backgroundCommand();
  const execLine = [exec, ...args].map(part => `"${part}"`).join(' ');
  const dir = linuxUnitDir();
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, 'fina-background.service'), [
    '[Unit]',
    'Description=Fina - recorrências e alertas em segundo plano',
    '',
    '[Service]',
    'Type=oneshot',
    `ExecStart=${execLine}`,
    '',
  ].join('\n'));

  fs.writeFileSync(path.join(dir, LINUX_UNIT_NAME), [
    '[Unit]',
    'Description=Executa periodicamente as tarefas em segundo plano do Fina',
    '',
    '[Timer]',
    'OnBootSec=5min',
    'OnUnitActiveSec=1h',
    'Persistent=true',
    '',
    '[Install]',
    'WantedBy=timers.target',
    '',
  ].join('\n'));

  execFileSync('systemctl', ['--user', 'daemon-reload']);
  execFileSync('systemctl', ['--user', 'enable', '--now', LINUX_UNIT_NAME]);
}

function disableLinux(): void {
  try {
    execFileSync('systemctl', ['--user', 'disable', '--now', LINUX_UNIT_NAME]);
  } catch {
    // já pode estar desativado; segue para remover os arquivos mesmo assim
  }
  const dir = linuxUnitDir();
  for (const file of ['fina-background.service', LINUX_UNIT_NAME]) {
    const filePath = path.join(dir, file);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  execFileSync('systemctl', ['--user', 'daemon-reload']);
}

function enableWindows(): void {
  const { exec, args } = backgroundCommand();
  const commandLine = [exec, ...args].map(part => `"${part}"`).join(' ');
  execFileSync('schtasks', ['/create', '/tn', WINDOWS_TASK_NAME, '/tr', commandLine, '/sc', 'hourly', '/f']);
}

function disableWindows(): void {
  execFileSync('schtasks', ['/delete', '/tn', WINDOWS_TASK_NAME, '/f']);
}

export function registerBackgroundServiceHandlers(): void {
  ipcMain.handle('backgroundService:status', () => {
    const mechanism = process.platform === 'win32' ? 'Tarefa Agendada do Windows' : 'timer do systemd';
    if (!isSupported()) return { supported: false, enabled: false, mechanism };
    const enabled = process.platform === 'linux' ? isEnabledLinux() : isEnabledWindows();
    return { supported: true, enabled, mechanism };
  });

  ipcMain.handle('backgroundService:enable', () => {
    if (!isSupported()) throw new Error('Recurso disponível apenas no Linux e no Windows.');
    if (process.platform === 'linux') enableLinux();
    else enableWindows();
  });

  ipcMain.handle('backgroundService:disable', () => {
    if (!isSupported()) throw new Error('Recurso disponível apenas no Linux e no Windows.');
    if (process.platform === 'linux') disableLinux();
    else disableWindows();
  });
}

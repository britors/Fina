import { contextBridge, ipcRenderer, webUtils } from 'electron';

const ALLOWED_INVOKE_PREFIXES = [
  'accounts:', 'ai:', 'anomalies:', 'app:', 'assets:', 'backgroundService:',
  'backup:', 'bills:', 'budgets:', 'categories:', 'db:', 'debts:', 'dialog:',
  'documents:', 'export:', 'family:', 'familyMembers:', 'forecast:', 'goals:',
  'import:', 'investments:', 'invoices:', 'irpf:', 'market:', 'mei:', 'mobileSync:', 'ocr:',
  'openFinance:', 'pix:', 'radar:', 'receivables:', 'recurrenceDetection:',
  'security:', 'settings:', 'sync:', 'transactions:', 'updater:', 'weeklyReview:',
  'window:',
];

function assertAllowed(channel: string, prefixes: string[]): void {
  if (typeof channel !== 'string' || !prefixes.some(prefix => channel.startsWith(prefix))) {
    throw new Error(`Canal IPC não autorizado: ${String(channel)}`);
  }
}

contextBridge.exposeInMainWorld('api', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  invoke: (channel: string, data?: unknown) => {
    assertAllowed(channel, ALLOWED_INVOKE_PREFIXES);
    return ipcRenderer.invoke(channel, data);
  },
  send: (channel: string, data?: unknown) => {
    assertAllowed(channel, ['security:unlocked', 'shell:openExternal']);
    ipcRenderer.send(channel, data);
  },
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    assertAllowed(channel, ['updater:status', 'mobileSync:event']);
    ipcRenderer.on(channel, (_event, ...args) => cb(...args));
  },
});

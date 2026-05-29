import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, data?: unknown) => ipcRenderer.invoke(channel, data),
  send: (channel: string, data?: unknown) => ipcRenderer.send(channel, data),
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => cb(...args));
  },
});

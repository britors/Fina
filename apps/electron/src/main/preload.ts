import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { EVENT_CHANNELS, INVOKE_CHANNELS, SEND_CHANNELS, isAllowedChannel } from '../shared/ipcChannels';

function assertAllowed(channel: unknown, allowed: readonly string[]): asserts channel is string {
  if (!isAllowedChannel(channel, allowed)) {
    throw new Error(`Canal IPC não autorizado: ${String(channel)}`);
  }
}

contextBridge.exposeInMainWorld('api', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  invoke: (channel: string, data?: unknown) => {
    assertAllowed(channel, INVOKE_CHANNELS);
    return ipcRenderer.invoke(channel, data);
  },
  send: (channel: string, data?: unknown) => {
    assertAllowed(channel, SEND_CHANNELS);
    ipcRenderer.send(channel, data);
  },
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    assertAllowed(channel, EVENT_CHANNELS);
    ipcRenderer.on(channel, (_event, ...args) => cb(...args));
  },
});

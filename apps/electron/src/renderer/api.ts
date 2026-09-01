import type { EventChannel, InvokeChannel, SendChannel } from '../shared/ipcChannels';

declare global {
  interface Window {
    api: {
      getPathForFile(file: File): string;
      invoke(channel: InvokeChannel, data?: unknown): Promise<unknown>;
      send(channel: SendChannel, data?: unknown): void;
      on(channel: EventChannel, cb: (...args: unknown[]) => void): void;
    };
  }
}

export function getPathForFile(file: File): string {
  return window.api.getPathForFile(file);
}

export async function invoke<T>(channel: InvokeChannel, data?: unknown): Promise<T> {
  return window.api.invoke(channel, data) as Promise<T>;
}

export function send(channel: SendChannel, data?: unknown): void {
  window.api.send(channel, data);
}

export function on(channel: EventChannel, cb: (...args: unknown[]) => void): void {
  window.api.on(channel, cb);
}

declare global {
  interface Window {
    api: {
      getPathForFile(file: File): string;
      invoke(channel: string, data?: unknown): Promise<unknown>;
      send(channel: string, data?: unknown): void;
      on(channel: string, cb: (...args: unknown[]) => void): void;
    };
  }
}

export function getPathForFile(file: File): string {
  return window.api.getPathForFile(file);
}

export async function invoke<T>(channel: string, data?: unknown): Promise<T> {
  return window.api.invoke(channel, data) as Promise<T>;
}

export function send(channel: string, data?: unknown): void {
  window.api.send(channel, data);
}

export function on(channel: string, cb: (...args: unknown[]) => void): void {
  window.api.on(channel, cb);
}

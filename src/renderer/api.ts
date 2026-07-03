declare global {
  interface Window {
    api: {
      invoke(channel: string, data?: unknown): Promise<unknown>;
      send(channel: string, data?: unknown): void;
      on(channel: string, cb: (...args: unknown[]) => void): void;
    };
  }
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

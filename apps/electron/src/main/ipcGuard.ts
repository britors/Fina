import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeIpcArguments } from './ipcValidation';

export interface IpcSenderLike {
  senderFrame?: { url?: string } | null;
  sender: { getURL(): string };
}

export function isTrustedRendererUrl(url: string, rendererRoot: string): boolean {
  if (!url.startsWith('file://')) return false;
  try {
    const filePath = path.resolve(fileURLToPath(url));
    const trustedRoot = path.resolve(rendererRoot);
    return filePath === trustedRoot || filePath.startsWith(trustedRoot + path.sep);
  } catch {
    return false;
  }
}

export function assertTrustedIpcSender(event: IpcSenderLike, rendererRoot: string): void {
  const url = event.senderFrame?.url ?? event.sender.getURL();
  if (!isTrustedRendererUrl(url, rendererRoot)) throw new Error('Origem IPC não autorizada.');
}

export function guardIpcListener<TEvent extends IpcSenderLike, TResult>(
  rendererRoot: string,
  listener: (event: TEvent, ...args: unknown[]) => TResult,
): (event: TEvent, ...args: unknown[]) => TResult {
  return (event, ...args) => {
    assertTrustedIpcSender(event, rendererRoot);
    assertSafeIpcArguments(args);
    return listener(event, ...args);
  };
}

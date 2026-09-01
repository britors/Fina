export interface UpdaterWindowLike {
  isDestroyed(): boolean;
  webContents: { send(channel: string, payload: unknown): void };
}

export class UpdaterWindowState<T extends UpdaterWindowLike> {
  private current: T | null = null;
  private initialized = false;

  // Sempre atualiza o destino. Retorna true apenas na primeira chamada, para
  // que o chamador registre handlers/listeners globais uma única vez.
  attach(window: T): boolean {
    this.current = window;
    if (this.initialized) return false;
    this.initialized = true;
    return true;
  }

  send(channel: string, payload: unknown): void {
    if (this.current && !this.current.isDestroyed()) {
      this.current.webContents.send(channel, payload);
    }
  }
}

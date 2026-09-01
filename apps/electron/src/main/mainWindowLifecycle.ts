export interface MainWindowLike {
  once(event: 'ready-to-show', listener: () => void): unknown;
  show(): void;
}

interface MainWindowLifecycleOptions<T extends MainWindowLike> {
  createWindow(): T;
  configureWindow(window: T): void;
  startServices(): void;
}

export class MainWindowLifecycle<T extends MainWindowLike> {
  private servicesStarted = false;

  constructor(private readonly options: MainWindowLifecycleOptions<T>) {}

  open(onReady?: () => void): T {
    const window = this.options.createWindow();
    this.options.configureWindow(window);
    window.once('ready-to-show', () => {
      window.show();
      onReady?.();
      if (!this.servicesStarted) {
        this.servicesStarted = true;
        this.options.startServices();
      }
    });
    return window;
  }
}

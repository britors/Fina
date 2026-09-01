import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MainWindowLifecycle, type MainWindowLike } from '../src/main/mainWindowLifecycle';

function fakeWindow() {
  let readyListener: (() => void) | undefined;
  let showCount = 0;
  const window: MainWindowLike = {
    once: (_event, listener) => { readyListener = listener; },
    show: () => { showCount += 1; },
  };
  return {
    window,
    ready: () => readyListener?.(),
    showCount: () => showCount,
  };
}

describe('main window lifecycle', () => {
  test('configura e exibe cada janela, iniciando serviços apenas uma vez', () => {
    const windows = [fakeWindow(), fakeWindow()];
    const configured: MainWindowLike[] = [];
    let created = 0;
    let servicesStarted = 0;
    let readyCallbacks = 0;
    const lifecycle = new MainWindowLifecycle({
      createWindow: () => windows[created++].window,
      configureWindow: window => { configured.push(window); },
      startServices: () => { servicesStarted += 1; },
    });

    assert.equal(lifecycle.open(() => { readyCallbacks += 1; }), windows[0].window);
    windows[0].ready();
    assert.equal(lifecycle.open(() => { readyCallbacks += 1; }), windows[1].window);
    windows[1].ready();

    assert.deepEqual(configured, windows.map(item => item.window));
    assert.deepEqual(windows.map(item => item.showCount()), [1, 1]);
    assert.equal(readyCallbacks, 2);
    assert.equal(servicesStarted, 1);
  });

  test('uma janela abandonada antes de ficar pronta não bloqueia os serviços', () => {
    const windows = [fakeWindow(), fakeWindow()];
    let created = 0;
    let servicesStarted = 0;
    const lifecycle = new MainWindowLifecycle({
      createWindow: () => windows[created++].window,
      configureWindow: () => undefined,
      startServices: () => { servicesStarted += 1; },
    });

    lifecycle.open();
    lifecycle.open();
    windows[1].ready();

    assert.equal(servicesStarted, 1);
  });
});

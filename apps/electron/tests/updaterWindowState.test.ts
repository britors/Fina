import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { UpdaterWindowState, type UpdaterWindowLike } from '../src/main/updaterWindowState';

function fakeWindow() {
  const sent: { channel: string; payload: unknown }[] = [];
  let destroyed = false;
  const window: UpdaterWindowLike = {
    isDestroyed: () => destroyed,
    webContents: { send: (channel, payload) => { sent.push({ channel, payload }); } },
  };
  return { window, sent, destroy: () => { destroyed = true; } };
}

describe('updater window state', () => {
  test('registra infraestrutura global uma vez e troca o destino na reabertura', () => {
    const state = new UpdaterWindowState();
    const first = fakeWindow();
    const second = fakeWindow();

    assert.equal(state.attach(first.window), true);
    state.send('updater:status', { state: 'checking' });
    assert.equal(first.sent.length, 1);

    assert.equal(state.attach(second.window), false);
    state.send('updater:status', { state: 'downloaded' });
    assert.equal(first.sent.length, 1);
    assert.deepEqual(second.sent, [{ channel: 'updater:status', payload: { state: 'downloaded' } }]);
  });

  test('não envia evento para janela destruída', () => {
    const state = new UpdaterWindowState();
    const target = fakeWindow();
    state.attach(target.window);
    target.destroy();
    state.send('updater:status', { state: 'error' });
    assert.equal(target.sent.length, 0);
  });
});

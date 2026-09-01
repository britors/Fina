import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_CHANNELS, INVOKE_CHANNELS, SEND_CHANNELS, isAllowedChannel } from '../src/shared/ipcChannels';

describe('preload IPC channel policy', () => {
  test('aceita somente nomes exatos conhecidos', () => {
    assert.equal(isAllowedChannel('settings:getAll', INVOKE_CHANNELS), true);
    assert.equal(isAllowedChannel('settings:clearEverything', INVOKE_CHANNELS), false);
    assert.equal(isAllowedChannel('transactions:arbitrary', INVOKE_CHANNELS), false);
    assert.equal(isAllowedChannel('shell:openExternal', SEND_CHANNELS), true);
    assert.equal(isAllowedChannel('shell:execute', SEND_CHANNELS), false);
    assert.equal(isAllowedChannel('updater:status', EVENT_CHANNELS), true);
    assert.equal(isAllowedChannel('updater:debug', EVENT_CHANNELS), false);
  });

  test('não possui canais duplicados', () => {
    assert.equal(new Set(INVOKE_CHANNELS).size, INVOKE_CHANNELS.length);
    assert.equal(new Set(SEND_CHANNELS).size, SEND_CHANNELS.length);
    assert.equal(new Set(EVENT_CHANNELS).size, EVENT_CHANNELS.length);
  });
});

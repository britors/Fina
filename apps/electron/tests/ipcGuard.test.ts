import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { guardIpcListener, isTrustedRendererUrl, type IpcSenderLike } from '../src/main/ipcGuard';

const rendererRoot = join(process.cwd(), 'out', 'renderer');

function eventFrom(url: string): IpcSenderLike {
  return { senderFrame: { url }, sender: { getURL: () => url } };
}

describe('main IPC guard', () => {
  test('aceita apenas arquivos dentro da raiz exata do renderer', () => {
    assert.equal(isTrustedRendererUrl(pathToFileURL(join(rendererRoot, 'index.html')).href, rendererRoot), true);
    assert.equal(isTrustedRendererUrl(pathToFileURL(rendererRoot).href, rendererRoot), true);
    assert.equal(isTrustedRendererUrl(pathToFileURL(rendererRoot + '-malicioso/index.html').href, rendererRoot), false);
    assert.equal(isTrustedRendererUrl('https://example.com/index.html', rendererRoot), false);
    assert.equal(isTrustedRendererUrl('file://%invalid', rendererRoot), false);
  });

  test('origem externa é rejeitada antes de executar o handler', () => {
    let executions = 0;
    const guarded = guardIpcListener(rendererRoot, () => { executions += 1; });

    assert.throws(() => guarded(eventFrom('https://attacker.invalid'), { id: 'safe' }), /não autorizada/);
    assert.equal(executions, 0);
  });

  test('payload inseguro é rejeitado antes de executar o handler', () => {
    let executions = 0;
    const guarded = guardIpcListener(rendererRoot, (_event, payload) => {
      executions += 1;
      return payload;
    });
    const trustedEvent = eventFrom(pathToFileURL(join(rendererRoot, 'index.html')).href);

    assert.throws(() => guarded(trustedEvent, { amount: Number.NaN }), /ipc-payload-invalid/);
    assert.equal(executions, 0);
    assert.deepEqual(guarded(trustedEvent, { id: 'allowed' }), { id: 'allowed' });
    assert.equal(executions, 1);
  });

  test('usa a URL do sender quando senderFrame não está disponível', () => {
    const url = pathToFileURL(join(rendererRoot, 'index.html')).href;
    const event: IpcSenderLike = { senderFrame: null, sender: { getURL: () => url } };
    const guarded = guardIpcListener(rendererRoot, () => 'ok');
    assert.equal(guarded(event), 'ok');
  });
});

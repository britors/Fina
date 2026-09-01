import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { runConfirmedAction } from '../src/main/confirmedAction';

describe('main-side destructive action confirmation', () => {
  test('cancelamento não executa a ação', async () => {
    let executions = 0;
    const executed = await runConfirmedAction(
      async () => false,
      () => { executions += 1; },
    );

    assert.equal(executed, false);
    assert.equal(executions, 0);
  });

  test('confirmação executa a ação exatamente uma vez', async () => {
    let executions = 0;
    const executed = await runConfirmedAction(
      async () => true,
      async () => { executions += 1; },
    );

    assert.equal(executed, true);
    assert.equal(executions, 1);
  });

  test('erro da ação é propagado ao handler', async () => {
    await assert.rejects(
      runConfirmedAction(
        async () => true,
        () => { throw new Error('destructive-action-failed'); },
      ),
      /destructive-action-failed/,
    );
  });
});

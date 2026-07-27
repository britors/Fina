import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { simplifyDebts } from '../src/shared/utils';

describe('simplifyDebts', () => {
  test('dois membros: devedor paga direto ao credor', () => {
    const transfers = simplifyDebts([
      { member_id: 'a', member_name: 'A', net: -50 },
      { member_id: 'b', member_name: 'B', net: 50 },
    ]);
    assert.deepEqual(transfers, [
      { from_member_id: 'a', from_member_name: 'A', to_member_id: 'b', to_member_name: 'B', amount: 50 },
    ]);
  });

  test('contas já zeradas não geram transferências', () => {
    const transfers = simplifyDebts([
      { member_id: 'a', member_name: 'A', net: 0 },
      { member_id: 'b', member_name: 'B', net: 0 },
    ]);
    assert.deepEqual(transfers, []);
  });

  test('resíduo de arredondamento (< 0,005) é tratado como zerado', () => {
    const transfers = simplifyDebts([
      { member_id: 'a', member_name: 'A', net: -0.001 },
      { member_id: 'b', member_name: 'B', net: 0.001 },
    ]);
    assert.deepEqual(transfers, []);
  });

  test('três membros: usa o mínimo de transferências (n-1)', () => {
    const transfers = simplifyDebts([
      { member_id: 'a', member_name: 'A', net: -30 },
      { member_id: 'b', member_name: 'B', net: -20 },
      { member_id: 'c', member_name: 'C', net: 50 },
    ]);
    assert.equal(transfers.length, 2);
    assert.deepEqual(transfers, [
      { from_member_id: 'a', from_member_name: 'A', to_member_id: 'c', to_member_name: 'C', amount: 30 },
      { from_member_id: 'b', from_member_name: 'B', to_member_id: 'c', to_member_name: 'C', amount: 20 },
    ]);
  });

  test('vários credores e devedores: soma das transferências fecha os saldos', () => {
    const balances = [
      { member_id: 'a', member_name: 'A', net: -120 },
      { member_id: 'b', member_name: 'B', net: -30 },
      { member_id: 'c', member_name: 'C', net: 90 },
      { member_id: 'd', member_name: 'D', net: 60 },
    ];
    const transfers = simplifyDebts(balances);

    const received = new Map<string, number>();
    const sent = new Map<string, number>();
    for (const t of transfers) {
      sent.set(t.from_member_id, (sent.get(t.from_member_id) ?? 0) + t.amount);
      received.set(t.to_member_id, (received.get(t.to_member_id) ?? 0) + t.amount);
    }
    for (const b of balances) {
      const net = (received.get(b.member_id) ?? 0) - (sent.get(b.member_id) ?? 0);
      assert.equal(net, b.net);
    }
  });
});

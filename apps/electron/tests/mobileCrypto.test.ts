import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  decryptFrame, deriveSessionKeys, encryptFrame, exportPublicKey, FrameParser,
  generateX25519KeyPair, importPublicKey, packFrame,
} from '../src/main/mobileCrypto';

function handshakeSalt(a: Buffer, b: Buffer): Buffer {
  return Buffer.concat([a, b]);
}

describe('deriveSessionKeys', () => {
  test('os dois lados de um handshake ECDH derivam a mesma chave de sessão e o mesmo código', () => {
    const desktop = generateX25519KeyPair();
    const phone = generateX25519KeyPair();
    const desktopDer = desktop.publicKey.export({ type: 'spki', format: 'der' });
    const phoneDer = phone.publicKey.export({ type: 'spki', format: 'der' });

    const salt = handshakeSalt(desktopDer, phoneDer);
    const onDesktop = deriveSessionKeys(desktop.privateKey, phone.publicKey, salt);
    const onPhone = deriveSessionKeys(phone.privateKey, desktop.publicKey, salt);

    assert.deepEqual(onDesktop.sessionKey, onPhone.sessionKey);
    assert.equal(onDesktop.pairingCode, onPhone.pairingCode);
    assert.match(onDesktop.pairingCode, /^\d{6}$/);
  });

  test('um MITM com dois handshakes separados produz códigos diferentes em cada ponta', () => {
    const desktop = generateX25519KeyPair();
    const phone = generateX25519KeyPair();
    const attacker = generateX25519KeyPair();
    const desktopDer = desktop.publicKey.export({ type: 'spki', format: 'der' });
    const phoneDer = phone.publicKey.export({ type: 'spki', format: 'der' });
    const attackerDer = attacker.publicKey.export({ type: 'spki', format: 'der' });

    // Atacante negocia com o desktop se passando pelo celular...
    const desktopSide = deriveSessionKeys(desktop.privateKey, attacker.publicKey, handshakeSalt(desktopDer, attackerDer));
    // ...e com o celular se passando pelo desktop.
    const phoneSide = deriveSessionKeys(phone.privateKey, attacker.publicKey, handshakeSalt(attackerDer, phoneDer));

    assert.notEqual(desktopSide.pairingCode, phoneSide.pairingCode);
  });

  test('salt diferente (conexão diferente) muda a chave derivada', () => {
    const a = generateX25519KeyPair();
    const b = generateX25519KeyPair();
    const first = deriveSessionKeys(a.privateKey, b.publicKey, Buffer.from('salt-1'));
    const second = deriveSessionKeys(a.privateKey, b.publicKey, Buffer.from('salt-2'));
    assert.notEqual(first.sessionKey.toString('hex'), second.sessionKey.toString('hex'));
  });
});

describe('exportPublicKey / importPublicKey', () => {
  test('round-trip preserva a chave', () => {
    const { publicKey } = generateX25519KeyPair();
    const exported = exportPublicKey(publicKey);
    const imported = importPublicKey(exported);
    assert.equal(exportPublicKey(imported), exported);
  });
});

describe('encryptFrame / decryptFrame', () => {
  test('round-trip preserva a mensagem', () => {
    const key = randomBytes(32);
    const message = { op: 'push_transactions', items: [{ client_id: 'abc', amount: 42.5 }] };
    const frame = encryptFrame(key, message);
    assert.deepEqual(decryptFrame(key, frame), message);
  });

  test('adulterar o ciphertext quebra a autenticação (AEAD)', () => {
    const key = Buffer.alloc(32, 7);
    const frame = encryptFrame(key, { op: 'ping' });
    frame[frame.length - 1] ^= 0xff;
    assert.throws(() => decryptFrame(key, frame));
  });

  test('chave errada não decifra', () => {
    const key = Buffer.alloc(32, 1);
    const wrongKey = Buffer.alloc(32, 2);
    const frame = encryptFrame(key, { op: 'ping' });
    assert.throws(() => decryptFrame(wrongKey, frame));
  });
});

describe('FrameParser', () => {
  test('entrega um frame recebido em um único chunk', () => {
    const parser = new FrameParser();
    const payload = Buffer.from('hello');
    const frames = parser.push(packFrame(payload));
    assert.equal(frames.length, 1);
    assert.deepEqual(frames[0], payload);
  });

  test('remonta um frame recebido fragmentado em vários chunks', () => {
    const parser = new FrameParser();
    const framed = packFrame(Buffer.from('fragmented-message'));
    assert.deepEqual(parser.push(framed.subarray(0, 2)), []);
    assert.deepEqual(parser.push(framed.subarray(2, 6)), []);
    const frames = parser.push(framed.subarray(6));
    assert.equal(frames.length, 1);
    assert.equal(frames[0].toString('utf8'), 'fragmented-message');
  });

  test('entrega múltiplos frames recebidos juntos, na ordem', () => {
    const parser = new FrameParser();
    const combined = Buffer.concat([packFrame(Buffer.from('one')), packFrame(Buffer.from('two'))]);
    const frames = parser.push(combined);
    assert.equal(frames.length, 2);
    assert.equal(frames[0].toString('utf8'), 'one');
    assert.equal(frames[1].toString('utf8'), 'two');
  });
});

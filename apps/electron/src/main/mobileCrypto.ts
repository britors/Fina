import {
  createCipheriv, createDecipheriv, createHmac, createPrivateKey, createPublicKey, diffieHellman,
  generateKeyPairSync, hkdfSync, randomBytes,
} from 'node:crypto';
import type { KeyObject } from 'node:crypto';

// Canal ponto-a-ponto entre o Fina desktop e um celular pareado, direto por
// TCP na rede local (sem TLS/X.509 — não faz sentido validar uma cadeia de
// certificados entre dois apps que se conhecem por uma chave pública trocada
// no pareamento). ECDH em X25519 deriva tanto a chave de sessão (AES-256-GCM)
// quanto, na primeira conexão, o código de confirmação — os dois lados
// calculam o mesmo valor de forma independente a partir do segredo
// compartilhado daquela conexão específica. Isso é o que torna o código
// resistente a um MITM na rede local no PRIMEIRO pareamento: um atacante
// fazendo dois handshakes separados (um com o desktop, outro com o celular)
// produziria dois segredos diferentes, e os códigos mostrados nas duas telas
// não bateriam.
//
// Isso sozinho NÃO bastava pras reconexões seguintes: o desktop não tem
// identidade própria (só um par efêmero por conexão), então nada impedia um
// atacante ativo de se passar pelo desktop em toda reconexão — sem código
// de confirmação nenhum, já que esse passo só roda no primeiro pareamento
// (ver `alreadyPaired`). computeIdentityProof() fecha essa lacuna: o desktop
// também tem uma identidade X25519 de longo prazo (ver getOrCreateDesktopIdentity
// em mobileSync.ts) e prova posse da chave privada correspondente via um
// segredo estático-estático (ECDH entre as duas identidades de longo prazo)
// que um atacante não consegue reproduzir sem essa chave privada. O celular
// fixa (pin) a identidade do desktop após a primeira confirmação manual e
// só pula a tela de código em reconexões futuras se a identidade recebida
// bater com a fixada — ver `knownDesktopIdentity`/`trusted` em mobileSync.ts
// e SyncClient.kt do lado do celular.
//
// Simplificação deliberada: o celular usa a mesma chave X25519 de longo
// prazo (gerada uma vez no app mobile) como entrada do ECDH em toda
// reconexão — não há um ratchet por sessão do lado do celular. O desktop
// gera um par efêmero novo a cada vez que abre a tela de sincronização, o
// que já garante uma chave de sessão distinta por conexão. Sacrificamos
// sigilo futuro completo (forward secrecy) em troca de simplicidade; o que
// importa aqui é autenticar os dois lados da conexão pareada, não proteger
// tráfego interceptado e armazenado por um atacante com acesso posterior à
// chave privada de um dos lados.

export interface KeyPair {
  publicKey: KeyObject;
  privateKey: KeyObject;
}

export function generateX25519KeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  return { publicKey, privateKey };
}

export function exportPublicKey(publicKey: KeyObject): string {
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

export function importPublicKey(base64: string): KeyObject {
  return createPublicKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'spki' });
}

export function exportPrivateKey(privateKey: KeyObject): string {
  return privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
}

export function importPrivateKey(base64: string): KeyObject {
  return createPrivateKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'pkcs8' });
}

function deriveSharedSecret(privateKey: KeyObject, peerPublicKey: KeyObject): Buffer {
  return diffieHellman({ privateKey, publicKey: peerPublicKey });
}

function hkdf(sharedSecret: Buffer, salt: Buffer, info: string, length: number): Buffer {
  return Buffer.from(hkdfSync('sha256', sharedSecret, salt, Buffer.from(info, 'utf8'), length));
}

export interface SessionKeys {
  sessionKey: Buffer;
  pairingCode: string;
}

// `salt` deve combinar as duas chaves públicas efêmeras/estáticas envolvidas
// na conexão, na mesma ordem nos dois lados, para amarrar a derivação a essa
// conexão específica (evita que uma sessão antiga seja reaproveitada).
export function deriveSessionKeys(privateKey: KeyObject, peerPublicKey: KeyObject, salt: Buffer): SessionKeys {
  const shared = deriveSharedSecret(privateKey, peerPublicKey);
  const sessionKey = hkdf(shared, salt, 'fina-mobile-session-v1', 32);
  const codeBytes = hkdf(shared, salt, 'fina-pairing-code-v1', 4);
  const code = codeBytes.readUInt32BE(0) % 1_000_000;
  return { sessionKey, pairingCode: code.toString().padStart(6, '0') };
}

// Prova de posse da chave privada de identidade de longo prazo (desktop ou
// celular): HMAC sobre `message` com uma chave derivada de um segredo
// ECDH estático-estático (as duas identidades de longo prazo, não as
// efêmeras da sessão) + `salt`. Quem verifica recalcula o mesmo ECDH do seu
// próprio lado (DH é comutativo: ECDH(privA, pubB) == ECDH(privB, pubA)) —
// sem conhecer a chave privada correspondente a `peerPublicKey`, não dá pra
// forjar essa prova nem reproduzindo a chave pública alheia.
export function computeIdentityProof(privateKey: KeyObject, peerPublicKey: KeyObject, salt: Buffer, message: Buffer): Buffer {
  const shared = deriveSharedSecret(privateKey, peerPublicKey);
  const key = hkdf(shared, salt, 'fina-mobile-identity-proof-v1', 32);
  return createHmac('sha256', key).update(message).digest();
}

// Enquadramento: [12 bytes iv][16 bytes auth tag][ciphertext]. Cada frame é
// uma mensagem JSON independente; o nonce é aleatório por frame, o que é
// seguro em AES-GCM contanto que não se repita — não há necessidade de um
// contador dado o volume baixo de mensagens por sessão.
export function encryptFrame(sessionKey: Buffer, message: unknown): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sessionKey, iv);
  const plaintext = Buffer.from(JSON.stringify(message), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

export function decryptFrame<T = unknown>(sessionKey: Buffer, frame: Buffer): T {
  const iv = frame.subarray(0, 12);
  const authTag = frame.subarray(12, 28);
  const ciphertext = frame.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', sessionKey, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}

// Enquadramento de tamanho fixo (4 bytes big-endian + payload) usado tanto
// para os frames cifrados quanto para as duas mensagens de handshake em
// texto claro (troca de chaves públicas — não há segredo nelas).
export function packFrame(payload: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);
  return Buffer.concat([length, payload]);
}

const MAX_FRAME_BYTES = 1024 * 1024;

// Acumula chunks de um socket TCP e entrega frames completos, na ordem.
// Puro (sem I/O) para ficar testável: `push` retorna os frames que ficaram
// prontos com aquele chunk.
export class FrameParser {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): Buffer[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames: Buffer[] = [];
    for (;;) {
      if (this.buffer.length < 4) break;
      const length = this.buffer.readUInt32BE(0);
      if (length > MAX_FRAME_BYTES) throw new Error('Frame recebido excede o tamanho máximo permitido.');
      if (this.buffer.length < 4 + length) break;
      frames.push(this.buffer.subarray(4, 4 + length));
      this.buffer = this.buffer.subarray(4 + length);
    }
    return frames;
  }
}

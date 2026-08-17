import * as net from 'node:net';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import { getDb } from './database';
import { localizeMainText } from './i18n';
import { insertConfirmedTransaction } from './ipc/transactions';
import type { PairedDevice } from '../shared/types';
import {
  decryptFrame, deriveSessionKeys, encryptFrame, exportPublicKey, FrameParser,
  generateX25519KeyPair, importPublicKey, packFrame,
} from './mobileCrypto';

// Listener TCP local para o app mobile — só existe enquanto a tela
// "Sincronizar celular" está aberta no desktop (ver render()/cleanup em
// src/renderer/pages/mobileSync.ts). Não roda em background: o banco só
// está desbloqueado enquanto o app está aberto, e não faz sentido escutar
// conexões de rede quando o usuário não está ativamente sincronizando.
//
// Handshake por conexão (o QR só carrega {ip, port} — nenhuma chave):
//   1. Celular → desktop, texto claro: { identityPublicKey }
//   2. Desktop → celular, texto claro: { ephemeralPublicKey }
//   3. Os dois lados derivam a mesma chave de sessão (ECDH X25519 + HKDF) e,
//      se o dispositivo ainda não está pareado, o mesmo código de 6 dígitos.
//   4. Daí em diante todo frame é [4 bytes tamanho][iv|tag|ciphertext].
//
// Um device já pareado (public_key encontrada e não revogada) segue direto
// pro protocolo de sync; um device desconhecido vira uma "pairing candidate"
// aguardando confirmação do código pela UI do desktop.
const MAX_PAIRING_ATTEMPTS = 3;
const PAIRING_TIMEOUT_MS = 2 * 60 * 1000;

interface PendingPairing {
  socket: net.Socket;
  sessionKey: Buffer;
  pairingCode: string;
  identityPublicKey: string;
  attempts: number;
  timeout: NodeJS.Timeout;
}

interface PushResult {
  client_id: string;
  status: 'created' | 'duplicate' | 'rejected';
  reason?: string;
}

let server: net.Server | null = null;
let mainWindow: BrowserWindow | null = null;
const pendingPairings = new Map<string, PendingPairing>();
// Toda conexão viva (pareamento pendente ou sync já autenticado) — permite
// derrubar tudo de uma vez quando o usuário sai da tela de sincronização,
// em vez de deixar sockets autenticados pendurados até o app fechar.
const activeSockets = new Set<net.Socket>();
// Público conhecido de uma conexão já autenticada (pulou o pareamento
// porque a public_key já estava em paired_devices) — evita repetir a chave
// em cada mensagem trocada depois do handshake.
const connectionIdentity = new WeakMap<net.Socket, string>();

export function setMobileSyncWindow(window: BrowserWindow): void {
  mainWindow = window;
}

function emit(event: string, payload?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mobileSync:event', { event, payload });
  }
}

// Primeira interface IPv4 não interna — heurística simples de v1. Em
// máquinas com várias NICs ativas (VPN, ponte de contêiner) pode escolher a
// interface errada; se isso incomodar algum usuário real, vale expor um
// seletor manual na UI.
function resolveLanAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  throw new Error(localizeMainText('Nenhuma rede local ativa foi encontrada. Conecte o computador a uma rede Wi-Fi ou cabeada.'));
}

export function startSyncListener(): Promise<{ ip: string; port: number }> {
  if (server) throw new Error(localizeMainText('A sincronização com celular já está ativa.'));
  const ip = resolveLanAddress();
  const listening = net.createServer(socket => handleConnection(socket));
  server = listening;
  return new Promise((resolve, reject) => {
    listening.once('error', err => {
      server = null;
      reject(err instanceof Error ? err : new Error(String(err)));
    });
    listening.once('listening', () => {
      const address = listening.address();
      if (!address || typeof address === 'string') {
        server = null;
        listening.close();
        reject(new Error(localizeMainText('Falha ao abrir o listener de sincronização.')));
        return;
      }
      resolve({ ip, port: address.port });
    });
    listening.listen(0, ip);
  });
}

export function stopSyncListener(): void {
  for (const pending of pendingPairings.values()) clearTimeout(pending.timeout);
  pendingPairings.clear();
  for (const socket of activeSockets) socket.destroy();
  activeSockets.clear();
  server?.close();
  server = null;
}

function handleConnection(socket: net.Socket): void {
  activeSockets.add(socket);
  const parser = new FrameParser();
  const desktopKeys = generateX25519KeyPair();
  let sessionKey: Buffer | null = null;
  let stage: 'handshake' | 'sync' = 'handshake';

  socket.on('error', () => { /* conexão instável do celular, ignorar — 'close' já limpa o estado */ });

  socket.on('data', (chunk: Buffer) => {
    try {
      for (const frame of parser.push(chunk)) {
        if (stage === 'handshake') {
          const { identityPublicKey } = JSON.parse(frame.toString('utf8')) as { identityPublicKey: string };
          const peerPublicKey = importPublicKey(identityPublicKey);
          const salt = Buffer.concat([
            desktopKeys.publicKey.export({ type: 'spki', format: 'der' }) as Buffer,
            peerPublicKey.export({ type: 'spki', format: 'der' }) as Buffer,
          ]);
          const derived = deriveSessionKeys(desktopKeys.privateKey, peerPublicKey, salt);
          sessionKey = derived.sessionKey;

          socket.write(packFrame(Buffer.from(JSON.stringify({ ephemeralPublicKey: exportPublicKey(desktopKeys.publicKey) }), 'utf8')));

          const device = findPairedDevice(identityPublicKey);
          if (device) {
            stage = 'sync';
            connectionIdentity.set(socket, identityPublicKey);
          } else {
            registerPendingPairing(socket, sessionKey, derived.pairingCode, identityPublicKey);
          }
          continue;
        }
        if (!sessionKey) continue;
        const message = decryptFrame<{ op: string; [key: string]: unknown }>(sessionKey, frame);
        handleSyncMessage(socket, sessionKey, message);
      }
    } catch {
      socket.destroy();
    }
  });

  socket.on('close', () => {
    activeSockets.delete(socket);
    for (const [sessionId, pending] of pendingPairings) {
      if (pending.socket === socket) { clearTimeout(pending.timeout); pendingPairings.delete(sessionId); }
    }
  });
}

function registerPendingPairing(socket: net.Socket, sessionKey: Buffer, pairingCode: string, identityPublicKey: string): void {
  const sessionId = randomUUID();
  const timeout = setTimeout(() => {
    pendingPairings.delete(sessionId);
    socket.destroy();
    emit('pairingExpired', { sessionId });
  }, PAIRING_TIMEOUT_MS);
  pendingPairings.set(sessionId, { socket, sessionKey, pairingCode, identityPublicKey, attempts: 0, timeout });
  emit('pairingCandidate', { sessionId });
}

export function confirmPairing(sessionId: string, enteredCode: string, name: string, owner: string | null): PairedDevice {
  const pending = pendingPairings.get(sessionId);
  if (!pending) throw new Error(localizeMainText('Sessão de pareamento expirada. Gere um novo QR code.'));
  pending.attempts += 1;
  if (pending.attempts > MAX_PAIRING_ATTEMPTS) {
    pendingPairings.delete(sessionId);
    clearTimeout(pending.timeout);
    pending.socket.destroy();
    throw new Error(localizeMainText('Número de tentativas excedido. Gere um novo QR code.'));
  }
  if (enteredCode.trim() !== pending.pairingCode) {
    throw new Error(localizeMainText('Código incorreto. Confira o código exibido no celular.'));
  }

  clearTimeout(pending.timeout);
  pendingPairings.delete(sessionId);

  const device: PairedDevice = {
    id: randomUUID(),
    name,
    public_key: pending.identityPublicKey,
    owner,
    paired_at: new Date().toISOString(),
    last_sync_at: null,
    revoked_at: null,
  };
  getDb().prepare(`
    INSERT INTO paired_devices (id, name, public_key, owner, paired_at)
    VALUES (?,?,?,?,?)
  `).run(device.id, device.name, device.public_key, device.owner, device.paired_at);

  pending.socket.write(packFrame(encryptFrame(pending.sessionKey, { op: 'paired', success: true })));
  emit('paired', device);
  return device;
}

export function cancelPairing(sessionId: string): void {
  const pending = pendingPairings.get(sessionId);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingPairings.delete(sessionId);
  pending.socket.destroy();
}

function findPairedDevice(publicKey: string): PairedDevice | undefined {
  return getDb().prepare(`
    SELECT * FROM paired_devices WHERE public_key = ? AND revoked_at IS NULL
  `).get(publicKey) as PairedDevice | undefined;
}

export function listPairedDevices(): PairedDevice[] {
  return getDb().prepare('SELECT * FROM paired_devices ORDER BY paired_at DESC').all() as PairedDevice[];
}

export function revokeDevice(id: string): void {
  getDb().prepare(`UPDATE paired_devices SET revoked_at = datetime('now') WHERE id = ?`).run(id);
}

// Reconsulta paired_devices a cada mensagem (não só na conexão) para que uma
// revogação feita enquanto o socket já está aberto e autenticado tenha
// efeito imediato, em vez de só valer na próxima conexão.
function handleSyncMessage(socket: net.Socket, sessionKey: Buffer, message: { op: string; [key: string]: unknown }): void {
  const identityPublicKey = findConnectionOwnerKey(socket);
  const device = identityPublicKey ? findPairedDevice(identityPublicKey) : undefined;
  if (!device) { socket.destroy(); return; }

  if (message.op === 'sync_request') {
    const accounts = getDb().prepare('SELECT id, name, type FROM accounts ORDER BY name').all();
    const categories = getDb().prepare('SELECT id, name, parent_id, kind FROM categories ORDER BY name').all();
    socket.write(packFrame(encryptFrame(sessionKey, { op: 'accounts_categories', accounts, categories })));
    return;
  }
  if (message.op === 'push_transactions') {
    const items = (message.items as MobileTransactionInput[]) ?? [];
    const results = items.map(item => pushTransaction(device, item));
    getDb().prepare(`UPDATE paired_devices SET last_sync_at = datetime('now') WHERE id = ?`).run(device.id);
    socket.write(packFrame(encryptFrame(sessionKey, { op: 'push_result', results })));
    emit('transactionsReceived', { deviceId: device.id, results });
  }
}

function findConnectionOwnerKey(socket: net.Socket): string | undefined {
  return connectionIdentity.get(socket);
}

interface MobileTransactionInput {
  client_id: string;
  account_id: string;
  category_id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  date: string;
  notes?: string | null;
}

function pushTransaction(device: PairedDevice, item: MobileTransactionInput): PushResult {
  const db = getDb();
  const existing = db.prepare('SELECT 1 FROM transactions WHERE mobile_device_id = ? AND mobile_client_id = ?')
    .get(device.id, item.client_id);
  if (existing) return { client_id: item.client_id, status: 'duplicate' };

  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(item.account_id);
  if (!account) return { client_id: item.client_id, status: 'rejected', reason: 'account_not_found' };
  const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(item.category_id);
  if (!category) return { client_id: item.client_id, status: 'rejected', reason: 'category_not_found' };

  try {
    insertConfirmedTransaction({
      account_id: item.account_id,
      category_id: item.category_id,
      description: item.description,
      amount: item.amount,
      type: item.type,
      date: item.date,
      notes: item.notes ?? null,
      owner: device.owner,
      mobile_device_id: device.id,
      mobile_client_id: item.client_id,
    });
    return { client_id: item.client_id, status: 'created' };
  } catch {
    // Corrida rara: dois pushes do mesmo client_id em paralelo — a unique
    // index de idx_transactions_mobile_origin já barrou a segunda escrita.
    return { client_id: item.client_id, status: 'duplicate' };
  }
}

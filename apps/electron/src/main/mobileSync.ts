import * as net from 'node:net';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import { getDb } from './database';
import { localizeMainText } from './i18n';
import { getLocalSecret, setLocalSecret } from './localSecrets';
import { insertConfirmedTransaction } from './ipc/transactions';
import type { PairedDevice } from '../shared/types';
import {
  computeIdentityProof, decryptFrame, deriveSessionKeys, encryptFrame, exportPrivateKey, exportPublicKey,
  FrameParser, generateX25519KeyPair, importPrivateKey, importPublicKey, packFrame,
} from './mobileCrypto';
import type { KeyPair } from './mobileCrypto';

// Listener TCP local para o app mobile — só existe enquanto a tela
// "Sincronizar celular" está aberta no desktop (ver render()/cleanup em
// src/renderer/pages/mobileSync.ts). Não roda em background: o banco só
// está desbloqueado enquanto o app está aberto, e não faz sentido escutar
// conexões de rede quando o usuário não está ativamente sincronizando.
//
// Handshake por conexão (o QR só carrega {ip, port} — nenhuma chave):
//   1. Celular → desktop, texto claro: { identityPublicKey, nonce, knownDesktopIdentity }
//   2. Desktop → celular, texto claro: { ephemeralPublicKey, identityPublicKey, identityProof }
//   3. Os dois lados derivam a mesma chave de sessão (ECDH X25519 + HKDF) e,
//      se a conexão ainda não é considerada confiável (`trusted` abaixo), o
//      mesmo código de 6 dígitos pra confirmação manual.
//   4. Daí em diante todo frame é [4 bytes tamanho][iv|tag|ciphertext].
//
// `trusted` (== "pula a tela de código") exige as duas coisas ao mesmo
// tempo: o desktop já conhece esse celular (public_key em paired_devices,
// não revogada) *e* o celular já tem a identidade deste desktop fixada
// (pinned) de uma confirmação manual anterior — ver computeIdentityProof em
// mobileCrypto.ts para o porquê de só a public_key do device não bastar
// (um MITM ativo conseguiria completar o ECDH da sessão com a chave
// estática do celular sem nunca ter a chave privada de identidade do
// desktop de verdade). Um celular pareando pela primeira vez, ou que ainda
// não fixou a identidade deste desktop, sempre vira uma "pairing candidate"
// aguardando confirmação do código pela UI do desktop.
const MAX_PAIRING_ATTEMPTS = 3;
const PAIRING_TIMEOUT_MS = 2 * 60 * 1000;

// Porta fixa (faixa de portas dinâmicas/privadas da IANA, sem uso registrado
// conhecido) em vez de deixar o SO escolher uma efêmera: com firewall
// restritivo por padrão (ex: firewalld na zona "public", comum em
// distros como openSUSE/Fedora), uma porta aleatória a cada sessão
// tornaria impossível liberar a conexão de forma permanente — o usuário
// teria que reabrir o firewall toda vez que reabrisse esta tela. Com porta
// fixa, uma unica regra (`firewall-cmd --add-port=47821/tcp --permanent`)
// resolve de vez.
const MOBILE_SYNC_PORT = 47821;

const DESKTOP_IDENTITY_PUBLIC_KEY = 'mobile_sync_identity_public';
const DESKTOP_IDENTITY_PRIVATE_KEY = 'mobile_sync_identity_private';
const DESKTOP_IDENTITY_PRIVATE_SECRET = 'mobile_sync_identity_private';

let cachedDesktopIdentity: KeyPair | null = null;

// Identidade X25519 de longo prazo do desktop, gerada uma única vez e
// guardada em app_settings (dentro do banco SQLCipher — mesma proteção que
// já vale pra outros segredos guardados ali, ex: credenciais de Open
// Finance). Espelha IdentityKeyStore.kt do lado do celular: sem isso o
// desktop não tem como provar a mesma identidade em reconexões futuras
// (ver computeIdentityProof em mobileCrypto.ts).
function getOrCreateDesktopIdentity(): KeyPair {
  if (cachedDesktopIdentity) return cachedDesktopIdentity;
  const db = getDb();
  const pub = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(DESKTOP_IDENTITY_PUBLIC_KEY) as { value: string } | undefined;
  const legacyPriv = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(DESKTOP_IDENTITY_PRIVATE_KEY) as { value: string } | undefined;
  const storedPrivateKey = getLocalSecret(DESKTOP_IDENTITY_PRIVATE_SECRET);
  if (pub && (storedPrivateKey || legacyPriv?.value)) {
    const privateKey = storedPrivateKey ?? legacyPriv!.value;
    // Migração idempotente: só apaga o legado depois que o cofre confirmou a
    // gravação. Se safeStorage estiver indisponível, a exceção preserva a
    // identidade anterior e impede gerar silenciosamente outra chave.
    if (!storedPrivateKey) setLocalSecret(DESKTOP_IDENTITY_PRIVATE_SECRET, privateKey);
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(DESKTOP_IDENTITY_PRIVATE_KEY);
    cachedDesktopIdentity = { publicKey: importPublicKey(pub.value), privateKey: importPrivateKey(privateKey) };
    return cachedDesktopIdentity;
  }
  const generated = generateX25519KeyPair();
  setLocalSecret(DESKTOP_IDENTITY_PRIVATE_SECRET, exportPrivateKey(generated.privateKey));
  const stmt = db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`);
  stmt.run(DESKTOP_IDENTITY_PUBLIC_KEY, exportPublicKey(generated.publicKey));
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(DESKTOP_IDENTITY_PRIVATE_KEY);
  cachedDesktopIdentity = generated;
  return generated;
}

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
function resolveLanAddress(): { ip: string; iface: string } {
  const interfaces = os.networkInterfaces();
  for (const [iface, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return { ip: entry.address, iface };
    }
  }
  throw new Error(localizeMainText('Nenhuma rede local ativa foi encontrada. Conecte o computador a uma rede Wi-Fi ou cabeada.'));
}

const execFileAsync = promisify(execFile);

// (Linux, firewalld) Libera a porta fixa do sync no firewall na primeira vez,
// via pkexec (diálogo gráfico de autenticação do PolicyKit) — sem isso,
// distros com firewall restritivo por padrão (ex: firewalld na zona
// "public", comum em openSUSE/Fedora) derrubam a conexão do celular em
// silêncio, sem qualquer aviso. Windows e macOS já perguntam sozinhos na
// primeira vez que um app escuta uma porta nova, então isso só roda no
// Linux. Idempotente: se a porta já está liberada, não pede senha de novo.
// Qualquer falha (firewalld ausente, pkexec ausente, usuário cancelou o
// diálogo) é ignorada em silêncio — o listener sobe do mesmo jeito, e só
// vai falhar de fato se a porta continuar bloqueada.
async function ensureLinuxFirewallPort(iface: string, port: number): Promise<void> {
  if (process.platform !== 'linux') return;
  try {
    const { stdout: state } = await execFileAsync('firewall-cmd', ['--state']);
    if (state.trim() !== 'running') return;

    let zone: string;
    try {
      const { stdout } = await execFileAsync('firewall-cmd', [`--get-zone-of-interface=${iface}`]);
      zone = stdout.trim();
    } catch {
      const { stdout } = await execFileAsync('firewall-cmd', ['--get-default-zone']);
      zone = stdout.trim();
    }
    if (!zone) return;

    try {
      // Sai com codigo 0 se a porta ja esta liberada nessa zona — nada a fazer.
      await execFileAsync('firewall-cmd', [`--zone=${zone}`, `--query-port=${port}/tcp`]);
      return;
    } catch {
      // Codigo != 0 = porta ainda nao liberada; segue pro pkexec abaixo.
    }

    await execFileAsync('pkexec', [
      'sh', '-c',
      `firewall-cmd --zone=${zone} --add-port=${port}/tcp --permanent && firewall-cmd --reload`,
    ]);
  } catch {
    // Sem firewalld, sem pkexec, ou usuario cancelou o dialogo — segue sem a porta liberada.
  }
}

export async function startSyncListener(): Promise<{ ip: string; port: number }> {
  if (server) throw new Error(localizeMainText('A sincronização com celular já está ativa.'));
  const { ip, iface } = resolveLanAddress();
  await ensureLinuxFirewallPort(iface, MOBILE_SYNC_PORT);
  const listening = net.createServer(socket => {
    console.log(`[mobileSync] nova conexão de ${socket.remoteAddress}:${socket.remotePort}`);
    handleConnection(socket);
  });
  server = listening;
  return new Promise((resolve, reject) => {
    listening.once('error', err => {
      console.error('[mobileSync] erro no listener:', err);
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
      console.log(`[mobileSync] listener ativo em ${ip}:${address.port}`);
      resolve({ ip, port: address.port });
    });
    listening.listen(MOBILE_SYNC_PORT, ip);
  });
}

export function stopSyncListener(): void {
  console.log('[mobileSync] parando listener');
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

  socket.on('error', () => { /* conexão instável do celular, ignorar — 'close' já limpa o estado */ });

  socket.on('data', (chunk: Buffer) => {
    try {
      for (const frame of parser.push(chunk)) {
        console.log(`[mobileSync] frame recebido de ${socket.remoteAddress}:${socket.remotePort}, ${frame.length} bytes, connectionIdentity=${connectionIdentity.has(socket)}`);
        // "Handshake" = ainda sem entrada em connectionIdentity. Não dá pra
        // guardar isso numa variável local à conexão (como um `let stage`):
        // confirmPairing() roda fora do escopo de handleConnection, chamada
        // pela UI quando o operador confirma o código — precisa de um jeito
        // de sinalizar "essa conexão pode ir pro estágio de sync" de fora.
        // Reaproveitar o WeakMap que já existe faz isso sem estado duplicado.
        if (!connectionIdentity.has(socket)) {
          const parsed = JSON.parse(frame.toString('utf8')) as {
            identityPublicKey: string; nonce: string; knownDesktopIdentity?: string | null;
          };
          const { identityPublicKey, nonce } = parsed;
          const knownDesktopIdentity = parsed.knownDesktopIdentity ?? null;
          const peerPublicKey = importPublicKey(identityPublicKey);
          const salt = Buffer.concat([
            desktopKeys.publicKey.export({ type: 'spki', format: 'der' }) as Buffer,
            peerPublicKey.export({ type: 'spki', format: 'der' }) as Buffer,
          ]);
          const derived = deriveSessionKeys(desktopKeys.privateKey, peerPublicKey, salt);
          sessionKey = derived.sessionKey;

          // Prova de posse da identidade de longo prazo do desktop (ver
          // computeIdentityProof em mobileCrypto.ts): amarra a chave efêmera
          // desta conexão + o nonce do celular a um segredo estático-estático
          // que só quem tem a chave privada de mobile_sync_identity consegue
          // calcular. `proofSalt` e `proofMessage` têm que usar exatamente a
          // mesma ordem de bytes calculada em SyncClient.kt do outro lado.
          const desktopIdentity = getOrCreateDesktopIdentity();
          const desktopIdentityPublicKey = exportPublicKey(desktopIdentity.publicKey);
          const proofSalt = Buffer.concat([
            Buffer.from(identityPublicKey, 'base64'),
            Buffer.from(desktopIdentityPublicKey, 'base64'),
          ]);
          const proofMessage = Buffer.concat([
            desktopKeys.publicKey.export({ type: 'spki', format: 'der' }) as Buffer,
            Buffer.from(nonce ?? '', 'base64'),
          ]);
          const identityProof = computeIdentityProof(desktopIdentity.privateKey, peerPublicKey, proofSalt, proofMessage);

          // alreadyPaired vai na resposta em texto claro pra o celular nunca
          // precisar confiar no proprio estado local pra decidir se espera
          // confirmacao de pareamento — o desktop e a fonte de verdade. Sem
          // isso, um celular que perdeu o processo entre o desktop confirmar
          // o pareamento e ele proprio marcar isso localmente (app fechado
          // pelo Android no meio do handshake, por exemplo) ficaria pra
          // sempre esperando um 'paired' que nunca mais chega — o desktop já
          // o reconhece e vai direto pro estágio de sync sem reenviar nada.
          //
          // Mas isso sozinho não é suficiente pra pular a confirmação com
          // segurança (ver comentário no topo do arquivo): também exige que
          // o celular já tenha fixado a identidade *deste* desktop numa
          // confirmação manual anterior. Um MITM ativo sempre cai no `else`
          // abaixo, porque nunca vai ter a identidade fixada pelo celular
          // batendo com a chave pública real do desktop.
          const device = findPairedDevice(identityPublicKey);
          const trusted = Boolean(device) && knownDesktopIdentity === desktopIdentityPublicKey;
          socket.write(packFrame(Buffer.from(JSON.stringify({
            ephemeralPublicKey: exportPublicKey(desktopKeys.publicKey),
            identityPublicKey: desktopIdentityPublicKey,
            identityProof: identityProof.toString('base64'),
            alreadyPaired: trusted,
          }), 'utf8')));

          console.log(`[mobileSync] handshake ok, trusted=${trusted}`);
          if (trusted) {
            connectionIdentity.set(socket, identityPublicKey);
          } else {
            registerPendingPairing(socket, sessionKey, derived.pairingCode, identityPublicKey);
          }
          continue;
        }
        if (!sessionKey) continue;
        const message = decryptFrame<{ op: string; [key: string]: unknown }>(sessionKey, frame);
        console.log(`[mobileSync] mensagem de sync: op=${message.op}`);
        handleSyncMessage(socket, sessionKey, message);
      }
    } catch (err) {
      console.error('[mobileSync] erro processando frame, derrubando conexão:', err);
      socket.destroy();
    }
  });

  socket.on('close', () => {
    console.log(`[mobileSync] conexão fechada: ${socket.remoteAddress}:${socket.remotePort}`);
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

  // Uma "pairing candidate" agora também acontece quando o desktop já
  // conhece esse celular mas o celular ainda não fixou a identidade deste
  // desktop (ver `trusted` em handleConnection) — nesse caso reaproveita a
  // linha existente (mesmo id) em vez de inserir uma duplicata, o que
  // quebraria o histórico e o vínculo com transactions.mobile_device_id.
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM paired_devices WHERE public_key = ?`).get(pending.identityPublicKey) as PairedDevice | undefined;
  const device: PairedDevice = existing
    ? { ...existing, name, owner, revoked_at: null }
    : { id: randomUUID(), name, public_key: pending.identityPublicKey, owner, paired_at: new Date().toISOString(), last_sync_at: null, revoked_at: null };

  if (existing) {
    db.prepare(`UPDATE paired_devices SET name = ?, owner = ?, revoked_at = NULL WHERE id = ?`).run(name, owner, existing.id);
  } else {
    db.prepare(`
      INSERT INTO paired_devices (id, name, public_key, owner, paired_at)
      VALUES (?,?,?,?,?)
    `).run(device.id, device.name, device.public_key, device.owner, device.paired_at);
  }
  console.log(`[mobileSync] pareamento confirmado: device=${device.id} (${existing ? 'reconfirmado' : 'novo'})`);

  pending.socket.write(packFrame(encryptFrame(pending.sessionKey, { op: 'paired', success: true })));
  // Sem isso, o celular manda sync_request cifrado na mesma conexao logo em
  // seguida (é o fluxo normal apos confirmar pareamento) e o handler de
  // 'data' ainda trata essa conexao como "sem identidade" -> tenta fazer
  // JSON.parse de bytes cifrados -> lanca -> socket.destroy(). Do lado do
  // celular isso aparece como a conexao caindo bem no meio do primeiro sync,
  // travando o app (excecao nao tratada fora de um SyncError).
  connectionIdentity.set(pending.socket, pending.identityPublicKey);
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
    // O celular só lança despesa (ver br.com.w3ti.fina.mobile — decisão de
    // produto, receita continua exclusiva do desktop). Filtrar aqui, e não só
    // na UI do app, evita que o usuário escolha por engano uma categoria de
    // receita: insertConfirmedTransaction()/assertCategoryType() rejeitaria
    // esse lançamento na hora do push, e antes desse filtro esse erro caía no
    // catch genérico do pushTransaction() e virava 'duplicate' — o item
    // sumia da fila do celular como se tivesse sido sincronizado, sem nunca
    // ter sido gravado.
    const categories = getDb().prepare("SELECT id, name, parent_id, kind FROM categories WHERE type = 'expense' ORDER BY name").all();
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
  } catch (err) {
    // Só é 'duplicate' se a checagem acima (linha 364) perdeu uma corrida
    // real (dois pushes do mesmo client_id em paralelo — a unique index de
    // idx_transactions_mobile_origin barrou a segunda escrita): reconfere
    // agora. Qualquer outro erro (categoria/tipo incompatível, valor
    // inválido etc.) tem que virar 'rejected' com o motivo real — tratar
    // como duplicate aqui faria o celular apagar da fila um lançamento que
    // nunca foi gravado, uma perda de dado silenciosa.
    const nowExists = db.prepare('SELECT 1 FROM transactions WHERE mobile_device_id = ? AND mobile_client_id = ?')
      .get(device.id, item.client_id);
    if (nowExists) return { client_id: item.client_id, status: 'duplicate' };
    return { client_id: item.client_id, status: 'rejected', reason: err instanceof Error ? err.message : String(err) };
  }
}

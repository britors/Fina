export function requireRecord(value: unknown, name = 'payload'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name}-invalid`);
  }
  return value as Record<string, unknown>;
}

export function requireString(value: unknown, options: {
  name?: string;
  allowEmpty?: boolean;
  maxLength?: number;
  pattern?: RegExp;
} = {}): string {
  const name = options.name ?? 'string';
  if (typeof value !== 'string') throw new Error(`${name}-invalid`);
  if (!options.allowEmpty && !value.trim()) throw new Error(`${name}-empty`);
  if (value.length > (options.maxLength ?? 4_096)) throw new Error(`${name}-too-long`);
  if (value.includes('\0')) throw new Error(`${name}-invalid`);
  if (options.pattern && !options.pattern.test(value)) throw new Error(`${name}-invalid`);
  return value;
}

export function optionalNullableString(value: unknown, options: { name?: string; maxLength?: number } = {}): string | null {
  if (value == null) return null;
  return requireString(value, { ...options, allowEmpty: true });
}

const MAX_IPC_DEPTH = 20;
const MAX_IPC_NODES = 100_000;
const MAX_IPC_STRING_UNITS = 8 * 1024 * 1024;

// Limite estrutural aplicado a todos os canais antes do handler de domínio.
// Não substitui validação semântica, mas impede payloads patológicos de
// chegarem ao banco, filesystem ou integrações de rede.
export function assertSafeIpcArguments(args: unknown[]): void {
  let nodes = 0;
  let stringUnits = 0;
  const seen = new WeakSet<object>();

  const visit = (value: unknown, depth: number): void => {
    nodes++;
    if (nodes > MAX_IPC_NODES || depth > MAX_IPC_DEPTH) throw new Error('ipc-payload-too-complex');
    if (typeof value === 'string') {
      stringUnits += value.length;
      if (stringUnits > MAX_IPC_STRING_UNITS || value.includes('\0')) throw new Error('ipc-payload-invalid');
      return;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('ipc-payload-invalid');
      return;
    }
    if (value == null || typeof value === 'boolean' || typeof value === 'undefined') return;
    if (typeof value !== 'object') throw new Error('ipc-payload-invalid');
    if (seen.has(value)) throw new Error('ipc-payload-invalid');
    seen.add(value);
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      const byteLength = value instanceof ArrayBuffer ? value.byteLength : value.byteLength;
      if (byteLength > MAX_IPC_STRING_UNITS) throw new Error('ipc-payload-invalid');
      return;
    }
    const entries = Array.isArray(value)
      ? value.map((entry, index) => [String(index), entry] as const)
      : Object.entries(value as Record<string, unknown>);
    for (const [key, entry] of entries) {
      stringUnits += key.length;
      if (stringUnits > MAX_IPC_STRING_UNITS) throw new Error('ipc-payload-invalid');
      visit(entry, depth + 1);
    }
  };

  for (const arg of args) visit(arg, 0);
}

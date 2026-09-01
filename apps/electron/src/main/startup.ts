export type StartupSchemaResult = { ok: true } | { ok: false; error: unknown };

// Mantém a decisão fail-closed testável sem depender do runtime do Electron.
// O chamador só pode registrar IPC e abrir a UI quando `ok` for verdadeiro.
export function initializeRequiredSchema(migrate: () => void): StartupSchemaResult {
  try {
    migrate();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

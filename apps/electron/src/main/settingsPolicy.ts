// Configurações que fazem parte do contrato público entre main e renderer.
// Estado operacional interno, cursores e material criptográfico nunca devem
// atravessar o IPC nem ser graváveis por um canal genérico de settings.
export const PUBLIC_SETTING_KEYS = new Set([
  'accent_color',
  'autobackup_folder',
  'autobackup_last',
  'autobackup_last_full',
  'autobackup_trigger',
  'family_members',
  'family_mode',
  'mei_enabled',
  'notif_asset_reminders',
  'notif_bills',
  'notif_budget',
  'notif_receivables',
  'notif_subscription',
  'notif_summary',
  'smtp_enabled',
  'smtp_from',
  'smtp_host',
  'smtp_pass',
  'smtp_port',
  'smtp_secure',
  'smtp_to',
  'smtp_user',
  'sync_enabled',
  'sync_folder',
  'theme',
  'user_email',
  'user_name',
  'webhook_enabled',
  'webhook_url',
]);

export function assertPublicSettingKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || !PUBLIC_SETTING_KEYS.has(key)) {
    throw new Error('setting-not-authorized');
  }
}

export function filterPublicSettings(rows: { key: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(rows
    .filter(row => PUBLIC_SETTING_KEYS.has(row.key))
    .map(row => [row.key, row.value]));
}

export function validatePublicSettingEntries(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('settings-payload-invalid');
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > PUBLIC_SETTING_KEYS.size) throw new Error('settings-payload-too-large');
  const result: Record<string, string> = {};
  for (const [key, entryValue] of entries) {
    assertPublicSettingKey(key);
    if (typeof entryValue !== 'string' || entryValue.length > 8_192 || entryValue.includes('\0')) {
      throw new Error('setting-value-invalid');
    }
    result[key] = entryValue;
  }
  return result;
}

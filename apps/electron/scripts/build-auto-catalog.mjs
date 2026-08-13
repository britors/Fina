import fs from 'node:fs';

const inventoryPath = process.argv[2];
const outputPath = process.argv[3] ?? 'src/renderer/i18n-auto.json';
if (!inventoryPath) throw new Error('usage: node scripts/build-auto-catalog.mjs INVENTORY.json [OUTPUT.json]');

const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const legacySource = fs.readFileSync(new URL('../src/renderer/i18n.ts', import.meta.url), 'utf8');
const legacyBlock = legacySource.slice(legacySource.indexOf('const entries'), legacySource.indexOf('const supported'));
const legacy = new Set([...legacyBlock.matchAll(/^\s*\['((?:\\.|[^'])*)'/gm)].map(match => match[1].replace(/\\'/g, "'")));
const sources = [...new Set(inventory.map(item => item.text))].filter(source => !legacy.has(source)).sort();
const separator = '\n__FINA_I18N_SEPARATOR__\n';

async function translateBatch(batch, target) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  for (const [key, value] of Object.entries({ client: 'gtx', sl: 'pt', tl: target, dt: 't', q: batch.join(separator) })) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`translation request failed: ${response.status}`);
  const payload = await response.json();
  const translated = payload[0].map(part => part[0]).join('').split(separator);
  if (translated.length !== batch.length) throw new Error(`translation batch lost boundaries (${target})`);
  return translated.map(value => value.trim());
}

const catalogs = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : {};
for (const source of legacy) delete catalogs[source];
const pendingSources = sources.filter(source => !catalogs[source]);
for (const source of pendingSources) catalogs[source] = { 'pt-BR': source };
for (const [target, locale] of [['en', 'en-US'], ['es', 'es-ES'], ['zh-CN', 'zh-CN']]) {
  for (let offset = 0; offset < pendingSources.length; offset += 20) {
    const batch = pendingSources.slice(offset, offset + 20);
    const translated = await translateBatch(batch, target);
    batch.forEach((source, index) => { catalogs[source][locale] = translated[index]; });
    process.stderr.write(`\r${locale}: ${Math.min(offset + batch.length, pendingSources.length)}/${pendingSources.length}`);
  }
  process.stderr.write('\n');
}

const ordered = Object.fromEntries(Object.entries(catalogs).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(outputPath, `${JSON.stringify(ordered, null, 2)}\n`);
console.log(`Catalog now contains ${Object.keys(ordered).length} messages (${pendingSources.length} added)`);

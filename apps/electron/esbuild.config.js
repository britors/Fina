// @ts-check
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--production');
const isTests = process.argv.includes('--tests');

const shared = {
  bundle: true,
  sourcemap: !isProd,
  minify: isProd,
};

function cp(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyAssets() {
  fs.mkdirSync('out/renderer', { recursive: true });
  cp('src/renderer/index.html', 'out/renderer/index.html');
  cp('src/renderer/splash.html', 'out/renderer/splash.html');
  cp('src/renderer/unlock.html', 'out/renderer/unlock.html');
  cp('src/assets/splash-fino.jpg', 'out/renderer/assets/splash-fino.jpg');
  cp('src/assets/fina_logo_capivara.png', 'out/renderer/assets/fina_logo_capivara.png');
  cp('../../MANUAL_USUARIO.md', 'out/MANUAL_USUARIO.md');

  fs.mkdirSync('out/main/migrations', { recursive: true });
  for (const f of fs.readdirSync('src/main/migrations')) {
    cp(`src/main/migrations/${f}`, `out/main/migrations/${f}`);
  }

  // Ícone do app (usado pelo BrowserWindow em dev e pelo electron-builder em prod)
  if (fs.existsSync('build/icon.svg')) {
    fs.mkdirSync('out/build', { recursive: true });
    cp('build/icon.svg', 'out/build/icon.svg');
  }
  if (fs.existsSync('build/icon.png')) {
    fs.mkdirSync('out/build', { recursive: true });
    cp('build/icon.png', 'out/build/icon.png');
  }
}

function cleanOutput() {
  fs.rmSync('out', { recursive: true, force: true });
}

async function buildTests() {
  await esbuild.build({
    ...shared,
    entryPoints: ['tests/accounts.test.ts', 'tests/transactions.test.ts', 'tests/invoices.test.ts', 'tests/klavi.test.ts', 'tests/belvo.test.ts', 'tests/categories.test.ts', 'tests/categoryQueries.test.ts', 'tests/confirmedAction.test.ts', 'tests/databaseRestore.test.ts', 'tests/migrations.test.ts', 'tests/debts.test.ts', 'tests/family.test.ts', 'tests/irpf.test.ts', 'tests/i18n.test.ts', 'tests/ipcChannels.test.ts', 'tests/ipcGuard.test.ts', 'tests/ipcValidation.test.ts', 'tests/mainWindowLifecycle.test.ts', 'tests/mobileCrypto.test.ts', 'tests/mobileIdentity.test.ts', 'tests/money.test.ts', 'tests/settingsPolicy.test.ts', 'tests/startup.test.ts', 'tests/updaterWindowState.test.ts', 'tests/incrementalBackup.test.ts', 'tests/bradescoPdfParser.test.ts', 'tests/desktopRelease.test.ts'],
    outdir: 'out/tests',
    platform: 'node',
    format: 'cjs',
    external: ['electron', 'better-sqlite3-multiple-ciphers'],
  });
  console.log('Tests built → out/tests/');
}

async function build() {
  // Testes também usam out/. Não deixe testes nem artefatos antigos entrarem
  // no app.asar, que inclui out/**/*.
  if (!isWatch) cleanOutput();
  copyAssets();

  const configs = [
    {
      ...shared,
      entryPoints: ['src/main/index.ts'],
      outfile: 'out/main/index.js',
      platform: 'node',
      format: 'cjs',
      external: ['electron', 'better-sqlite3-multiple-ciphers', 'tesseract.js', 'pdfjs-dist'],
    },
    {
      ...shared,
      entryPoints: ['src/main/preload.ts'],
      outfile: 'out/preload/index.js',
      platform: 'node',
      format: 'cjs',
      external: ['electron'],
    },
    {
      ...shared,
      entryPoints: ['src/renderer/index.ts'],
      outfile: 'out/renderer/index.js',
      platform: 'browser',
      format: 'iife',
    },
    {
      ...shared,
      entryPoints: ['src/renderer/unlock.ts'],
      outfile: 'out/renderer/unlock.js',
      platform: 'browser',
      format: 'iife',
    },
    {
      ...shared,
      entryPoints: ['src/renderer/splash.ts'],
      outfile: 'out/renderer/splash.js',
      platform: 'browser',
      format: 'iife',
    },
  ];

  if (isWatch) {
    const ctxs = await Promise.all(configs.map(c => esbuild.context(c)));
    await Promise.all(ctxs.map(c => c.watch()));
    console.log('Watching for changes…');
  } else {
    await Promise.all(configs.map(c => esbuild.build(c)));
    console.log('Build complete → out/');
  }
}

if (isTests) {
  buildTests().catch(e => { console.error(e); process.exit(1); });
} else {
  build().catch(e => { console.error(e); process.exit(1); });
}

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
  cp('MANUAL_USUARIO.md', 'out/MANUAL_USUARIO.md');

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

async function buildTests() {
  await esbuild.build({
    ...shared,
    entryPoints: ['tests/accounts.test.ts', 'tests/transactions.test.ts'],
    outdir: 'out/tests',
    platform: 'node',
    format: 'cjs',
    external: ['electron', 'better-sqlite3'],
  });
  console.log('Tests built → out/tests/');
}

async function build() {
  copyAssets();

  const configs = [
    {
      ...shared,
      entryPoints: ['src/main/index.ts'],
      outfile: 'out/main/index.js',
      platform: 'node',
      format: 'cjs',
      external: ['electron', 'better-sqlite3'],
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

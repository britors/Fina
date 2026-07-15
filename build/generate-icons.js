// Gera build/icons/<size>x<size>.png (tema hicolor, usado pelo linux.icon do
// electron-builder para o .deb/.rpm), build/icon.png (512x512, fallback em
// pixmaps) e build/icon.ico (256x256, Windows) a partir de build/icon.svg
// Dependências: @resvg/resvg-js, png-to-ico  (npm run generate-icons)
const { Resvg }  = require('@resvg/resvg-js');
const pngToIco   = require('png-to-ico');
const fs         = require('fs');
const path       = require('path');

// Tamanhos padrão do tema hicolor (spec freedesktop). Um único PNG grande
// (ex: só 512x512) faz o .deb/.rpm instalar apenas um tamanho em
// usr/share/icons/hicolor/512x512/apps/ — a maioria dos ambientes (KDE
// incluso) não escala esse fallback direito para o menu/barra de tarefas e
// mostra o ícone genérico. Gerando o conjunto completo, cada tamanho tem seu
// próprio PNG em usr/share/icons/hicolor/<size>x<size>/apps/, que é o que os
// lançadores de fato varrem.
const HICOLOR_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

function renderPng(svg, size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

async function main() {
  const svgPath = path.join(__dirname, 'icon.svg');
  const svg     = fs.readFileSync(svgPath);

  const iconsDir = path.join(__dirname, 'icons');
  fs.mkdirSync(iconsDir, { recursive: true });
  for (const size of HICOLOR_SIZES) {
    fs.writeFileSync(path.join(iconsDir, `${size}x${size}.png`), renderPng(svg, size));
  }
  console.log(`✓ build/icons/{${HICOLOR_SIZES.join(',')}}x*.png`);

  // 512×512 PNG solto — fallback em /usr/share/pixmaps (AUR PKGBUILD)
  fs.writeFileSync(path.join(__dirname, 'icon.png'), renderPng(svg, 512));
  console.log('✓ build/icon.png (512x512)');

  // 256×256 → ICO para Windows
  const ico = await pngToIco([renderPng(svg, 256)]);
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico);
  console.log('✓ build/icon.ico (256x256)');
}

main().catch(e => { console.error(e); process.exit(1); });

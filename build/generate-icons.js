// Gera build/icon.png (512x512) e build/icon.ico (256x256) a partir de build/icon.svg
// Dependências: @resvg/resvg-js, png-to-ico  (npm run generate-icons)
const { Resvg }  = require('@resvg/resvg-js');
const pngToIco   = require('png-to-ico');
const fs         = require('fs');
const path       = require('path');

async function main() {
  const svgPath = path.join(__dirname, 'icon.svg');
  const svg     = fs.readFileSync(svgPath);

  // 512×512 PNG para Linux (electron-builder)
  const r512 = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } });
  const png512 = r512.render().asPng();
  fs.writeFileSync(path.join(__dirname, 'icon.png'), png512);
  console.log('✓ build/icon.png (512x512)');

  // 256×256 → ICO para Windows
  const r256  = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } });
  const png256 = r256.render().asPng();
  const ico = await pngToIco([png256]);
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico);
  console.log('✓ build/icon.ico (256x256)');
}

main().catch(e => { console.error(e); process.exit(1); });

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNewerDesktopVersion, selectLatestDesktopRelease } from '../src/main/desktopRelease';

test('ignora releases mobile e seleciona a release desktop estável', () => {
  const release = selectLatestDesktopRelease([
    { tag_name: 'mobile-v0.2.0', html_url: 'https://github.com/britors/Fina/releases/tag/mobile-v0.2.0' },
    { tag_name: 'v18.3.0', html_url: 'https://github.com/britors/Fina/releases/tag/v18.3.0', prerelease: true },
    { tag_name: 'v18.2.0', html_url: 'https://github.com/britors/Fina/releases/tag/v18.2.0' },
  ]);
  assert.equal(release?.tag_name, 'v18.2.0');
});

test('aceita somente URLs e tags desktop esperadas', () => {
  assert.equal(selectLatestDesktopRelease({}), null);
  assert.equal(selectLatestDesktopRelease([
    { tag_name: 'v18.2.0', html_url: 'https://example.com/falso' },
    { tag_name: 'v18.2', html_url: 'https://github.com/britors/Fina/releases/tag/v18.2' },
  ]), null);
});

test('compara versões semanticamente sem oferecer downgrade', () => {
  assert.equal(isNewerDesktopVersion('18.2.1', '18.2.0'), true);
  assert.equal(isNewerDesktopVersion('19.0.0', '18.99.99'), true);
  assert.equal(isNewerDesktopVersion('18.2.0', '18.2.0'), false);
  assert.equal(isNewerDesktopVersion('18.1.9', '18.2.0'), false);
  assert.equal(isNewerDesktopVersion('mobile-v0.2.0', '18.2.0'), false);
});

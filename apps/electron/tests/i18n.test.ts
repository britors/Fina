import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCatalogIntegrity, resolveLocale, translateFor } from '../src/renderer/i18n';

test('os quatro catálogos compartilham um inventário completo e sem duplicatas', () => {
  assert.doesNotThrow(assertCatalogIntegrity);
  for (const locale of ['en-US', 'pt-BR', 'es-ES', 'zh-CN'] as const) {
    assert.notEqual(translateFor(locale, 'Configurações'), '');
  }
});

test('o locale da sessão seleciona somente idiomas suportados com fallback en-US', () => {
  assert.equal(resolveLocale(['pt_BR.UTF-8']), 'pt-BR');
  assert.equal(resolveLocale(['es-MX']), 'es-ES');
  assert.equal(resolveLocale(['zh-Hans-CN']), 'zh-CN');
  assert.equal(resolveLocale(['de-DE']), 'en-US');
  assert.equal(resolveLocale([]), 'en-US');
});

test('chaves desconhecidas permanecem legíveis', () => {
  assert.equal(translateFor('en-US', 'Future key'), 'Future key');
});

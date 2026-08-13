import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { assertCatalogIntegrity, escapeHtml, messageKeys, resolveLocale, supportsPix, td, translateFor, translateKeyFor } from '../src/renderer/i18n';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const target = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(target) : target.endsWith('.ts') ? [target] : [];
  });
}

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

test('interpolação nomeada escapa HTML e exige todos os valores', () => {
  assert.equal(translateFor('en-US', 'Hello {name}', { name: '<Admin>' }), 'Hello &lt;Admin&gt;');
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.throws(() => translateFor('en-US', 'Hello {name}'));
});

test('chaves estáveis nunca são renderizadas nem ficam sem tradução', () => {
  for (const locale of ['en-US', 'pt-BR', 'es-ES', 'zh-CN'] as const) {
    const value = translateKeyFor(locale, 'documents.empty.title');
    assert.notEqual(value, 'documents.empty.title');
    assert.ok(value.trim());
  }
  assert.throws(() => translateKeyFor('en-US', 'missing.key' as never));
});

test('catálogo de chaves estáveis não contém chaves órfãs ou referências ausentes', () => {
  const source = sourceFiles(join(process.cwd(), 'src'))
    .filter(file => !file.endsWith(join('renderer', 'i18n.ts')))
    .map(file => readFileSync(file, 'utf8')).join('\n');
  const calls = [...source.matchAll(/\b(?:tk|tpk)\(([^)]*)\)/g)].map(match => match[1]).join('\n');
  const referenced = new Set([...calls.matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]));
  assert.deepEqual([...referenced].filter(key => !messageKeys.includes(key as never)), []);
  assert.deepEqual(messageKeys.filter(key => !referenced.has(key)), []);
});

test('Pix é disponibilizado exclusivamente para pt-BR', () => {
  assert.equal(supportsPix('pt-BR'), true);
  assert.equal(supportsPix('en-US'), false);
  assert.equal(supportsPix('es-ES'), false);
  assert.equal(supportsPix('zh-CN'), false);
});

test('rótulos padrão persistidos no banco são localizados sem traduzir dados livres', () => {
  assert.equal(translateFor('en-US', 'Salário'), 'Salary');
  assert.equal(translateFor('es-ES', 'Alimentação'), 'Alimentación');
  assert.equal(translateFor('zh-CN', 'Conta Corrente'), '活期账户');
  assert.equal(translateFor('en-US', 'Mercado da Ana'), 'Mercado da Ana');
});

test('templates legados interpolam cada valor com escape seguro', () => {
  const value = td('A descrição contém "{value}", associado à categoria "{value}".', ['<food>', 'Home & bills']);
  assert.match(value, /&lt;food&gt;/);
  assert.match(value, /Home &amp; bills/);
  assert.doesNotMatch(value, /\{value\}/);
});

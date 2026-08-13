import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const sourceRoots = ['src/renderer', 'src/main'];
const files = sourceRoots.flatMap(dir => walk(path.join(root, dir)))
  .filter(file => /\.(?:ts|html)$/.test(file) && !file.endsWith(`${path.sep}renderer${path.sep}i18n.ts`) && !file.includes(`${path.sep}migrations${path.sep}`));
const migratedFiles = new Set(['src/renderer/pages/documentos.ts']);

const portuguese = /[áàâãéêíóôõúç]|\b(?:a|ao|aos|as|com|da|das|de|do|dos|e|em|entre|erro|esta|não|nenhum|nova?|o|os|ou|para|por|que|salvar|se|sem|seu|sua|um|uma|valor|você)\b/i;
const allowlist = JSON.parse(fs.readFileSync(path.join(root, 'scripts/i18n-allowlist.json'), 'utf8'))
  .map(entry => ({ ...entry, regex: new RegExp(entry.pattern, entry.caseSensitive ? '' : 'i') }));
const htmlAttribute = /\b(?:aria-label|placeholder|title)\s*=\s*["']([^"']*[A-Za-zÀ-ÿ][^"']*)["']/gi;
const htmlText = />\s*([^<>{}\n]*[A-Za-zÀ-ÿ][^<>{}\n]*)\s*</g;
const findings = [];
const referencedMessages = new Set();

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const visiblePropertyNames = new Set([
  'body', 'description', 'detail', 'emptyLabel', 'label', 'message', 'okLabel',
  'placeholder', 'saveLabel', 'sub', 'subtitle', 'title',
]);

function add(file, line, kind, text, forceVisible = false) {
  const value = text.replace(/\s+/g, ' ').trim();
  const inherentlyVisible = forceVisible || kind === 'html-text' || kind === 'attribute';
  if (value.length < 2 || allowlist.some(entry => entry.regex.test(value)) || (!inherentlyVisible && !portuguese.test(value))) return;
  findings.push({ file: path.relative(root, file), line, kind, text: value });
}

function scanHtml(file, source, baseLine = 1) {
  for (const regex of [htmlAttribute, htmlText]) {
    regex.lastIndex = 0;
    for (const match of source.matchAll(regex)) {
      const line = baseLine + source.slice(0, match.index).split('\n').length - 1;
      add(file, line, regex === htmlAttribute ? 'attribute' : 'html-text', match[1]);
    }
  }
}

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.html')) {
    scanHtml(file, source);
    continue;
  }
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const visit = node => {
    const parentCall = node.parent && ts.isCallExpression(node.parent) ? node.parent : undefined;
    if (parentCall && ts.isIdentifier(parentCall.expression) && ['t', 'td', 'tk', 'tp', 'tpk', 'localizeMainText'].includes(parentCall.expression.text)) {
      if (['t', 'td', 'tp', 'localizeMainText'].includes(parentCall.expression.text) && parentCall.arguments[0] === node && ts.isStringLiteralLike(node)) {
        referencedMessages.add(node.text);
      }
      return;
    }
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      if (/<[A-Za-z!/]/.test(node.text)) scanHtml(file, node.text, line);
      else {
        const property = ts.isPropertyAssignment(node.parent) && node.parent.initializer === node
          ? node.parent.name.getText(ast).replace(/^['"]|['"]$/g, '')
          : '';
        add(file, line, 'literal', node.text, visiblePropertyNames.has(property));
      }
    } else if (ts.isTemplateExpression(node)) {
      const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      const skeleton = [node.head.text, ...node.templateSpans.map(span => `{value}${span.literal.text}`)].join('');
      if (/<[A-Za-z!/]/.test(skeleton)) scanHtml(file, skeleton, line);
      else add(file, line, 'template', skeleton);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}

const unique = new Map(findings.map(item => [`${item.file}:${item.line}:${item.kind}:${item.text}`, item]));
const result = [...unique.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
const selected = process.argv.includes('--migrated') ? result.filter(item => migratedFiles.has(item.file)) : result;
if (process.argv.includes('--json')) console.log(JSON.stringify(selected, null, 2));
else {
  if (!process.argv.includes('--quiet')) for (const item of selected) console.log(`${item.file}:${item.line}: ${item.kind}: ${item.text}`);
  if (!process.argv.includes('--quiet')) console.log(`\n${selected.length} probable user-visible Portuguese literals in ${new Set(selected.map(x => x.file)).size} files.`);
}
if (process.argv.includes('--check') && selected.length) process.exitCode = 1;
if (process.argv.includes('--catalog-check')) {
  const generatedRaw = fs.readFileSync(path.join(root, 'src/renderer/i18n-auto.json'), 'utf8');
  const generatedKeys = [...generatedRaw.matchAll(/^  "((?:\\.|[^"])*)": \{/gm)].map(match => JSON.parse(`"${match[1]}"`));
  const duplicateGeneratedKeys = generatedKeys.filter((key, index) => generatedKeys.indexOf(key) !== index);
  if (duplicateGeneratedKeys.length) {
    for (const key of new Set(duplicateGeneratedKeys)) console.error(`duplicate generated catalog key: ${key}`);
    process.exitCode = 1;
  }
  const generated = JSON.parse(generatedRaw);
  const legacySource = fs.readFileSync(path.join(root, 'src/renderer/i18n.ts'), 'utf8');
  const legacyBlock = legacySource.slice(legacySource.indexOf('const entries'), legacySource.indexOf('const supported'));
  const legacy = new Set([...legacyBlock.matchAll(/^\s*\['((?:\\.|[^'])*)'/gm)].map(match => match[1].replace(/\\'/g, "'")));
  const crossCatalogDuplicates = Object.keys(generated).filter(source => legacy.has(source));
  if (crossCatalogDuplicates.length) {
    for (const source of crossCatalogDuplicates) console.error(`duplicate message across catalogs: ${source}`);
    process.exitCode = 1;
  }
  const missing = selected.filter(item => !generated[item.text] && !legacy.has(item.text));
  const missingReferences = [...referencedMessages].filter(source => !generated[source] && !legacy.has(source));
  const used = new Set([...selected.map(item => item.text), ...referencedMessages]);
  const orphaned = Object.keys(generated).filter(source => !used.has(source));
  if (missing.length) {
    for (const item of missing) console.error(`${item.file}:${item.line}: missing catalog message: ${item.text}`);
    process.exitCode = 1;
  }
  if (missingReferences.length) {
    for (const source of missingReferences) console.error(`missing referenced catalog message: ${source}`);
    process.exitCode = 1;
  }
  if (orphaned.length) {
    for (const source of orphaned) console.error(`orphaned catalog message: ${source}`);
    process.exitCode = 1;
  }
}

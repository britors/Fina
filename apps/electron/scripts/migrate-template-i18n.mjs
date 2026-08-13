import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const renderer = path.join(root, 'src/renderer');
const catalog = JSON.parse(fs.readFileSync(path.join(renderer, 'i18n-auto.json'), 'utf8'));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

for (const file of walk(renderer).filter(file => file.endsWith('.ts') && !file.endsWith('i18n.ts'))) {
  let source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const edits = [];
  const visit = node => {
    if (ts.isTemplateExpression(node)) {
      const raw = source.slice(node.getStart(ast), node.getEnd());
      const skeleton = [node.head.text, ...node.templateSpans.map(span => `{value}${span.literal.text}`)]
        .join('').replace(/\s+/g, ' ').trim();
      const alreadyTranslated = node.parent && ts.isCallExpression(node.parent)
        && ts.isIdentifier(node.parent.expression) && ['t', 'td', 'tk', 'tp', 'tpk'].includes(node.parent.expression.text);
      if (!alreadyTranslated && !raw.includes('<') && catalog[skeleton]) {
        const expressions = node.templateSpans.map(span => source.slice(span.expression.getStart(ast), span.expression.getEnd()));
        edits.push({ start: node.getStart(ast), end: node.getEnd(), text: `td(${JSON.stringify(skeleton)}, [${expressions.join(', ')}])` });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!edits.length) continue;
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  const rel = path.relative(path.dirname(file), path.join(renderer, 'i18n')).replaceAll(path.sep, '/');
  const specifier = rel.startsWith('.') ? rel : `./${rel}`;
  source = `import { td } from '${specifier}';\n${source}`;
  fs.writeFileSync(file, source);
  console.log(`${path.relative(root, file)}: ${edits.length}`);
}

import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { Category, CategoryType } from '../../shared/types';
import { assertCategoryCanBecomeChild, normalizeCategoryKind, validateCategoryParent } from '../../shared/categoryHierarchy';

type CreatePayload = Omit<Category, 'id' | 'created_at' | 'parent_id' | 'parent_name' | 'depth' | 'children_count'> & {
  parent_id?: string | null;
};
type UpdatePayload = { id: string } & Partial<CreatePayload>;

type StoredCategory = Category & { parent_id: string | null };

const CATEGORY_SELECT = `
  SELECT c.*, p.name AS parent_name,
    CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END AS depth,
    (SELECT COUNT(*) FROM categories child WHERE child.parent_id = c.id) AS children_count
  FROM categories c
  LEFT JOIN categories p ON p.id = c.parent_id
`;

function findCategory(id: string): StoredCategory | undefined {
  return getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id) as StoredCategory | undefined;
}

function validateParent(parentId: string | null | undefined, categoryId?: string): StoredCategory | null {
  if (!parentId) return null;
  return validateCategoryParent(parentId, categoryId, findCategory(parentId)) as StoredCategory;
}

function assertUniqueName(name: string, type: CategoryType, parentId: string | null, exceptId?: string): void {
  const duplicate = getDb().prepare(`
    SELECT id FROM categories
    WHERE type = ? AND lower(trim(name)) = lower(trim(?))
      AND parent_id IS ? AND id != COALESCE(?, '')
    LIMIT 1
  `).get(type, name, parentId, exceptId ?? null);
  if (duplicate) throw new Error('Já existe uma categoria com este nome neste nível.');
}

function assertNoBudgetConflictAfterMove(categoryId: string, parentId: string | null): void {
  if (!parentId) return;
  const conflict = getDb().prepare(`
    SELECT 1
    FROM budgets child_budget
    JOIN budgets parent_budget
      ON parent_budget.month = child_budget.month
      AND parent_budget.year = child_budget.year
    WHERE child_budget.category_id = ? AND parent_budget.category_id = ?
    LIMIT 1
  `).get(categoryId, parentId);
  if (conflict) throw new Error('A mudança criaria conflito entre orçamentos da categoria pai e da subcategoria.');
}

function categoryWithDetails(id: string): Category | null {
  return getDb().prepare(`${CATEGORY_SELECT} WHERE c.id = ?`).get(id) as Category | undefined ?? null;
}

export function registerCategoryHandlers(): void {
  ipcMain.handle('categories:list', (_e, type?: CategoryType) => {
    const where = type ? 'WHERE c.type = ?' : '';
    return getDb().prepare(`
      ${CATEGORY_SELECT}
      ${where}
      ORDER BY COALESCE(p.name, c.name) COLLATE NOCASE,
        CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END,
        c.name COLLATE NOCASE
    `).all(...(type ? [type] : []));
  });

  ipcMain.handle('categories:get', (_e, id: string) => categoryWithDetails(id));

  ipcMain.handle('categories:create', (_e, data: CreatePayload) => {
    const name = data.name.trim();
    if (!name) throw new Error('Informe o nome da categoria.');

    const parent = validateParent(data.parent_id);
    const type = parent?.type ?? data.type;
    const kind = parent?.kind ?? normalizeCategoryKind(type, data.kind);
    const parentId = parent?.id ?? null;
    assertUniqueName(name, type, parentId);

    const id = randomUUID();
    getDb().prepare(
      'INSERT INTO categories (id, name, icon, color, type, kind, parent_id) VALUES (?,?,?,?,?,?,?)'
    ).run(id, name, data.icon, data.color, type, kind, parentId);
    return categoryWithDetails(id);
  });

  ipcMain.handle('categories:update', (_e, { id, ...changes }: UpdatePayload) => {
    const current = findCategory(id);
    if (!current) throw new Error('Categoria não encontrada.');

    const requestedParentId = changes.parent_id === undefined ? current.parent_id : changes.parent_id;
    const parent = validateParent(requestedParentId, id);
    const hasChildren = !!getDb().prepare('SELECT 1 FROM categories WHERE parent_id = ? LIMIT 1').get(id);
    assertCategoryCanBecomeChild(hasChildren, !!parent);

    const name = (changes.name ?? current.name).trim();
    if (!name) throw new Error('Informe o nome da categoria.');
    const type = parent?.type ?? changes.type ?? current.type;
    const kind = parent?.kind ?? normalizeCategoryKind(type, changes.kind ?? current.kind);
    const parentId = parent?.id ?? null;
    assertUniqueName(name, type, parentId, id);
    assertNoBudgetConflictAfterMove(id, parentId);

    const icon = changes.icon ?? current.icon;
    const color = changes.color ?? current.color;
    const db = getDb();
    db.transaction(() => {
      db.prepare(`
        UPDATE categories SET name=?, icon=?, color=?, type=?, kind=?, parent_id=? WHERE id=?
      `).run(name, icon, color, type, kind, parentId, id);
      if (hasChildren) {
        db.prepare('UPDATE categories SET type=?, kind=? WHERE parent_id=?').run(type, kind, id);
      }
    })();
    return categoryWithDetails(id);
  });

  ipcMain.handle('categories:delete', (_e, id: string) => {
    const db = getDb();
    if (!findCategory(id)) return;
    if (db.prepare('SELECT 1 FROM categories WHERE parent_id = ? LIMIT 1').get(id)) {
      throw new Error('Esta categoria possui subcategorias e não pode ser removida.');
    }
    if (db.prepare('SELECT 1 FROM transactions WHERE category_id = ? LIMIT 1').get(id)) {
      throw new Error('Esta categoria possui transações vinculadas e não pode ser removida.');
    }
    if (db.prepare('SELECT 1 FROM bills WHERE category_id = ? LIMIT 1').get(id)) {
      throw new Error('Esta categoria possui contas vinculadas e não pode ser removida.');
    }
    if (db.prepare('SELECT 1 FROM budgets WHERE category_id = ? LIMIT 1').get(id)) {
      throw new Error('Esta categoria possui orçamentos vinculados e não pode ser removida.');
    }
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  });
}

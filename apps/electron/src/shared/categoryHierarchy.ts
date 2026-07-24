import type { Category, CategoryKind, CategoryType } from './types';

export function normalizeCategoryKind(type: CategoryType, kind?: CategoryKind): CategoryKind {
  if (type === 'income') return 'income';
  return kind === 'essential' ? 'essential' : 'variable';
}

export function validateCategoryParent(
  parentId: string | null | undefined,
  categoryId: string | undefined,
  parent: Pick<Category, 'id' | 'parent_id'> | undefined,
): Pick<Category, 'id' | 'parent_id'> | null {
  if (!parentId) return null;
  if (parentId === categoryId) throw new Error('Uma categoria não pode ser subcategoria dela mesma.');
  if (!parent) throw new Error('A categoria pai informada não existe.');
  if (parent.parent_id) throw new Error('O Fina suporta apenas um nível de subcategorias.');
  return parent;
}

export function assertCategoryCanBecomeChild(hasChildren: boolean, hasParent: boolean): void {
  if (hasChildren && hasParent) {
    throw new Error('Uma categoria com subcategorias não pode se tornar subcategoria.');
  }
}

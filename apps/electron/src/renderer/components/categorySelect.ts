import type { Category, CategoryType } from '../../shared/types';

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function categoryLabel(category: Category): string {
  return category.parent_id ? `\u00a0\u00a0└ ${category.name}` : category.name;
}

export function categoryPath(category: Category): string {
  return category.parent_name ? `${category.parent_name} › ${category.name}` : category.name;
}

export function categoryOptions(
  categories: Category[],
  selectedId?: string | null,
  options: { type?: CategoryType; emptyLabel?: string } = {},
): string {
  const rows = options.type ? categories.filter(category => category.type === options.type) : categories;
  const empty = options.emptyLabel == null
    ? ''
    : `<option value="">${esc(options.emptyLabel)}</option>`;
  return empty + rows.map(category => `
    <option value="${esc(category.id)}" ${selectedId === category.id ? 'selected' : ''} title="${esc(categoryPath(category))}">
      ${esc(categoryLabel(category))}
    </option>
  `).join('');
}

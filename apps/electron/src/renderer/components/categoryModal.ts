import { invoke } from '../api';
import { openModal } from './modal';
import { showAlert } from './alertDialog';
import type { Category, CategoryKind, CategoryType } from '../../shared/types';
import { categoryOptions } from './categorySelect';

const ICONS = [
  'ti-briefcase',   'ti-code',             'ti-building-bank', 'ti-cash',
  'ti-shopping-cart','ti-pizza',            'ti-coffee',        'ti-basket',
  'ti-car',         'ti-bus',              'ti-plane',         'ti-bike',
  'ti-home',        'ti-tools',            'ti-droplet',       'ti-bolt',
  'ti-heart-rate-monitor','ti-pill',        'ti-dumbbell',      'ti-salad',
  'ti-device-gamepad-2','ti-music',        'ti-movie',         'ti-book',
  'ti-school',      'ti-shirt',            'ti-gift',          'ti-phone',
  'ti-currency-dollar','ti-wallet',        'ti-chart-bar',     'ti-category',
];
const COLORS = ['#1D9E75','#3B82F6','#8B5CF6','#EF9F27','#D85A30','#EC4899','#14B8A6','#F43F5E'];

function esc(s?: string): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export async function openCategoryModal(
  cat: Category | null,
  onDone: () => void,
  defaultType: CategoryType = 'expense',
  initialParentId?: string,
): Promise<void> {
  const categories = await invoke<Category[]>('categories:list');
  let selIcon  = cat?.icon  ?? ICONS[0];
  let selColor = cat?.color ?? COLORS[0];
  const selectedParentId = cat?.parent_id ?? initialParentId ?? null;
  const selectedParent = categories.find(category => category.id === selectedParentId);
  const initialType = selectedParent?.type ?? cat?.type ?? defaultType;
  const initialKind = selectedParent?.kind ?? cat?.kind ?? (initialType === 'income' ? 'income' : 'variable');
  const availableParents = categories.filter(category => !category.parent_id && category.id !== cat?.id);
  const accent = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#1D9E75').trim();
  const selBg  = accent + '22';

  const overlay = openModal({
    title: cat ? 'Editar categoria' : 'Nova categoria',
    body: `
      <div class="form-group">
        <label class="form-label">Nome</label>
        <input class="form-ctrl" id="f-cat-name" value="${esc(cat?.name ?? '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Categoria pai <span style="color:var(--text-3)">(opcional)</span></label>
        <select class="form-ctrl" id="f-cat-parent">
          ${categoryOptions(availableParents, selectedParentId, { emptyLabel: '— Categoria principal —' })}
        </select>
        <div style="font-size:11px;color:var(--text-3);margin-top:5px">Subcategorias herdam o tipo e a classificação da categoria pai.</div>
      </div>
      <div class="form-group">
        <label class="form-label">Tipo</label>
        <select class="form-ctrl" id="f-cat-type" ${selectedParent ? 'disabled' : ''}>
          <option value="expense" ${initialType !== 'income' ? 'selected' : ''}>Despesa</option>
          <option value="income"  ${initialType === 'income' ? 'selected' : ''}>Receita</option>
        </select>
      </div>
      <div class="form-group" id="f-cat-kind-group" style="display:${initialType === 'income' ? 'none' : ''}">
        <label class="form-label">Classificação</label>
        <select class="form-ctrl" id="f-cat-kind" ${selectedParent ? 'disabled' : ''}>
          <option value="essential" ${initialKind === 'essential' ? 'selected' : ''}>Essencial</option>
          <option value="variable" ${initialKind !== 'essential' ? 'selected' : ''}>Variável</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Cor</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${COLORS.map(c => `
            <div style="width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;
              border:2px solid ${c === selColor ? '#fff' : 'transparent'};transition:border-color 0.12s"
              data-color="${c}"></div>
          `).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Ícone</label>
        <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px">
          ${ICONS.map(ic => `
            <div style="width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;
              cursor:pointer;border:2px solid ${ic === selIcon ? 'var(--accent)' : 'transparent'};
              background:${ic === selIcon ? selBg : 'var(--surface2)'};transition:all 0.1s"
              data-icon="${ic}" title="${ic.replace('ti-','')}">
              <i class="ti ${ic}" style="font-size:16px"></i>
            </div>
          `).join('')}
        </div>
      </div>
    `,
    onSave: () => {
      const name = (document.getElementById('f-cat-name') as HTMLInputElement).value.trim();
      const parent_id = (document.getElementById('f-cat-parent') as HTMLSelectElement).value || null;
      const parent = categories.find(category => category.id === parent_id);
      const type = parent?.type ?? (document.getElementById('f-cat-type') as HTMLSelectElement).value as CategoryType;
      const kind = parent?.kind ?? (type === 'income' ? 'income' : (document.getElementById('f-cat-kind') as HTMLSelectElement).value as CategoryKind);
      if (!name) { showAlert('Informe o nome.'); return false; }
      const p = cat
        ? invoke('categories:update', { id: cat.id, name, icon: selIcon, color: selColor, type, kind, parent_id })
        : invoke('categories:create', { name, icon: selIcon, color: selColor, type, kind, parent_id });
      p.then(() => onDone());
    },
  });

  overlay.querySelector<HTMLSelectElement>('#f-cat-type')?.addEventListener('change', e => {
    const type = (e.target as HTMLSelectElement).value as CategoryType;
    (overlay.querySelector('#f-cat-kind-group') as HTMLElement).style.display = type === 'income' ? 'none' : '';
  });

  overlay.querySelector<HTMLSelectElement>('#f-cat-parent')?.addEventListener('change', e => {
    const parent = categories.find(category => category.id === (e.target as HTMLSelectElement).value);
    const typeSelect = overlay.querySelector<HTMLSelectElement>('#f-cat-type')!;
    const kindSelect = overlay.querySelector<HTMLSelectElement>('#f-cat-kind')!;
    typeSelect.disabled = !!parent;
    kindSelect.disabled = !!parent;
    if (parent) {
      typeSelect.value = parent.type;
      kindSelect.value = parent.kind;
    }
    (overlay.querySelector('#f-cat-kind-group') as HTMLElement).style.display = typeSelect.value === 'income' ? 'none' : '';
  });

  overlay.querySelectorAll<HTMLElement>('[data-color]').forEach(dot => {
    dot.addEventListener('click', () => {
      selColor = dot.dataset.color!;
      overlay.querySelectorAll<HTMLElement>('[data-color]').forEach(d => {
        d.style.borderColor = d.dataset.color === selColor ? '#fff' : 'transparent';
      });
    });
  });

  overlay.querySelectorAll<HTMLElement>('[data-icon]').forEach(iconEl => {
    iconEl.addEventListener('click', () => {
      selIcon = iconEl.dataset.icon!;
      overlay.querySelectorAll<HTMLElement>('[data-icon]').forEach(d => {
        const sel = d.dataset.icon === selIcon;
        d.style.borderColor = sel ? 'var(--accent)' : 'transparent';
        d.style.background  = sel ? selBg : 'var(--surface2)';
      });
    });
  });
}

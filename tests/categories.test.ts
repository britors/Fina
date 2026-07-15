import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCategoryCanBecomeChild,
  normalizeCategoryKind,
  validateCategoryParent,
} from '../src/shared/categoryHierarchy';

describe('normalizeCategoryKind', () => {
  test('receita sempre usa natureza income', () => {
    assert.equal(normalizeCategoryKind('income', 'essential'), 'income');
  });

  test('despesa preserva essential e usa variable como padrão', () => {
    assert.equal(normalizeCategoryKind('expense', 'essential'), 'essential');
    assert.equal(normalizeCategoryKind('expense'), 'variable');
  });
});

describe('validateCategoryParent', () => {
  test('aceita categoria sem pai', () => {
    assert.equal(validateCategoryParent(null, 'child', undefined), null);
  });

  test('aceita uma categoria raiz como pai', () => {
    const parent = { id: 'root', parent_id: null };
    assert.equal(validateCategoryParent('root', 'child', parent), parent);
  });

  test('rejeita autorreferência', () => {
    assert.throws(
      () => validateCategoryParent('same', 'same', { id: 'same', parent_id: null }),
      /não pode ser subcategoria dela mesma/,
    );
  });

  test('rejeita pai inexistente', () => {
    assert.throws(
      () => validateCategoryParent('missing', 'child', undefined),
      /não existe/,
    );
  });

  test('rejeita terceiro nível', () => {
    assert.throws(
      () => validateCategoryParent('child-parent', 'new-child', { id: 'child-parent', parent_id: 'root' }),
      /apenas um nível/,
    );
  });
});

describe('assertCategoryCanBecomeChild', () => {
  test('permite mover categoria sem filhas', () => {
    assert.doesNotThrow(() => assertCategoryCanBecomeChild(false, true));
  });

  test('rejeita transformar pai com filhas em subcategoria', () => {
    assert.throws(
      () => assertCategoryCanBecomeChild(true, true),
      /com subcategorias/,
    );
  });
});

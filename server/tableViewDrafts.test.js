import test from 'node:test';
import assert from 'node:assert/strict';
import { editTypeFitsColumn, normalizeTableViewDraft } from './tableViewDrafts.js';

const catalog = {
  tables: [
    {
      name: 'planning_tasks',
      columns: [
        { name: 'id', label: 'Id', type: 'number', nullable: false },
        { name: 'code', label: 'Code', type: 'text', nullable: false },
        { name: 'name', label: 'Name', type: 'text', nullable: false }
      ]
    }
  ]
};

test('normalizeTableViewDraft accepts and normalizes a valid draft', () => {
  assert.deepEqual(
    normalizeTableViewDraft({
      name: 'Planning compact',
      rootTable: 'planning_tasks',
      columns: ['code', 'name']
    }, catalog),
    {
      name: 'Planning compact',
      rootTable: 'planning_tasks',
      status: 'draft',
      columns: [
        { name: 'code', label: 'Code', description: '', type: 'text', nullable: false, visible: true, order: 0, pin: null, width: null, editType: 'readonly', editable: false, required: false, min: null, max: null },
        { name: 'name', label: 'Name', description: '', type: 'text', nullable: false, visible: true, order: 1, pin: null, width: null, editType: 'readonly', editable: false, required: false, min: null, max: null }
      ]
    }
  );
});

test('normalizeTableViewDraft preserves display configuration', () => {
  assert.deepEqual(
    normalizeTableViewDraft({
      name: 'Planning compact',
      rootTable: 'planning_tasks',
      columns: [
        { name: 'name', label: 'Taak', description: 'Korte taaknaam', visible: true, order: 2, pin: 'left', width: 700 },
        { name: 'code', label: 'Code', visible: false, order: 1, pin: 'middle', width: 40 }
      ]
    }, catalog).columns,
    [
      { name: 'code', label: 'Code', description: '', type: 'text', nullable: false, visible: false, order: 0, pin: null, width: 80, editType: 'readonly', editable: false, required: false, min: null, max: null },
      { name: 'name', label: 'Taak', description: 'Korte taaknaam', type: 'text', nullable: false, visible: true, order: 1, pin: 'left', width: 640, editType: 'readonly', editable: false, required: false, min: null, max: null }
    ]
  );
});

test('editTypeFitsColumn allows only compatible free edit types', () => {
  assert.equal(editTypeFitsColumn('readonly', 'jsonb'), true);
  assert.equal(editTypeFitsColumn('text', 'text'), true);
  assert.equal(editTypeFitsColumn('text', 'number'), false);
  assert.equal(editTypeFitsColumn('number', 'number'), true);
  assert.equal(editTypeFitsColumn('number', 'date'), false);
  assert.equal(editTypeFitsColumn('date', 'date'), true);
  assert.equal(editTypeFitsColumn('date', 'datetime'), true);
});

test('normalizeTableViewDraft stores editable validation metadata', () => {
  const draft = normalizeTableViewDraft({
    name: 'Planning editable',
    rootTable: 'planning_tasks',
    columns: [
      { name: 'code', label: 'Code', editType: 'text', required: true },
      { name: 'id', label: 'Id', editType: 'number', min: 1, max: 99 }
    ]
  }, catalog);

  assert.equal(draft.columns[0].editType, 'text');
  assert.equal(draft.columns[0].editable, true);
  assert.equal(draft.columns[0].required, true);
  assert.equal(draft.columns[1].editType, 'number');
  assert.equal(draft.columns[1].min, 1);
  assert.equal(draft.columns[1].max, 99);
});

test('normalizeTableViewDraft rejects missing root table and empty column selection', () => {
  assert.throws(
    () => normalizeTableViewDraft({ name: 'Broken', rootTable: '', columns: [] }, catalog),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.fieldErrors.rootTable, 'Root table is verplicht.');
      assert.equal(error.fieldErrors.columns, 'Selecteer minstens een kolom.');
      return true;
    }
  );
});

test('normalizeTableViewDraft rejects unknown and duplicate columns', () => {
  assert.throws(
    () => normalizeTableViewDraft({
      name: 'Broken',
      rootTable: 'planning_tasks',
      columns: ['code', 'code']
    }, catalog),
    (error) => {
      assert.equal(error.fieldErrors.columns, 'Dubbele kolom geselecteerd: code.');
      return true;
    }
  );

  assert.throws(
    () => normalizeTableViewDraft({
      name: 'Broken',
      rootTable: 'planning_tasks',
      columns: ['missing']
    }, catalog),
    (error) => {
      assert.equal(error.fieldErrors.columns, 'Onbekende kolom voor planning_tasks: missing.');
      return true;
    }
  );
});

test('normalizeTableViewDraft rejects empty and duplicate visible labels', () => {
  assert.throws(
    () => normalizeTableViewDraft({
      name: 'Broken',
      rootTable: 'planning_tasks',
      columns: [{ name: 'code', label: '' }]
    }, catalog),
    (error) => {
      assert.equal(error.fieldErrors.labels, 'Label is verplicht voor kolom code.');
      return true;
    }
  );

  assert.throws(
    () => normalizeTableViewDraft({
      name: 'Broken',
      rootTable: 'planning_tasks',
      columns: [
        { name: 'code', label: 'Taak' },
        { name: 'name', label: 'taak' }
      ]
    }, catalog),
    (error) => {
      assert.equal(error.fieldErrors.labels, 'Dubbel zichtbaar label: taak.');
      return true;
    }
  );
});

test('normalizeTableViewDraft rejects incompatible edit types and invalid ranges', () => {
  assert.throws(
    () => normalizeTableViewDraft({
      name: 'Broken',
      rootTable: 'planning_tasks',
      columns: [{ name: 'code', label: 'Code', editType: 'number' }]
    }, catalog),
    (error) => {
      assert.equal(error.fieldErrors.editType, 'Code kan niet als number bewerkt worden op database type text.');
      return true;
    }
  );

  assert.throws(
    () => normalizeTableViewDraft({
      name: 'Broken',
      rootTable: 'planning_tasks',
      columns: [{ name: 'id', label: 'Id', editType: 'number', min: 10, max: 1 }]
    }, catalog),
    (error) => {
      assert.equal(error.fieldErrors.validation, 'Min mag niet groter zijn dan max voor Id.');
      return true;
    }
  );
});

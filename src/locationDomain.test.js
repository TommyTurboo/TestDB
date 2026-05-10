import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBreadcrumb,
  buildNextLocationRow,
  defaultLocationColumns,
  filterTreeNodes,
  matchesColumnValueFilters,
  matchesLocationQuery,
  parseClipboardTable,
  validateClipboardValue,
  wouldCreateLocationCycle
} from './locationDomain.js';

const rows = [
  { id: 'root', code: 'ROOT', name: 'Root', type: 'Project', parentId: null, typeCode: 'project', confidence: 'explicit' },
  { id: 'zone', code: 'ZONE', name: 'Zone', type: 'Zone', parentId: 'root', typeCode: 'zone', confidence: 'derived' },
  { id: 'room', code: 'ROOM', name: 'Machinekamer', type: 'Lokaal', parentId: 'zone', typeCode: 'room', confidence: 'inferred' }
];

test('defaultLocationColumns keeps stable visibility, ordering and code pin', () => {
  const columns = defaultLocationColumns();

  assert.equal(columns[0].field, 'code');
  assert.equal(columns[0].pin, 'left');
  assert.deepEqual(columns.map((column) => column.order), columns.map((_, index) => index));
  assert.equal(columns.find((column) => column.field === 'metadata').visible, false);
  assert.equal(columns.find((column) => column.field === 'abbreviation').visible, false);
  assert.equal(columns.find((column) => column.field === 'name').visible, true);
});

test('wouldCreateLocationCycle blocks moving a node below itself or a descendant', () => {
  assert.equal(wouldCreateLocationCycle(rows, 'zone', 'zone'), true);
  assert.equal(wouldCreateLocationCycle(rows, 'zone', 'room'), true);
  assert.equal(wouldCreateLocationCycle(rows, 'room', 'root'), false);
  assert.equal(wouldCreateLocationCycle(rows, 'room', null), false);
});

test('buildBreadcrumb returns the ordered parent trail and stops on cycles', () => {
  assert.deepEqual(
    buildBreadcrumb(rows[2], rows).map((row) => row.id),
    ['root', 'zone', 'room']
  );

  const cyclicRows = [
    { id: 'a', parentId: 'b' },
    { id: 'b', parentId: 'a' }
  ];
  assert.deepEqual(
    buildBreadcrumb(cyclicRows[0], cyclicRows).map((row) => row.id),
    ['b', 'a']
  );
});

test('matchesLocationQuery searches default and scoped fields', () => {
  const row = {
    code: 'ASPER-SLUIS',
    name: 'Sluis Asper',
    type: 'Deel',
    complexName: 'Asper',
    metadata: { source: 'manual' }
  };

  assert.equal(matchesLocationQuery(row, 'sluis', []), true);
  assert.equal(matchesLocationQuery(row, 'manual', []), true);
  assert.equal(matchesLocationQuery(row, 'manual', ['name']), false);
  assert.equal(matchesLocationQuery(row, 'sluis', ['name']), true);
});

test('matchesColumnValueFilters requires every active column value', () => {
  const row = { type: 'Deel', confidence: 'explicit', metadata: { zone: 1 } };

  assert.equal(matchesColumnValueFilters(row, {}), true);
  assert.equal(matchesColumnValueFilters(row, { type: ['Deel'], confidence: ['explicit'] }), true);
  assert.equal(matchesColumnValueFilters(row, { type: ['Project'], confidence: ['explicit'] }), false);
  assert.equal(matchesColumnValueFilters(row, { metadata: [JSON.stringify({ zone: 1 })] }), true);
});

test('filterTreeNodes keeps matching descendants and parents needed for context', () => {
  const tree = [
    {
      id: 'root',
      name: 'Root',
      code: 'ROOT',
      confidence: 'explicit',
      children: [
        { id: 'room', name: 'Machinekamer', code: 'ROOM', confidence: 'derived' },
        { id: 'yard', name: 'Buitenruimte', code: 'YARD', confidence: 'inferred' }
      ]
    }
  ];

  const byQuery = filterTreeNodes(tree, 'machine', 'all');
  assert.deepEqual(byQuery.map((node) => node.id), ['root']);
  assert.deepEqual(byQuery[0].children.map((node) => node.id), ['room']);

  const byConfidence = filterTreeNodes(tree, '', 'inferred');
  assert.deepEqual(byConfidence[0].children.map((node) => node.id), ['yard']);
});

test('parseClipboardTable normalizes line endings and preserves tabular cells', () => {
  assert.deepEqual(parseClipboardTable('a\tb\r\nc\td'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parseClipboardTable('a\tb\n'), [['a', 'b']]);
  assert.deepEqual(parseClipboardTable('a\tb\n\nc\td'), [['a', 'b'], [''], ['c', 'd']]);
});

test('validateClipboardValue accepts exact and case-insensitive allowed values', () => {
  assert.deepEqual(validateClipboardValue('Explicit', ['Explicit', 'Derived']), { valid: true, value: 'Explicit' });
  assert.deepEqual(validateClipboardValue('derived', ['Explicit', 'Derived']), { valid: true, value: 'Derived' });
  assert.deepEqual(validateClipboardValue('other', ['Explicit', 'Derived']), { valid: false, value: 'other' });
  assert.deepEqual(validateClipboardValue('free text', null), { valid: true, value: 'free text' });
});

test('buildNextLocationRow applies editable values, type metadata and display name', () => {
  const row = {
    id: 'room',
    code: 'ROOM-1',
    name: 'Room 1',
    type: 'Lokaal',
    typeCode: 'room',
    sourcePage: 1,
    displayName: 'ROOM-1 - Room 1'
  };
  const typeRows = [
    row,
    { type: 'Project', typeCode: 'project' }
  ];

  const nextRow = buildNextLocationRow(row, {
    code: 'ROOM-2',
    name: 'Room 2',
    type: 'Project',
    sourcePage: '12',
    childCount: 'ignored'
  }, typeRows);

  assert.equal(nextRow.code, 'ROOM-2');
  assert.equal(nextRow.name, 'Room 2');
  assert.equal(nextRow.type, 'Project');
  assert.equal(nextRow.typeCode, 'project');
  assert.equal(nextRow.sourcePage, 12);
  assert.equal(nextRow.childCount, undefined);
  assert.equal(nextRow.displayName, 'ROOM-2 - Room 2');
});

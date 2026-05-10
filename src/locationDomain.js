export const LOCATION_TREE_ROW_HEIGHT = 42;

export const locationBaseColumns = [
  { field: 'code', label: 'Code', type: 'text', width: 155 },
  { field: 'name', label: 'Naam', type: 'text', width: 220 },
  { field: 'type', label: 'Type', type: 'text', width: 155 },
  { field: 'complexName', label: 'Complex', type: 'text', width: 230 },
  { field: 'parentName', label: 'Parent', type: 'text', width: 220 },
  { field: 'confidence', label: 'Confidence', type: 'text', width: 135 },
  { field: 'sourcePage', label: 'Bronpagina', type: 'number', width: 120 },
  { field: 'abbreviation', label: 'Afkorting', type: 'text', width: 120 },
  { field: 'childCount', label: 'Kinderen', type: 'number', width: 110 },
  { field: 'metadata', label: 'Metadata', type: 'jsonb', width: 260 }
];

export const confidenceLabels = {
  explicit: 'Explicit',
  derived: 'Derived',
  inferred: 'Inferred'
};

const editableLocationFields = new Set(['code', 'name', 'type', 'complexCode', 'complexName', 'abbreviation', 'source', 'sourcePage', 'sourceSection', 'confidence']);
const staticAllowedValuesByColumn = {
  status: ['explicit', 'derived', 'inferred'],
  confidence: ['explicit', 'derived', 'inferred']
};

export function defaultLocationColumns() {
  return locationBaseColumns.map((column, index) => ({
    ...column,
    visible: !['metadata', 'abbreviation'].includes(column.field),
    order: index,
    pin: column.field === 'code' ? 'left' : null
  }));
}

export function confidenceColor(confidence) {
  if (confidence === 'explicit') return 'success';
  if (confidence === 'inferred') return 'warning';
  return 'default';
}

export function matchesLocationQuery(row, quick, scopedColumns) {
  if (!quick) return true;
  const term = quick.toLowerCase();
  const fields = scopedColumns.length ? scopedColumns : ['code', 'name', 'type', 'complexName', 'complexCode', 'parentName', 'confidence', 'metadata'];
  return fields.some((field) => String(typeof row[field] === 'object' ? JSON.stringify(row[field]) : row[field] ?? '').toLowerCase().includes(term));
}

export function filterValueKey(value) {
  if (value == null || value === '') return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function displayFilterValue(value) {
  const key = filterValueKey(value);
  return key || '(leeg)';
}

export function getUniqueColumnValues(rows, field) {
  const values = new Map();
  rows.forEach((row) => {
    const key = filterValueKey(row[field]);
    const current = values.get(key) ?? { value: key, label: displayFilterValue(row[field]), count: 0 };
    current.count += 1;
    values.set(key, current);
  });
  return [...values.values()].sort((a, b) => a.label.localeCompare(b.label, 'nl-BE', { sensitivity: 'base', numeric: true }));
}

export function isEditableLocationField(field) {
  return editableLocationFields.has(field);
}

function allowedValuesFromUniqueRows(rows, field) {
  return getUniqueColumnValues(rows, field).map((item) => item.label);
}

export function getAllowedValuesForColumn(rows, field) {
  if (staticAllowedValuesByColumn[field]) return staticAllowedValuesByColumn[field];
  if (field === 'type') return allowedValuesFromUniqueRows(rows, field);
  return null;
}

export function getSelectableColumnValues(rows, field) {
  const allowedValues = getAllowedValuesForColumn(rows, field);
  if (!allowedValues) return getUniqueColumnValues(rows, field);

  return allowedValues
    .map((allowedValue) => {
      const value = filterValueKey(allowedValue);
      const count = rows.reduce((total, row) => total + (filterValueKey(row[field]) === value ? 1 : 0), 0);
      return { value, label: displayFilterValue(value), count };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'nl-BE', { sensitivity: 'base', numeric: true }));
}

export function validateClipboardValue(value, allowedValues) {
  if (!allowedValues) return { valid: true, value };
  const pastedValue = filterValueKey(value).trim();
  const exactMatch = allowedValues.find((allowedValue) => filterValueKey(allowedValue) === pastedValue);
  if (exactMatch != null) return { valid: true, value: filterValueKey(exactMatch) };

  const caseInsensitiveMatch = allowedValues.find((allowedValue) => filterValueKey(allowedValue).toLowerCase() === pastedValue.toLowerCase());
  if (caseInsensitiveMatch != null) return { valid: true, value: filterValueKey(caseInsensitiveMatch) };

  return { valid: false, value };
}

export function parseClipboardTable(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
    .map((line) => line.split('\t'));
}

export function locationCellKey(rowId, field) {
  return `${rowId ?? ''}::${field ?? ''}`;
}

export function matchesColumnValueFilters(row, filters) {
  return Object.entries(filters).every(([field, selectedValues]) => {
    if (!Array.isArray(selectedValues) || selectedValues.length === 0) return true;
    return selectedValues.includes(filterValueKey(row[field]));
  });
}

export function cloneFilterValues(filters) {
  return Object.fromEntries(Object.entries(filters).map(([field, values]) => [field, [...values]]));
}

function describeAgFilter(filter) {
  if (!filter) return '';
  if (filter.values) return filter.values.join(', ');
  if (filter.filter != null && filter.filterTo != null) return `${filter.type ?? 'between'} ${filter.filter} - ${filter.filterTo}`;
  if (filter.filter != null) return `${filter.type ?? 'is'} ${filter.filter}`;
  if (filter.condition1 || filter.condition2) {
    return [filter.condition1, filter.condition2].filter(Boolean).map(describeAgFilter).join(` ${filter.operator ?? 'AND'} `);
  }
  return filter.type ?? 'actief';
}

export function buildFilterChips(filterModel, columnLabels = {}) {
  const chips = [];
  Object.entries(filterModel.ag ?? {}).forEach(([field, filter]) => {
    chips.push({
      key: `ag-${field}`,
      label: `${columnLabels[field] ?? field}: ${describeAgFilter(filter)}`,
      tone: 'primary'
    });
  });
  if (filterModel.quick) {
    chips.push({ key: 'quick', label: `Quick: ${filterModel.quick}`, tone: 'default' });
  }
  if (filterModel.scopedColumns?.length) {
    chips.push({
      key: 'scope',
      label: `Zoekt in: ${filterModel.scopedColumns.map((field) => columnLabels[field] ?? field).join(', ')}`,
      tone: 'default'
    });
  }
  Object.entries(filterModel.valueFilters ?? {}).forEach(([field, values]) => {
    if (!values.length) return;
    chips.push({
      key: `value-${field}`,
      label: `${columnLabels[field] ?? field}: ${values.map(displayFilterValue).join(', ')}`,
      tone: 'secondary'
    });
  });
  return chips;
}

export function titleForFilterSet(filterModel, columnLabels) {
  const chips = buildFilterChips(filterModel, columnLabels);
  if (!chips.length) return 'Filterset: alle zichtbare rijen';
  return `Filterset: ${chips.slice(0, 3).map((chip) => chip.label).join(' · ')}${chips.length > 3 ? ' · ...' : ''}`;
}

function matchesTreeQuery(node, query) {
  if (!query) return true;
  const term = query.toLowerCase();
  return [node.name, node.code, node.type, node.typeName, node.complexName]
    .some((value) => String(value ?? '').toLowerCase().includes(term));
}

export function filterTreeNodes(nodes, query, confidenceFilter) {
  return nodes
    .map((node) => {
      const children = node.children ? filterTreeNodes(node.children, query, confidenceFilter) : [];
      const confidenceMatches = confidenceFilter === 'all' || node.confidence === confidenceFilter;
      const nodeMatches = matchesTreeQuery(node, query) && confidenceMatches;
      if (!nodeMatches && children.length === 0) return null;
      return { ...node, children: children.length ? children : undefined };
    })
    .filter(Boolean);
}

export function buildOpenState(nodes, expandAll = false, depth = 0, state = {}) {
  nodes.forEach((node) => {
    if (node.children?.length && (expandAll || depth < 2)) {
      state[node.id] = true;
      buildOpenState(node.children, expandAll, depth + 1, state);
    }
  });
  return state;
}

export function buildBreadcrumb(row, rows) {
  if (!row) return [];
  const byId = new Map(rows.map((item) => [item.id, item]));
  const trail = [];
  let current = row;
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    trail.unshift(current);
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return trail;
}

export function wouldCreateLocationCycle(rows, id, parentId) {
  if (!id || !parentId) return false;
  if (id === parentId) return true;
  const childrenByParent = rows.reduce((map, row) => {
    if (!row.parentId) return map;
    map.set(row.parentId, [...(map.get(row.parentId) ?? []), row.id]);
    return map;
  }, new Map());
  const stack = [...(childrenByParent.get(id) ?? [])];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (current === parentId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(childrenByParent.get(current) ?? []));
  }
  return false;
}

export function buildNextLocationRow(row, values, rows) {
  const nextRow = { ...row };
  Object.entries(values).forEach(([field, valueKey]) => {
    if (!isEditableLocationField(field)) return;
    const value = valueKey === '' ? null : valueKey;
    nextRow[field] = value;

    if (field === 'type') {
      const matchingType = rows.find((item) => filterValueKey(item.type) === valueKey);
      nextRow.typeCode = matchingType?.typeCode ?? row.typeCode;
      nextRow.type = matchingType?.type ?? value;
    }

    if (field === 'sourcePage') {
      nextRow.sourcePage = valueKey === '' ? null : Number(valueKey);
    }
  });
  nextRow.displayName = `${nextRow.code} - ${nextRow.name}`;
  return nextRow;
}

export function shortTypeLabel(typeName, type) {
  const value = typeName ?? type;
  const labels = {
    Project: 'Project',
    Stuwsluiscomplex: 'Complex',
    Installatiezone: 'Zone',
    Gebouw: 'Gebouw',
    Lokaal: 'Lokaal',
    'Technische ruimte': 'Tech.',
    Oever: 'Oever',
    Constructiedeel: 'Deel',
    Kabelroute: 'Kabel',
    Uitrustingszone: 'Uitrusting'
  };
  return labels[value] ?? value;
}

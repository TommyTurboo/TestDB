const MAX_DRAFT_COLUMNS = 80;
const BUILDER_EDIT_TYPES = Object.freeze({
  READONLY: 'readonly',
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date'
});
const SUPPORTED_EDIT_TYPES = new Set(Object.values(BUILDER_EDIT_TYPES));

function fieldError(message, fieldErrors = {}) {
  const error = new Error(message);
  error.statusCode = 400;
  error.fieldErrors = fieldErrors;
  return error;
}

function findCatalogTable(catalog, name) {
  return catalog?.tables?.find((table) => table.name === name);
}

function normalizeColumnInput(column) {
  if (typeof column === 'string') return { name: column };
  return {
    name: String(column?.name ?? column?.field ?? ''),
    label: column?.label,
    description: column?.description,
    visible: column?.visible,
    order: column?.order,
    pin: column?.pin,
    width: column?.width,
    editType: column?.editType,
    required: column?.required,
    min: column?.min,
    max: column?.max
  };
}

export function editTypeFitsColumn(editType, columnType) {
  if (editType === BUILDER_EDIT_TYPES.READONLY) return true;
  if (editType === BUILDER_EDIT_TYPES.TEXT) return ['text', 'long_text', 'markdown', 'uuid'].includes(columnType);
  if (editType === BUILDER_EDIT_TYPES.NUMBER) return columnType === 'number';
  if (editType === BUILDER_EDIT_TYPES.DATE) return ['date', 'datetime'].includes(columnType);
  return false;
}

function mapDraftRow(row) {
  return {
    id: row.id,
    name: row.name,
    rootTable: row.root_table,
    columns: row.columns ?? [],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function normalizeTableViewDraft(input, catalog) {
  const name = String(input?.name ?? '').trim();
  const rootTableName = String(input?.rootTable ?? input?.root_table ?? '').trim();
  const rootTable = findCatalogTable(catalog, rootTableName);
  const fieldErrors = {};

  if (!name) fieldErrors.name = 'Naam is verplicht.';
  if (!rootTableName) {
    fieldErrors.rootTable = 'Root table is verplicht.';
  } else if (!rootTable) {
    fieldErrors.rootTable = `Onbekende root table: ${rootTableName}.`;
  }

  const requestedColumns = Array.isArray(input?.columns) ? input.columns.map(normalizeColumnInput) : [];
  if (requestedColumns.length === 0) {
    fieldErrors.columns = 'Selecteer minstens een kolom.';
  }
  if (requestedColumns.length > MAX_DRAFT_COLUMNS) {
    fieldErrors.columns = `Selecteer maximaal ${MAX_DRAFT_COLUMNS} kolommen.`;
  }

  const catalogColumns = new Map((rootTable?.columns ?? []).map((column) => [column.name, column]));
  const seenColumns = new Set();
  const seenVisibleLabels = new Set();
  const columns = [];
  requestedColumns
    .sort((a, b) => {
      const aOrder = Number.isFinite(Number(a.order)) ? Number(a.order) : requestedColumns.indexOf(a);
      const bOrder = Number.isFinite(Number(b.order)) ? Number(b.order) : requestedColumns.indexOf(b);
      return aOrder - bOrder;
    })
    .forEach((column, order) => {
    if (!column.name || !catalogColumns.has(column.name)) {
      fieldErrors.columns = `Onbekende kolom voor ${rootTableName}: ${column.name || '(leeg)'}.`;
      return;
    }
    if (seenColumns.has(column.name)) {
      fieldErrors.columns = `Dubbele kolom geselecteerd: ${column.name}.`;
      return;
    }
    seenColumns.add(column.name);
    const catalogColumn = catalogColumns.get(column.name);
    const label = String(column.label ?? catalogColumn.label).trim();
    const visible = column.visible !== false;
    const normalizedLabel = label.toLowerCase();
    if (!label) {
      fieldErrors.labels = `Label is verplicht voor kolom ${column.name}.`;
      return;
    }
    if (visible && seenVisibleLabels.has(normalizedLabel)) {
      fieldErrors.labels = `Dubbel zichtbaar label: ${label}.`;
      return;
    }
    if (visible) seenVisibleLabels.add(normalizedLabel);
    const editType = String(column.editType ?? BUILDER_EDIT_TYPES.READONLY);
    if (!SUPPORTED_EDIT_TYPES.has(editType)) {
      fieldErrors.editType = `Onbekend edit type voor ${column.name}: ${editType}.`;
      return;
    }
    if (!editTypeFitsColumn(editType, catalogColumn.type)) {
      fieldErrors.editType = `${label} kan niet als ${editType} bewerkt worden op database type ${catalogColumn.type}.`;
      return;
    }
    const min = column.min === '' || column.min == null ? null : Number(column.min);
    const max = column.max === '' || column.max == null ? null : Number(column.max);
    if ((min != null && !Number.isFinite(min)) || (max != null && !Number.isFinite(max))) {
      fieldErrors.validation = `Min/max voor ${label} moeten numeriek zijn.`;
      return;
    }
    if (min != null && max != null && min > max) {
      fieldErrors.validation = `Min mag niet groter zijn dan max voor ${label}.`;
      return;
    }
    columns.push({
      name: catalogColumn.name,
      label,
      description: String(column.description ?? '').trim(),
      type: catalogColumn.type,
      nullable: catalogColumn.nullable,
      visible,
      order,
      pin: ['left', 'right'].includes(column.pin) ? column.pin : null,
      width: Number.isFinite(Number(column.width)) ? Math.max(80, Math.min(Number(column.width), 640)) : null,
      editType,
      editable: editType !== BUILDER_EDIT_TYPES.READONLY,
      required: column.required === true,
      min,
      max
    });
  });

  if (Object.keys(fieldErrors).length > 0) {
    throw fieldError('Table view draft is ongeldig.', fieldErrors);
  }

  return {
    name,
    rootTable: rootTable.name,
    columns,
    status: 'draft'
  };
}

export async function ensureTableViewDraftsTable(query) {
  await query(`
    CREATE TABLE IF NOT EXISTS table_view_drafts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      root_table TEXT NOT NULL,
      columns JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT table_view_drafts_status_check
        CHECK (status IN ('draft'))
    )
  `);
}

export async function listTableViewDrafts(query) {
  await ensureTableViewDraftsTable(query);
  const result = await query(`
    SELECT id, name, root_table, columns, status, created_at, updated_at
    FROM table_view_drafts
    ORDER BY updated_at DESC, name ASC
  `);
  return { drafts: result.rows.map(mapDraftRow), timing: { draftsMs: result.durationMs } };
}

export async function getTableViewDraft(query, id) {
  await ensureTableViewDraftsTable(query);
  const result = await query(
    `SELECT id, name, root_table, columns, status, created_at, updated_at
     FROM table_view_drafts
     WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) {
    const error = new Error('Table view draft niet gevonden.');
    error.statusCode = 404;
    throw error;
  }
  return { draft: mapDraftRow(result.rows[0]), timing: { draftMs: result.durationMs } };
}

export async function createTableViewDraft(query, input, catalog) {
  await ensureTableViewDraftsTable(query);
  const draft = normalizeTableViewDraft(input, catalog);
  const result = await query(
    `INSERT INTO table_view_drafts (name, root_table, columns, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, root_table, columns, status, created_at, updated_at`,
    [draft.name, draft.rootTable, JSON.stringify(draft.columns), draft.status]
  );
  return { draft: mapDraftRow(result.rows[0]) };
}

export async function updateTableViewDraft(query, id, input, catalog) {
  await ensureTableViewDraftsTable(query);
  const draft = normalizeTableViewDraft(input, catalog);
  const result = await query(
    `UPDATE table_view_drafts
     SET name = $1, root_table = $2, columns = $3, status = $4, updated_at = now()
     WHERE id = $5
     RETURNING id, name, root_table, columns, status, created_at, updated_at`,
    [draft.name, draft.rootTable, JSON.stringify(draft.columns), draft.status, id]
  );
  if (result.rows.length === 0) {
    const error = new Error('Table view draft niet gevonden.');
    error.statusCode = 404;
    throw error;
  }
  return { draft: mapDraftRow(result.rows[0]) };
}

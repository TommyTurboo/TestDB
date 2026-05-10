export const EDIT_TYPES = Object.freeze({
  READONLY: 'readonly',
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  BOOLEAN: 'boolean',
  SINGLE_SELECT: 'singleSelect',
  RELATION_SELECT: 'relationSelect'
});

export const locationTableConfig = {
  table: 'locations',
  label: 'Locaties',
  saveMode: 'cellSave',
  audit: { enabled: true },
  columns: [
    { field: 'code', label: 'Code', type: 'text', width: 155, visible: true, pin: 'left', editType: EDIT_TYPES.TEXT, required: true, audit: true, description: 'Unieke locatiecode.' },
    { field: 'name', label: 'Naam', type: 'text', width: 220, visible: true, editType: EDIT_TYPES.TEXT, required: true, audit: true, description: 'Leesbare locatienaam.' },
    {
      field: 'type',
      label: 'Type',
      type: 'text',
      width: 155,
      visible: true,
      editType: EDIT_TYPES.RELATION_SELECT,
      relation: { source: 'location_type', valueField: 'name', labelField: 'name' },
      audit: true,
      description: 'Locatietype uit de location_type referentietabel.'
    },
    { field: 'complexName', label: 'Complex', type: 'text', width: 230, visible: true, editType: EDIT_TYPES.TEXT, audit: true, description: 'Naam van het bovenliggende complex.' },
    { field: 'parentName', label: 'Parent', type: 'text', width: 220, visible: true, editType: EDIT_TYPES.READONLY, readOnlyReason: 'Wijzig de parent via de locatieboom.', description: 'Bovenliggende locatie.' },
    {
      field: 'confidence',
      label: 'Confidence',
      type: 'text',
      width: 135,
      visible: true,
      editType: EDIT_TYPES.SINGLE_SELECT,
      options: ['explicit', 'derived', 'inferred'],
      required: true,
      audit: true,
      description: 'Betrouwbaarheid van de locatieherkomst.'
    },
    { field: 'sourcePage', label: 'Bronpagina', type: 'number', width: 120, visible: true, editType: EDIT_TYPES.NUMBER, min: 0, audit: true, description: 'Pagina in het brondocument.' },
    { field: 'abbreviation', label: 'Afkorting', type: 'text', width: 120, visible: false, editType: EDIT_TYPES.TEXT, audit: true, description: 'Korte naam of afkorting.' },
    { field: 'childCount', label: 'Kinderen', type: 'number', width: 110, visible: true, editType: EDIT_TYPES.READONLY, readOnlyReason: 'Wordt afgeleid uit de locatieboom.', description: 'Aantal onderliggende locaties.' },
    { field: 'metadata', label: 'Metadata', type: 'jsonb', width: 260, visible: false, editType: EDIT_TYPES.READONLY, readOnlyReason: 'Metadata wordt niet inline bewerkt.', description: 'Ruwe metadata.' },
    { field: 'complexCode', label: 'Complexcode', type: 'text', width: 150, visible: false, editType: EDIT_TYPES.TEXT, audit: true, description: 'Code van het bovenliggende complex.' },
    { field: 'source', label: 'Bron', type: 'text', width: 180, visible: false, editType: EDIT_TYPES.TEXT, audit: true, description: 'Naam of type bron.' },
    { field: 'sourceSection', label: 'Bronsectie', type: 'text', width: 150, visible: false, editType: EDIT_TYPES.TEXT, audit: true, description: 'Sectie in de bron.' },
    {
      field: 'parentId',
      label: 'Parent id',
      type: 'text',
      width: 180,
      visible: false,
      editType: EDIT_TYPES.RELATION_SELECT,
      relation: { source: 'location', valueField: 'id', labelField: 'displayName' },
      audit: true,
      description: 'Technische parentreferentie.'
    }
  ]
};

export const planningTasksTableConfig = {
  table: 'planning_tasks',
  label: 'Planning tasks',
  saveMode: 'cellSave',
  audit: { enabled: true },
  columns: [
    { field: 'id', label: 'ID', editType: EDIT_TYPES.READONLY, readOnlyReason: 'Technische sleutel.' },
    { field: 'code', label: 'Code', editType: EDIT_TYPES.TEXT, required: true, audit: true },
    { field: 'name', label: 'Name', editType: EDIT_TYPES.TEXT, required: true, audit: true },
    { field: 'task_kind', label: 'Kind', editType: EDIT_TYPES.SINGLE_SELECT, options: ['task', 'milestone'], required: true, audit: true },
    { field: 'status', label: 'Status', editType: EDIT_TYPES.SINGLE_SELECT, options: ['not_started', 'in_progress', 'complete', 'blocked'], required: true, audit: true },
    { field: 'progress', label: 'Progress', editType: EDIT_TYPES.NUMBER, min: 0, max: 100, audit: true },
    { field: 'start_date', label: 'Start', editType: EDIT_TYPES.DATE, required: true, audit: true },
    { field: 'end_date', label: 'End', editType: EDIT_TYPES.DATE, required: true, audit: true },
    { field: 'work_package_code', label: 'Work package', editType: EDIT_TYPES.RELATION_SELECT, relation: { source: 'work_packages', valueField: 'id', labelField: 'code' } },
    { field: 'location_code', label: 'Location', editType: EDIT_TYPES.RELATION_SELECT, relation: { source: 'location', valueField: 'id', labelField: 'code' } },
    { field: 'constraint_type', label: 'Constraint', editType: EDIT_TYPES.SINGLE_SELECT, options: ['none', 'start_no_earlier_than', 'finish_no_later_than', 'must_start_on', 'must_finish_on'], audit: true },
    { field: 'constraint_date', label: 'Constraint date', editType: EDIT_TYPES.DATE, audit: true },
    { field: 'notes', label: 'Notes', editType: EDIT_TYPES.TEXT, audit: true }
  ]
};

export const tableInteractionConfigs = {
  locations: locationTableConfig,
  planning_tasks: planningTasksTableConfig
};

const allowedEditTypes = new Set(Object.values(EDIT_TYPES));

export function normalizeTableConfig(config) {
  if (!config?.table) throw new Error('Table config requires a table id');
  if (!Array.isArray(config.columns) || config.columns.length === 0) throw new Error(`Table config ${config.table} requires columns`);

  const seen = new Set();
  return {
    ...config,
    saveMode: config.saveMode ?? 'cellSave',
    columns: config.columns.map((column, order) => {
      if (!column?.field) throw new Error(`Table config ${config.table} has a column without field`);
      if (seen.has(column.field)) throw new Error(`Duplicate column config: ${config.table}.${column.field}`);
      seen.add(column.field);
      const editType = column.editType ?? EDIT_TYPES.READONLY;
      if (!allowedEditTypes.has(editType)) throw new Error(`Unknown edit type for ${config.table}.${column.field}: ${editType}`);
      return {
        ...column,
        order: column.order ?? order,
        visible: column.visible ?? true,
        editType,
        editable: editType !== EDIT_TYPES.READONLY
      };
    })
  };
}

export function getTableInteractionConfig(table) {
  const config = tableInteractionConfigs[table];
  if (!config) return null;
  return normalizeTableConfig(config);
}

export function getColumnInteraction(config, field) {
  return config?.columns?.find((column) => column.field === field) ?? null;
}

export function isColumnEditable(config, field, row = null, user = null) {
  const column = getColumnInteraction(config, field);
  if (!column || column.editType === EDIT_TYPES.READONLY) {
    return { editable: false, reason: column?.readOnlyReason ?? 'Deze kolom is alleen-lezen.' };
  }
  if (column.permissionKey && user?.permissions && !user.permissions.includes(column.permissionKey)) {
    return { editable: false, reason: 'Je hebt geen rechten om deze kolom te wijzigen.' };
  }
  return { editable: true, reason: '' };
}

export function coerceCellValue(column, value) {
  if (value === '') return null;
  if (value == null) return null;
  if (column.editType === EDIT_TYPES.NUMBER) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  }
  if (column.editType === EDIT_TYPES.BOOLEAN) {
    if (typeof value === 'boolean') return value;
    if (String(value).toLowerCase() === 'true') return true;
    if (String(value).toLowerCase() === 'false') return false;
    return value;
  }
  if (column.editType === EDIT_TYPES.DATE) {
    return String(value).slice(0, 10);
  }
  return String(value);
}

export function validateCellValue(config, field, value) {
  const column = getColumnInteraction(config, field);
  if (!column) return { valid: false, field, message: `Onbekende kolom: ${field}` };
  const editability = isColumnEditable(config, field);
  if (!editability.editable) return { valid: false, field, message: editability.reason };

  const coerced = coerceCellValue(column, value);
  if (column.required && (coerced == null || String(coerced).trim() === '')) {
    return { valid: false, field, message: `${column.label ?? field} is verplicht.` };
  }
  if (coerced == null) return { valid: true, field, value: coerced };
  if (column.editType === EDIT_TYPES.NUMBER && typeof coerced !== 'number') {
    return { valid: false, field, message: `${column.label ?? field} moet een nummer zijn.` };
  }
  if (column.editType === EDIT_TYPES.NUMBER && column.min != null && coerced < column.min) {
    return { valid: false, field, message: `${column.label ?? field} moet minstens ${column.min} zijn.` };
  }
  if (column.editType === EDIT_TYPES.NUMBER && column.max != null && coerced > column.max) {
    return { valid: false, field, message: `${column.label ?? field} mag maximaal ${column.max} zijn.` };
  }
  if (column.editType === EDIT_TYPES.DATE && Number.isNaN(Date.parse(coerced))) {
    return { valid: false, field, message: `${column.label ?? field} moet een geldige datum zijn.` };
  }
  if (column.editType === EDIT_TYPES.SINGLE_SELECT && column.options && !column.options.includes(coerced)) {
    return { valid: false, field, message: `${column.label ?? field} moet een toegestane waarde zijn.` };
  }
  return { valid: true, field, value: coerced };
}

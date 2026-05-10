import { getTableInteractionConfig } from '../src/tableConfig.js';

function withInteractionColumns(table, columns) {
  const interaction = getTableInteractionConfig(table);
  if (!interaction) return columns;
  return columns.map((column) => {
    const configured = interaction.columns.find((item) => item.field === column.field);
    return configured ? { ...column, ...configured, label: configured.label ?? column.label, width: column.width ?? configured.width } : column;
  });
}

export const tableConfigs = {
  time_entries: {
    label: 'Time entries',
    defaultSort: { field: 'work_date', direction: 'desc' },
    from: `
      time_entries te
      JOIN customers c ON c.id = te.customer_id
      JOIN projects p ON p.id = te.project_id
      JOIN tickets t ON t.id = te.ticket_id
    `,
    columns: withInteractionColumns('time_entries', [
      { field: 'id', label: 'ID', type: 'number', expression: 'te.id', width: 92, pinned: 'left' },
      { field: 'work_date', label: 'Work date', type: 'date', expression: 'te.work_date', width: 132 },
      { field: 'customer_name', label: 'Customer', type: 'text', expression: 'c.name', width: 220 },
      { field: 'project_code', label: 'Project', type: 'text', expression: 'p.code', width: 132 },
      { field: 'ticket_key', label: 'Ticket', type: 'text', expression: 't.ticket_key', width: 128 },
      { field: 'consultant', label: 'Consultant', type: 'text', expression: 'te.consultant', width: 150 },
      { field: 'role', label: 'Role', type: 'text', expression: 'te.role', width: 160 },
      { field: 'hours', label: 'Hours', type: 'number', expression: 'te.hours', width: 112 },
      { field: 'billable', label: 'Billable', type: 'boolean', expression: 'te.billable', width: 118 },
      { field: 'hourly_rate', label: 'Rate', type: 'number', expression: 'te.hourly_rate', width: 112 },
      { field: 'note', label: 'Note', type: 'long_text', expression: 'te.note', width: 360 },
      { field: 'attributes', label: 'JSONB attributes', type: 'jsonb', expression: 'te.attributes', width: 260 },
      { field: 'ticket_status', label: 'Ticket status', type: 'text', expression: 't.status', width: 150 },
      { field: 'priority', label: 'Priority', type: 'text', expression: 't.priority', width: 130 }
    ]),
    select: `
      te.id,
      te.work_date,
      c.name AS customer_name,
      p.code AS project_code,
      t.ticket_key,
      te.consultant,
      te.role,
      te.hours,
      te.billable,
      te.hourly_rate,
      te.note,
      te.attributes,
      t.status AS ticket_status,
      t.priority
    `
  },
  documents: {
    label: 'Documents',
    defaultSort: { field: 'created_at', direction: 'desc' },
    from: 'documents d JOIN projects p ON p.id = d.project_id JOIN customers c ON c.id = p.customer_id',
    columns: withInteractionColumns('documents', [
      { field: 'id', label: 'ID', type: 'number', expression: 'd.id', width: 90, pinned: 'left' },
      { field: 'title', label: 'Title', type: 'text', expression: 'd.title', width: 280 },
      { field: 'doc_type', label: 'Type', type: 'text', expression: 'd.doc_type', width: 150 },
      { field: 'project_code', label: 'Project', type: 'text', expression: 'p.code', width: 132 },
      { field: 'customer_name', label: 'Customer', type: 'text', expression: 'c.name', width: 220 },
      { field: 'markdown_body', label: 'Markdown body', type: 'markdown', expression: 'd.markdown_body', width: 500 },
      { field: 'properties', label: 'JSONB properties', type: 'jsonb', expression: 'd.properties', width: 260 },
      { field: 'created_at', label: 'Created', type: 'datetime', expression: 'd.created_at', width: 180 }
    ]),
    select: `
      d.id,
      d.title,
      d.doc_type,
      p.code AS project_code,
      c.name AS customer_name,
      d.markdown_body,
      d.properties,
      d.created_at
    `
  },
  planning_tasks: {
    label: 'Planning tasks',
    defaultSort: { field: 'start_date', direction: 'asc' },
    from: `
      planning_tasks pt
      JOIN projects p ON p.id = pt.project_id
      LEFT JOIN work_packages wp ON wp.id = pt.work_package_id
      LEFT JOIN location l ON l.id = pt.location_id
    `,
    columns: withInteractionColumns('planning_tasks', [
      { field: 'id', label: 'ID', type: 'number', expression: 'pt.id', width: 90, pinned: 'left' },
      { field: 'code', label: 'Code', type: 'text', expression: 'pt.code', width: 140, pinned: 'left' },
      { field: 'wbs_code', label: 'WBS', type: 'text', expression: 'pt.wbs_code', width: 100 },
      { field: 'name', label: 'Name', type: 'text', expression: 'pt.name', width: 260 },
      { field: 'task_kind', label: 'Kind', type: 'text', expression: 'pt.task_kind', width: 120 },
      { field: 'status', label: 'Status', type: 'text', expression: 'pt.status', width: 130 },
      { field: 'progress', label: 'Progress', type: 'number', expression: 'pt.progress', width: 120 },
      { field: 'start_date', label: 'Start', type: 'date', expression: 'pt.start_date', width: 120 },
      { field: 'end_date', label: 'End', type: 'date', expression: 'pt.end_date', width: 120 },
      { field: 'discipline', label: 'Discipline', type: 'text', expression: 'pt.discipline', width: 160 },
      { field: 'work_package_code', label: 'Work package', type: 'text', expression: 'wp.code', width: 160 },
      { field: 'work_package_name', label: 'Work package name', type: 'text', expression: 'wp.name', width: 240 },
      { field: 'project_code', label: 'Project', type: 'text', expression: 'p.code', width: 130 },
      { field: 'location_code', label: 'Location', type: 'text', expression: 'l.code', width: 180 },
      { field: 'constraint_type', label: 'Constraint', type: 'text', expression: 'pt.constraint_type', width: 180 },
      { field: 'constraint_date', label: 'Constraint date', type: 'date', expression: 'pt.constraint_date', width: 150 },
      { field: 'notes', label: 'Notes', type: 'long_text', expression: 'pt.notes', width: 320 },
      { field: 'metadata', label: 'Metadata', type: 'jsonb', expression: 'pt.metadata', width: 260 }
    ]),
    select: `
      pt.id,
      pt.code,
      pt.wbs_code,
      pt.name,
      pt.task_kind,
      pt.status,
      pt.progress,
      pt.start_date,
      pt.end_date,
      pt.discipline,
      wp.code AS work_package_code,
      wp.name AS work_package_name,
      p.code AS project_code,
      l.code AS location_code,
      pt.constraint_type,
      pt.constraint_date,
      pt.notes,
      pt.metadata
    `
  },
  planning_dependencies: {
    label: 'Planning dependencies',
    defaultSort: { field: 'predecessor_code', direction: 'asc' },
    from: `
      planning_dependencies pd
      JOIN planning_tasks predecessor ON predecessor.id = pd.predecessor_id
      JOIN planning_tasks successor ON successor.id = pd.successor_id
    `,
    columns: withInteractionColumns('planning_dependencies', [
      { field: 'id', label: 'ID', type: 'number', expression: 'pd.id', width: 90, pinned: 'left' },
      { field: 'predecessor_code', label: 'Predecessor', type: 'text', expression: 'predecessor.code', width: 160 },
      { field: 'predecessor_name', label: 'Predecessor name', type: 'text', expression: 'predecessor.name', width: 260 },
      { field: 'successor_code', label: 'Successor', type: 'text', expression: 'successor.code', width: 160 },
      { field: 'successor_name', label: 'Successor name', type: 'text', expression: 'successor.name', width: 260 },
      { field: 'dependency_type', label: 'Type', type: 'text', expression: 'pd.dependency_type', width: 100 },
      { field: 'lag_days', label: 'Lag days', type: 'number', expression: 'pd.lag_days', width: 120 },
      { field: 'metadata', label: 'Metadata', type: 'jsonb', expression: 'pd.metadata', width: 240 }
    ]),
    select: `
      pd.id,
      predecessor.code AS predecessor_code,
      predecessor.name AS predecessor_name,
      successor.code AS successor_code,
      successor.name AS successor_name,
      pd.dependency_type,
      pd.lag_days,
      pd.metadata
    `
  },
  work_packages: {
    label: 'Work packages',
    defaultSort: { field: 'sort_order', direction: 'asc' },
    from: 'work_packages wp JOIN projects p ON p.id = wp.project_id LEFT JOIN work_packages parent ON parent.id = wp.parent_id',
    columns: withInteractionColumns('work_packages', [
      { field: 'id', label: 'ID', type: 'number', expression: 'wp.id', width: 90, pinned: 'left' },
      { field: 'code', label: 'Code', type: 'text', expression: 'wp.code', width: 140 },
      { field: 'name', label: 'Name', type: 'text', expression: 'wp.name', width: 260 },
      { field: 'discipline', label: 'Discipline', type: 'text', expression: 'wp.discipline', width: 160 },
      { field: 'parent_code', label: 'Parent', type: 'text', expression: 'parent.code', width: 140 },
      { field: 'project_code', label: 'Project', type: 'text', expression: 'p.code', width: 140 },
      { field: 'sort_order', label: 'Sort', type: 'number', expression: 'wp.sort_order', width: 100 },
      { field: 'metadata', label: 'Metadata', type: 'jsonb', expression: 'wp.metadata', width: 260 }
    ]),
    select: `
      wp.id,
      wp.code,
      wp.name,
      wp.discipline,
      parent.code AS parent_code,
      p.code AS project_code,
      wp.sort_order,
      wp.metadata
    `
  },
  planning_resources: {
    label: 'Planning resources',
    defaultSort: { field: 'code', direction: 'asc' },
    from: 'planning_resources pr',
    columns: withInteractionColumns('planning_resources', [
      { field: 'id', label: 'ID', type: 'number', expression: 'pr.id', width: 90, pinned: 'left' },
      { field: 'code', label: 'Code', type: 'text', expression: 'pr.code', width: 160 },
      { field: 'name', label: 'Name', type: 'text', expression: 'pr.name', width: 260 },
      { field: 'resource_type', label: 'Type', type: 'text', expression: 'pr.resource_type', width: 140 },
      { field: 'discipline', label: 'Discipline', type: 'text', expression: 'pr.discipline', width: 160 },
      { field: 'capacity_hours_per_day', label: 'Capacity/day', type: 'number', expression: 'pr.capacity_hours_per_day', width: 150 },
      { field: 'calendar', label: 'Calendar', type: 'jsonb', expression: 'pr.calendar', width: 260 }
    ]),
    select: `
      pr.id,
      pr.code,
      pr.name,
      pr.resource_type,
      pr.discipline,
      pr.capacity_hours_per_day,
      pr.calendar
    `
  },
  planning_equipment: {
    label: 'Planning equipment',
    defaultSort: { field: 'code', direction: 'asc' },
    from: 'planning_equipment pe',
    columns: withInteractionColumns('planning_equipment', [
      { field: 'id', label: 'ID', type: 'number', expression: 'pe.id', width: 90, pinned: 'left' },
      { field: 'code', label: 'Code', type: 'text', expression: 'pe.code', width: 160 },
      { field: 'name', label: 'Name', type: 'text', expression: 'pe.name', width: 260 },
      { field: 'equipment_type', label: 'Type', type: 'text', expression: 'pe.equipment_type', width: 180 },
      { field: 'status', label: 'Status', type: 'text', expression: 'pe.status', width: 140 },
      { field: 'metadata', label: 'Metadata', type: 'jsonb', expression: 'pe.metadata', width: 260 }
    ]),
    select: `
      pe.id,
      pe.code,
      pe.name,
      pe.equipment_type,
      pe.status,
      pe.metadata
    `
  },
  planning_task_resources: {
    label: 'Task resources',
    defaultSort: { field: 'task_code', direction: 'asc' },
    from: `
      planning_task_resources ptr
      JOIN planning_tasks pt ON pt.id = ptr.task_id
      JOIN planning_resources pr ON pr.id = ptr.resource_id
    `,
    columns: withInteractionColumns('planning_task_resources', [
      { field: 'task_code', label: 'Task', type: 'text', expression: 'pt.code', width: 150, pinned: 'left' },
      { field: 'task_name', label: 'Task name', type: 'text', expression: 'pt.name', width: 260 },
      { field: 'resource_code', label: 'Resource', type: 'text', expression: 'pr.code', width: 170 },
      { field: 'resource_name', label: 'Resource name', type: 'text', expression: 'pr.name', width: 260 },
      { field: 'allocation_percent', label: 'Allocation', type: 'number', expression: 'ptr.allocation_percent', width: 130 },
      { field: 'role_on_task', label: 'Role', type: 'text', expression: 'ptr.role_on_task', width: 170 }
    ]),
    select: `
      pt.code AS task_code,
      pt.name AS task_name,
      pr.code AS resource_code,
      pr.name AS resource_name,
      ptr.allocation_percent,
      ptr.role_on_task
    `
  },
  planning_task_equipment: {
    label: 'Task equipment',
    defaultSort: { field: 'task_code', direction: 'asc' },
    from: `
      planning_task_equipment pte
      JOIN planning_tasks pt ON pt.id = pte.task_id
      JOIN planning_equipment pe ON pe.id = pte.equipment_id
    `,
    columns: withInteractionColumns('planning_task_equipment', [
      { field: 'task_code', label: 'Task', type: 'text', expression: 'pt.code', width: 150, pinned: 'left' },
      { field: 'task_name', label: 'Task name', type: 'text', expression: 'pt.name', width: 260 },
      { field: 'equipment_code', label: 'Equipment', type: 'text', expression: 'pe.code', width: 170 },
      { field: 'equipment_name', label: 'Equipment name', type: 'text', expression: 'pe.name', width: 260 },
      { field: 'usage_note', label: 'Usage note', type: 'long_text', expression: 'pte.usage_note', width: 320 }
    ]),
    select: `
      pt.code AS task_code,
      pt.name AS task_name,
      pe.code AS equipment_code,
      pe.name AS equipment_name,
      pte.usage_note
    `
  },
  planning_task_documents: {
    label: 'Task documents',
    defaultSort: { field: 'task_code', direction: 'asc' },
    from: `
      planning_task_documents ptd
      JOIN planning_tasks pt ON pt.id = ptd.task_id
      JOIN documents d ON d.id = ptd.document_id
    `,
    columns: withInteractionColumns('planning_task_documents', [
      { field: 'task_code', label: 'Task', type: 'text', expression: 'pt.code', width: 150, pinned: 'left' },
      { field: 'task_name', label: 'Task name', type: 'text', expression: 'pt.name', width: 260 },
      { field: 'document_title', label: 'Document', type: 'text', expression: 'd.title', width: 300 },
      { field: 'doc_type', label: 'Doc type', type: 'text', expression: 'd.doc_type', width: 140 },
      { field: 'link_type', label: 'Link type', type: 'text', expression: 'ptd.link_type', width: 160 }
    ]),
    select: `
      pt.code AS task_code,
      pt.name AS task_name,
      d.title AS document_title,
      d.doc_type,
      ptd.link_type
    `
  }
};

export function getTableConfig(table) {
  const config = tableConfigs[table];
  if (!config) {
    const error = new Error(`Unknown table: ${table}`);
    error.statusCode = 404;
    throw error;
  }
  return config;
}

export function getColumn(config, field) {
  return config.columns.find((column) => column.field === field);
}

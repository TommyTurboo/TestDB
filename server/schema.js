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
    columns: [
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
    ],
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
    columns: [
      { field: 'id', label: 'ID', type: 'number', expression: 'd.id', width: 90, pinned: 'left' },
      { field: 'title', label: 'Title', type: 'text', expression: 'd.title', width: 280 },
      { field: 'doc_type', label: 'Type', type: 'text', expression: 'd.doc_type', width: 150 },
      { field: 'project_code', label: 'Project', type: 'text', expression: 'p.code', width: 132 },
      { field: 'customer_name', label: 'Customer', type: 'text', expression: 'c.name', width: 220 },
      { field: 'markdown_body', label: 'Markdown body', type: 'markdown', expression: 'd.markdown_body', width: 500 },
      { field: 'properties', label: 'JSONB properties', type: 'jsonb', expression: 'd.properties', width: 260 },
      { field: 'created_at', label: 'Created', type: 'datetime', expression: 'd.created_at', width: 180 }
    ],
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

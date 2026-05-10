import http from 'node:http';
import { URL } from 'node:url';
import { query } from './db.js';
import { getColumn, getTableConfig, tableConfigs } from './schema.js';
import { loadSchemaCatalog } from './schemaCatalog.js';
import {
  createTableViewDraft,
  getTableViewDraft,
  listTableViewDrafts,
  updateTableViewDraft
} from './tableViewDrafts.js';
import {
  EDIT_TYPES,
  getTableInteractionConfig,
  validateCellValue
} from '../src/tableConfig.js';

const PORT = Number(process.env.PORT ?? 4174);
const MAX_LIMIT = 100000;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        const error = new Error('Invalid JSON body');
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function parseJsonParam(url, name, fallback) {
  const value = url.searchParams.get(name);
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildWhere(config, url) {
  const params = [];
  const clauses = [];
  const quick = url.searchParams.get('q')?.trim();
  const scoped = parseJsonParam(url, 'scoped', []);

  if (quick) {
    const searchable = (Array.isArray(scoped) && scoped.length > 0 ? scoped : config.columns.map((column) => column.field))
      .map((field) => getColumn(config, field))
      .filter((column) => column && ['text', 'long_text', 'markdown', 'jsonb'].includes(column.type));

    if (searchable.length > 0) {
      params.push(`%${quick}%`);
      const index = params.length;
      clauses.push(`(${searchable.map((column) => `${column.expression}::text ILIKE $${index}`).join(' OR ')})`);
    }
  }

  const facets = parseJsonParam(url, 'facets', {});
  Object.entries(facets ?? {}).forEach(([field, values]) => {
    const column = getColumn(config, field);
    if (!column || !Array.isArray(values) || values.length === 0) return;
    params.push(values);
    clauses.push(`${column.expression}::text = ANY($${params.length})`);
  });

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

function buildOrder(config, sort) {
  const requested = Array.isArray(sort) && sort.length > 0 ? sort[0] : config.defaultSort;
  const column = getColumn(config, requested.field) ?? getColumn(config, config.defaultSort.field);
  const direction = String(requested.direction ?? requested.sort ?? 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  return `ORDER BY ${column.expression} ${direction}, ${config.columns[0].expression} ASC`;
}

async function rows(url) {
  const table = url.searchParams.get('table') ?? 'time_entries';
  const config = getTableConfig(table);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), MAX_LIMIT);
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);
  const sort = parseJsonParam(url, 'sort', []);
  const { whereSql, params } = buildWhere(config, url);
  const orderSql = buildOrder(config, sort);

  const dataParams = [...params, limit, offset];
  const data = await query(
    `SELECT ${config.select}
     FROM ${config.from}
     ${whereSql}
     ${orderSql}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    dataParams
  );
  const count = await query(`SELECT count(*)::int AS total FROM ${config.from} ${whereSql}`, params);

  return {
    rows: data.rows,
    total: count.rows[0].total,
    timing: {
      rowsMs: data.durationMs,
      countMs: count.durationMs
    }
  };
}

async function facets(url) {
  const table = url.searchParams.get('table') ?? 'time_entries';
  const field = url.searchParams.get('field');
  const config = getTableConfig(table);
  const column = getColumn(config, field);
  if (!column) {
    const error = new Error(`Unknown column: ${field}`);
    error.statusCode = 404;
    throw error;
  }

  const { whereSql, params } = buildWhere(config, url);
  const result = await query(
    `SELECT ${column.expression}::text AS value, count(*)::int AS count
     FROM ${config.from}
     ${whereSql}
     GROUP BY ${column.expression}::text
     ORDER BY count DESC, value ASC
     LIMIT 80`,
    params
  );

  return { values: result.rows, timing: { facetsMs: result.durationMs } };
}

const tableCellUpdateTargets = {
  planning_tasks: {
    idColumn: 'id',
    tableName: 'planning_tasks',
    fields: {
      code: { columnName: 'code' },
      name: { columnName: 'name' },
      task_kind: { columnName: 'task_kind' },
      status: { columnName: 'status' },
      progress: { columnName: 'progress' },
      start_date: { columnName: 'start_date' },
      end_date: { columnName: 'end_date' },
      work_package_code: {
        columnName: 'work_package_id',
        resolve: async (value) => {
          if (value == null || value === '') return null;
          const result = await query('SELECT id FROM work_packages WHERE code = $1', [value]);
          if (result.rows.length) return result.rows[0].id;
          const error = new Error(`Unknown work package: ${value}`);
          error.statusCode = 400;
          error.fieldErrors = { work_package_code: 'Kies een bestaande work package.' };
          throw error;
        }
      },
      location_code: {
        columnName: 'location_id',
        resolve: async (value) => {
          if (value == null || value === '') return null;
          const result = await query('SELECT id FROM location WHERE code = $1', [value]);
          if (result.rows.length) return result.rows[0].id;
          const error = new Error(`Unknown location: ${value}`);
          error.statusCode = 400;
          error.fieldErrors = { location_code: 'Kies een bestaande locatie.' };
          throw error;
        }
      },
      constraint_type: { columnName: 'constraint_type' },
      constraint_date: { columnName: 'constraint_date' },
      notes: { columnName: 'notes' }
    }
  }
};

async function updateConfiguredCell(request) {
  const body = await readBody(request);
  const table = String(body.table ?? '');
  const field = String(body.field ?? '');
  const target = tableCellUpdateTargets[table];
  const config = getTableInteractionConfig(table);
  if (!target || !config) {
    const error = new Error(`Cell updates are not configured for table: ${table}`);
    error.statusCode = 400;
    throw error;
  }
  const fieldTarget = target.fields[field];
  if (!fieldTarget) {
    const error = new Error(`Column is not writable: ${field}`);
    error.statusCode = 400;
    error.fieldErrors = { [field]: 'Deze kolom is niet schrijfbaar.' };
    throw error;
  }
  const validation = validateCellValue(config, field, body.value);
  if (!validation.valid) {
    const error = new Error('Cell update contains invalid value');
    error.statusCode = 400;
    error.fieldErrors = { [field]: validation.message };
    throw error;
  }

  const writeValue = fieldTarget.resolve ? await fieldTarget.resolve(validation.value) : validation.value;
  const before = await query(`SELECT ${fieldTarget.columnName} FROM ${target.tableName} WHERE ${target.idColumn} = $1`, [body.id]);
  if (before.rows.length === 0) {
    const error = new Error('Row not found');
    error.statusCode = 404;
    throw error;
  }
  const result = await query(
    `UPDATE ${target.tableName}
     SET ${fieldTarget.columnName} = $1, updated_at = now()
     WHERE ${target.idColumn} = $2
     RETURNING *`,
    [writeValue, body.id]
  );
  await auditCellChanges({
    table,
    recordId: body.id,
    actor: request.headers['x-actor'] ?? 'unknown',
    changes: [{
      field,
      oldValue: before.rows[0][fieldTarget.columnName] ?? null,
      newValue: writeValue ?? null,
      displayValue: validation.value ?? null
    }]
  });
  return { row: result.rows[0] };
}

async function tableViewDraftPayload(request) {
  const [body, catalog] = await Promise.all([
    readBody(request),
    loadSchemaCatalog(query, tableConfigs)
  ]);
  return { body, catalog };
}

async function stats() {
  const result = await query(`
    SELECT 'customers' AS table_name, count(*)::int AS total FROM customers
    UNION ALL SELECT 'projects', count(*)::int FROM projects
    UNION ALL SELECT 'tickets', count(*)::int FROM tickets
    UNION ALL SELECT 'time_entries', count(*)::int FROM time_entries
    UNION ALL SELECT 'documents', count(*)::int FROM documents
    UNION ALL SELECT 'audit_events', count(*)::int FROM audit_events
    UNION ALL SELECT 'location', count(*)::int FROM location
    UNION ALL SELECT 'planning_tasks', count(*)::int FROM planning_tasks
    UNION ALL SELECT 'planning_dependencies', count(*)::int FROM planning_dependencies
    UNION ALL SELECT 'planning_resources', count(*)::int FROM planning_resources
    UNION ALL SELECT 'planning_equipment', count(*)::int FROM planning_equipment
  `);
  return { tables: result.rows };
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapPlanningTask(row) {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    projectCode: row.project_code,
    workPackageId: row.work_package_id == null ? null : Number(row.work_package_id),
    workPackageCode: row.work_package_code,
    workPackageName: row.work_package_name,
    locationId: row.location_id,
    locationCode: row.location_code,
    locationName: row.location_name,
    code: row.code,
    wbsCode: row.wbs_code,
    name: row.name,
    taskKind: row.task_kind,
    status: row.status,
    progress: Number(row.progress ?? 0),
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    constraintType: row.constraint_type,
    constraintDate: dateOnly(row.constraint_date),
    discipline: row.discipline,
    notes: row.notes,
    metadata: row.metadata ?? {},
    resources: [],
    equipment: [],
    documents: [],
    predecessors: [],
    successors: []
  };
}

function mapWorkPackage(row) {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    projectCode: row.project_code,
    parentId: row.parent_id == null ? null : Number(row.parent_id),
    parentCode: row.parent_code,
    code: row.code,
    name: row.name,
    discipline: row.discipline,
    sortOrder: Number(row.sort_order ?? 0),
    metadata: row.metadata ?? {}
  };
}

function mapPlanningResource(row) {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    resourceType: row.resource_type,
    discipline: row.discipline,
    capacityHoursPerDay: Number(row.capacity_hours_per_day ?? 0),
    calendar: row.calendar ?? {}
  };
}

function mapPlanningEquipment(row) {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    equipmentType: row.equipment_type,
    status: row.status,
    metadata: row.metadata ?? {}
  };
}

function mapPlanningDependency(row) {
  return {
    id: Number(row.id),
    predecessorId: Number(row.predecessor_id),
    predecessorCode: row.predecessor_code,
    successorId: Number(row.successor_id),
    successorCode: row.successor_code,
    dependencyType: row.dependency_type,
    lagDays: Number(row.lag_days ?? 0),
    metadata: row.metadata ?? {}
  };
}

async function planningTasks() {
  const result = await query(`
    SELECT
      pt.*,
      p.code AS project_code,
      wp.code AS work_package_code,
      wp.name AS work_package_name,
      l.code AS location_code,
      l.display_name AS location_name
    FROM planning_tasks pt
    JOIN projects p ON p.id = pt.project_id
    LEFT JOIN work_packages wp ON wp.id = pt.work_package_id
    LEFT JOIN location l ON l.id = pt.location_id
    ORDER BY pt.start_date ASC, pt.end_date ASC, pt.wbs_code ASC, pt.code ASC
  `);
  return { tasks: result.rows.map(mapPlanningTask), timing: { tasksMs: result.durationMs } };
}

async function planningDependencies() {
  const result = await query(`
    SELECT
      pd.*,
      predecessor.code AS predecessor_code,
      successor.code AS successor_code
    FROM planning_dependencies pd
    JOIN planning_tasks predecessor ON predecessor.id = pd.predecessor_id
    JOIN planning_tasks successor ON successor.id = pd.successor_id
    ORDER BY predecessor.start_date ASC, predecessor.code ASC, successor.start_date ASC, successor.code ASC
  `);
  return { dependencies: result.rows.map(mapPlanningDependency), timing: { dependenciesMs: result.durationMs } };
}

async function planningResources() {
  const result = await query('SELECT * FROM planning_resources ORDER BY discipline ASC, code ASC');
  return { resources: result.rows.map(mapPlanningResource), timing: { resourcesMs: result.durationMs } };
}

async function planningEquipment() {
  const result = await query('SELECT * FROM planning_equipment ORDER BY equipment_type ASC, code ASC');
  return { equipment: result.rows.map(mapPlanningEquipment), timing: { equipmentMs: result.durationMs } };
}

async function planningWorkbench() {
  const [
    tasksResult,
    dependenciesResult,
    resourcesResult,
    equipmentResult,
    workPackagesResult,
    taskResourcesResult,
    taskEquipmentResult,
    taskDocumentsResult
  ] = await Promise.all([
    query(`
      SELECT
        pt.*,
        p.code AS project_code,
        wp.code AS work_package_code,
        wp.name AS work_package_name,
        l.code AS location_code,
        l.display_name AS location_name
      FROM planning_tasks pt
      JOIN projects p ON p.id = pt.project_id
      LEFT JOIN work_packages wp ON wp.id = pt.work_package_id
      LEFT JOIN location l ON l.id = pt.location_id
      ORDER BY pt.start_date ASC, pt.end_date ASC, pt.wbs_code ASC, pt.code ASC
    `),
    query(`
      SELECT
        pd.*,
        predecessor.code AS predecessor_code,
        successor.code AS successor_code
      FROM planning_dependencies pd
      JOIN planning_tasks predecessor ON predecessor.id = pd.predecessor_id
      JOIN planning_tasks successor ON successor.id = pd.successor_id
      ORDER BY predecessor.start_date ASC, predecessor.code ASC, successor.start_date ASC, successor.code ASC
    `),
    query('SELECT * FROM planning_resources ORDER BY discipline ASC, code ASC'),
    query('SELECT * FROM planning_equipment ORDER BY equipment_type ASC, code ASC'),
    query(`
      SELECT wp.*, p.code AS project_code, parent.code AS parent_code
      FROM work_packages wp
      JOIN projects p ON p.id = wp.project_id
      LEFT JOIN work_packages parent ON parent.id = wp.parent_id
      ORDER BY wp.sort_order ASC, wp.code ASC
    `),
    query(`
      SELECT
        ptr.task_id,
        ptr.resource_id,
        ptr.allocation_percent,
        ptr.role_on_task,
        pt.code AS task_code,
        pr.code AS resource_code,
        pr.name AS resource_name
      FROM planning_task_resources ptr
      JOIN planning_tasks pt ON pt.id = ptr.task_id
      JOIN planning_resources pr ON pr.id = ptr.resource_id
      ORDER BY pt.start_date ASC, pt.code ASC, pr.code ASC
    `),
    query(`
      SELECT
        pte.task_id,
        pte.equipment_id,
        pte.usage_note,
        pt.code AS task_code,
        pe.code AS equipment_code,
        pe.name AS equipment_name
      FROM planning_task_equipment pte
      JOIN planning_tasks pt ON pt.id = pte.task_id
      JOIN planning_equipment pe ON pe.id = pte.equipment_id
      ORDER BY pt.start_date ASC, pt.code ASC, pe.code ASC
    `),
    query(`
      SELECT
        ptd.task_id,
        ptd.document_id,
        ptd.link_type,
        pt.code AS task_code,
        d.title AS document_title,
        d.doc_type
      FROM planning_task_documents ptd
      JOIN planning_tasks pt ON pt.id = ptd.task_id
      JOIN documents d ON d.id = ptd.document_id
      ORDER BY pt.start_date ASC, pt.code ASC, d.title ASC
    `)
  ]);

  const tasks = tasksResult.rows.map(mapPlanningTask);
  const dependencies = dependenciesResult.rows.map(mapPlanningDependency);
  const resources = resourcesResult.rows.map(mapPlanningResource);
  const equipment = equipmentResult.rows.map(mapPlanningEquipment);
  const workPackages = workPackagesResult.rows.map(mapWorkPackage);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const tasksByCode = new Map(tasks.map((task) => [task.code, task]));

  const taskResources = taskResourcesResult.rows.map((row) => ({
    taskId: Number(row.task_id),
    taskCode: row.task_code,
    resourceId: Number(row.resource_id),
    resourceCode: row.resource_code,
    resourceName: row.resource_name,
    allocationPercent: Number(row.allocation_percent ?? 0),
    roleOnTask: row.role_on_task
  }));
  taskResources.forEach((item) => tasksById.get(item.taskId)?.resources.push(item));

  const taskEquipment = taskEquipmentResult.rows.map((row) => ({
    taskId: Number(row.task_id),
    taskCode: row.task_code,
    equipmentId: Number(row.equipment_id),
    equipmentCode: row.equipment_code,
    equipmentName: row.equipment_name,
    usageNote: row.usage_note
  }));
  taskEquipment.forEach((item) => tasksById.get(item.taskId)?.equipment.push(item));

  const taskDocuments = taskDocumentsResult.rows.map((row) => ({
    taskId: Number(row.task_id),
    taskCode: row.task_code,
    documentId: Number(row.document_id),
    documentTitle: row.document_title,
    docType: row.doc_type,
    linkType: row.link_type
  }));
  taskDocuments.forEach((item) => tasksById.get(item.taskId)?.documents.push(item));

  dependencies.forEach((dependency) => {
    tasksById.get(dependency.successorId)?.predecessors.push(dependency);
    tasksById.get(dependency.predecessorId)?.successors.push(dependency);
  });

  const predecessorCodesBySuccessor = new Map();
  dependencies.forEach((dependency) => {
    if (!tasksByCode.has(dependency.predecessorCode) || !tasksByCode.has(dependency.successorCode)) return;
    const codes = predecessorCodesBySuccessor.get(dependency.successorCode) ?? [];
    codes.push(dependency.predecessorCode);
    predecessorCodesBySuccessor.set(dependency.successorCode, codes);
  });

  const frappeTasks = tasks.map((task) => ({
    id: task.code,
    name: `${task.wbsCode} ${task.name}`,
    start: task.startDate,
    end: task.endDate,
    progress: task.progress,
    dependencies: (predecessorCodesBySuccessor.get(task.code) ?? []).join(','),
    custom_class: `planning-${task.taskKind}-status-${task.status}`,
    taskKind: task.taskKind,
    status: task.status,
    workPackageCode: task.workPackageCode,
    resourceCodes: task.resources.map((resource) => resource.resourceCode),
    equipmentCodes: task.equipment.map((item) => item.equipmentCode)
  }));

  const timelineItemForTask = (task, group, idSuffix = '') => ({
    id: `${group.id}:${task.id}${idSuffix}`,
    group: group.id,
    content: `${task.wbsCode} ${task.name}`,
    title: `${task.code} - ${task.name}`,
    start: task.startDate,
    end: task.taskKind === 'milestone' ? undefined : task.endDate,
    type: task.taskKind === 'milestone' ? 'point' : 'range',
    className: `planning-${task.taskKind} status-${task.status}`,
    taskId: task.id,
    taskCode: task.code,
    taskKind: task.taskKind,
    status: task.status
  });

  const resourceGroups = resources.map((resource) => ({
    id: `resource:${resource.id}`,
    content: resource.name,
    code: resource.code,
    discipline: resource.discipline,
    type: resource.resourceType
  }));
  const resourceGroupIds = new Set(resourceGroups.map((group) => group.id));
  const resourceItems = taskResources
    .map((assignment) => {
      const task = tasksById.get(assignment.taskId);
      const group = { id: `resource:${assignment.resourceId}` };
      if (!task || !resourceGroupIds.has(group.id)) return null;
      return {
        ...timelineItemForTask(task, group, `:${assignment.resourceId}`),
        allocationPercent: assignment.allocationPercent,
        roleOnTask: assignment.roleOnTask
      };
    })
    .filter(Boolean);

  const equipmentGroups = equipment.map((item) => ({
    id: `equipment:${item.id}`,
    content: item.name,
    code: item.code,
    type: item.equipmentType,
    status: item.status
  }));
  const equipmentGroupIds = new Set(equipmentGroups.map((group) => group.id));
  const equipmentItems = taskEquipment
    .map((assignment) => {
      const task = tasksById.get(assignment.taskId);
      const group = { id: `equipment:${assignment.equipmentId}` };
      if (!task || !equipmentGroupIds.has(group.id)) return null;
      return {
        ...timelineItemForTask(task, group, `:${assignment.equipmentId}`),
        usageNote: assignment.usageNote
      };
    })
    .filter(Boolean);

  const workPackageGroups = workPackages.map((workPackage) => ({
    id: `workPackage:${workPackage.id}`,
    content: `${workPackage.code} ${workPackage.name}`,
    code: workPackage.code,
    discipline: workPackage.discipline,
    parentId: workPackage.parentId == null ? null : `workPackage:${workPackage.parentId}`
  }));
  const workPackageGroupIds = new Set(workPackageGroups.map((group) => group.id));
  const workPackageItems = tasks
    .map((task) => {
      if (!task.workPackageId) return null;
      const group = { id: `workPackage:${task.workPackageId}` };
      if (!workPackageGroupIds.has(group.id)) return null;
      return timelineItemForTask(task, group);
    })
    .filter(Boolean);

  return {
    tasks,
    dependencies,
    resources,
    equipment,
    workPackages,
    taskResources,
    taskEquipment,
    taskDocuments,
    projections: {
      frappeGantt: {
        tasks: frappeTasks,
        dependencies: dependencies.map((dependency) => ({
          id: dependency.id,
          source: dependency.predecessorCode,
          target: dependency.successorCode,
          type: dependency.dependencyType,
          lagDays: dependency.lagDays
        }))
      },
      visTimeline: {
        resource: { groups: resourceGroups, items: resourceItems },
        equipment: { groups: equipmentGroups, items: equipmentItems },
        workPackage: { groups: workPackageGroups, items: workPackageItems }
      }
    },
    timing: {
      tasksMs: tasksResult.durationMs,
      dependenciesMs: dependenciesResult.durationMs,
      resourcesMs: resourcesResult.durationMs,
      equipmentMs: equipmentResult.durationMs,
      workPackagesMs: workPackagesResult.durationMs,
      taskResourcesMs: taskResourcesResult.durationMs,
      taskEquipmentMs: taskEquipmentResult.durationMs,
      taskDocumentsMs: taskDocumentsResult.durationMs
    }
  };
}

function mapLocationRow(row) {
  return {
    id: row.id,
    parentId: row.parent_id,
    typeId: row.type_id,
    typeCode: row.type_code,
    type: row.type_name,
    code: row.code,
    name: row.name,
    displayName: row.display_name,
    complexCode: row.complex_code,
    complexName: row.complex_name,
    abbreviation: row.abbreviation,
    sortOrder: row.sort_order,
    source: row.source,
    sourcePage: row.source_page,
    sourceSection: row.source_section,
    confidence: row.confidence,
    metadata: row.metadata,
    parentCode: row.parent_code,
    parentName: row.parent_name,
    childCount: Number(row.child_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function locationRows(url) {
  const quick = url.searchParams.get('q')?.trim();
  const params = [];
  let whereSql = '';
  if (quick) {
    params.push(`%${quick}%`);
    whereSql = `
      WHERE l.code ILIKE $1
         OR l.name ILIKE $1
         OR l.display_name ILIKE $1
         OR coalesce(lt.name, '') ILIKE $1
         OR coalesce(l.complex_name, '') ILIKE $1
         OR coalesce(l.complex_code, '') ILIKE $1
    `;
  }

  const result = await query(
    `SELECT
       l.*,
       lt.code AS type_code,
       lt.name AS type_name,
       p.code AS parent_code,
       p.display_name AS parent_name,
       (SELECT count(*)::int FROM location child WHERE child.parent_id = l.id) AS child_count
     FROM location l
     LEFT JOIN location_type lt ON lt.id = l.type_id
     LEFT JOIN location p ON p.id = l.parent_id
     ${whereSql}
     ORDER BY l.sort_order ASC, l.display_name ASC`,
    params
  );
  return { rows: result.rows.map(mapLocationRow), total: result.rows.length, timing: { rowsMs: result.durationMs } };
}

function buildLocationTree(rows) {
  const nodes = new Map(rows.map((row) => [row.id, {
    id: row.id,
    name: row.name,
    code: row.code,
    displayName: row.displayName,
    type: row.typeCode ?? row.type,
    typeName: row.type,
    confidence: row.confidence,
    sourcePage: row.sourcePage,
    complexName: row.complexName,
    sortOrder: row.sortOrder,
    children: []
  }]));
  const roots = [];
  rows.forEach((row) => {
    const node = nodes.get(row.id);
    if (row.parentId && nodes.has(row.parentId)) {
      nodes.get(row.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });
  const prune = (node) => {
    node.children.sort((a, b) => {
      const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      return order === 0 ? String(a.displayName ?? a.name).localeCompare(String(b.displayName ?? b.name), 'nl-BE') : order;
    });
    node.children.forEach(prune);
    if (node.children.length === 0) delete node.children;
  };
  roots.forEach(prune);
  return roots;
}

async function locationTree(url) {
  const payload = await locationRows(url);
  return { nodes: buildLocationTree(payload.rows), flatRows: payload.rows, total: payload.total, timing: payload.timing };
}

function normalizeLocationInput(body) {
  const required = ['code', 'name'];
  for (const field of required) {
    if (!String(body[field] ?? '').trim()) {
      const error = new Error(`Missing required field: ${field}`);
      error.statusCode = 400;
      throw error;
    }
  }
  const confidence = body.confidence ?? 'derived';
  if (!['explicit', 'derived', 'inferred'].includes(confidence)) {
    const error = new Error('confidence must be explicit, derived or inferred');
    error.statusCode = 400;
    throw error;
  }
  return {
    parentId: body.parentId || null,
    typeCode: body.typeCode || body.type || null,
    code: String(body.code).trim(),
    name: String(body.name).trim(),
    displayName: String(body.displayName || `${body.code} - ${body.name}`).trim(),
    complexCode: body.complexCode || null,
    complexName: body.complexName || null,
    abbreviation: body.abbreviation || null,
    sortOrder: Number(body.sortOrder ?? 0),
    source: body.source || null,
    sourcePage: body.sourcePage == null || body.sourcePage === '' ? null : Number(body.sourcePage),
    sourceSection: body.sourceSection || null,
    confidence,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {}
  };
}

async function assertNoLocationCycle(id, parentId) {
  if (!parentId || !id) return;
  if (id === parentId) {
    const error = new Error('A location cannot be its own parent');
    error.statusCode = 400;
    throw error;
  }
  const result = await query(
    `WITH RECURSIVE descendants AS (
       SELECT id FROM location WHERE parent_id = $1
       UNION ALL
       SELECT child.id
       FROM location child
       JOIN descendants d ON child.parent_id = d.id
     )
     SELECT EXISTS (SELECT 1 FROM descendants WHERE id = $2) AS has_cycle`,
    [id, parentId]
  );
  if (result.rows[0].has_cycle) {
    const error = new Error('Changing parent would create a cyclic location hierarchy');
    error.statusCode = 400;
    throw error;
  }
}

async function resolveLocationType(typeCode) {
  if (!typeCode) return null;
  const result = await query('SELECT id FROM location_type WHERE code = $1 OR name = $1', [typeCode]);
  if (result.rows.length === 0) {
    const error = new Error(`Unknown location type: ${typeCode}`);
    error.statusCode = 400;
    throw error;
  }
  return result.rows[0].id;
}

function comparableValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function validateLocationUpdatePayload(body, currentRow) {
  const config = getTableInteractionConfig('locations');
  const fieldErrors = {};

  config.columns.forEach((column) => {
    if (!(column.field in body)) return;
    if (column.editType === EDIT_TYPES.READONLY) {
      if (comparableValue(body[column.field]) !== comparableValue(currentRow[column.field])) {
        fieldErrors[column.field] = column.readOnlyReason ?? 'Deze kolom is alleen-lezen.';
      }
      return;
    }
    const validation = validateCellValue(config, column.field, body[column.field]);
    if (!validation.valid) fieldErrors[column.field] = validation.message;
  });

  return fieldErrors;
}

function changedAuditedLocationCells(before, after) {
  const config = getTableInteractionConfig('locations');
  return config.columns
    .filter((column) => column.audit && column.editType !== EDIT_TYPES.READONLY)
    .map((column) => ({
      field: column.field,
      oldValue: before[column.field] ?? null,
      newValue: after[column.field] ?? null
    }))
    .filter((change) => comparableValue(change.oldValue) !== comparableValue(change.newValue));
}

async function auditCellChanges({ table, recordId, actor = 'unknown', changes }) {
  if (!changes.length) return;
  const numericId = Number(recordId);
  await query(
    `INSERT INTO audit_events (entity_type, entity_id, action, actor, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      table,
      Number.isFinite(numericId) ? numericId : 0,
      'cell_update',
      actor,
      { recordId, changes }
    ]
  );
}

async function createLocation(request) {
  const input = normalizeLocationInput(await readBody(request));
  const typeId = await resolveLocationType(input.typeCode);
  const result = await query(
    `INSERT INTO location (
       parent_id, type_id, code, name, display_name, complex_code, complex_name,
       abbreviation, sort_order, source, source_page, source_section, confidence, metadata
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      input.parentId, typeId, input.code, input.name, input.displayName, input.complexCode,
      input.complexName, input.abbreviation, input.sortOrder, input.source, input.sourcePage,
      input.sourceSection, input.confidence, input.metadata
    ]
  );
  return { location: result.rows[0] };
}

async function updateLocation(request, id) {
  const body = await readBody(request);
  const current = await query(
    `SELECT
       l.*,
       lt.code AS type_code,
       lt.name AS type_name,
       p.code AS parent_code,
       p.display_name AS parent_name,
       (SELECT count(*)::int FROM location child WHERE child.parent_id = l.id) AS child_count
     FROM location l
     LEFT JOIN location_type lt ON lt.id = l.type_id
     LEFT JOIN location p ON p.id = l.parent_id
     WHERE l.id = $1`,
    [id]
  );
  if (current.rows.length === 0) {
    const error = new Error('Location not found');
    error.statusCode = 404;
    throw error;
  }
  const beforeRow = mapLocationRow(current.rows[0]);
  const fieldErrors = validateLocationUpdatePayload(body, beforeRow);
  if (Object.keys(fieldErrors).length > 0) {
    const error = new Error('Location update contains invalid fields');
    error.statusCode = 400;
    error.fieldErrors = fieldErrors;
    throw error;
  }

  const input = normalizeLocationInput(body);
  await assertNoLocationCycle(id, input.parentId);
  const typeId = await resolveLocationType(input.typeCode);
  const result = await query(
    `UPDATE location SET
       parent_id = $1,
       type_id = $2,
       code = $3,
       name = $4,
       display_name = $5,
       complex_code = $6,
       complex_name = $7,
       abbreviation = $8,
       sort_order = $9,
       source = $10,
       source_page = $11,
       source_section = $12,
       confidence = $13,
       metadata = $14,
       updated_at = now()
     WHERE id = $15
     RETURNING *`,
    [
      input.parentId, typeId, input.code, input.name, input.displayName, input.complexCode,
      input.complexName, input.abbreviation, input.sortOrder, input.source, input.sourcePage,
      input.sourceSection, input.confidence, input.metadata, id
    ]
  );
  if (result.rows.length === 0) {
    const error = new Error('Location not found');
    error.statusCode = 404;
    throw error;
  }
  const afterRow = {
    ...beforeRow,
    parentId: input.parentId,
    typeId,
    typeCode: input.typeCode,
    type: input.typeCode ? body.type ?? beforeRow.type : null,
    code: input.code,
    name: input.name,
    displayName: input.displayName,
    complexCode: input.complexCode,
    complexName: input.complexName,
    abbreviation: input.abbreviation,
    sortOrder: input.sortOrder,
    source: input.source,
    sourcePage: input.sourcePage,
    sourceSection: input.sourceSection,
    confidence: input.confidence,
    metadata: input.metadata
  };
  await auditCellChanges({
    table: 'location',
    recordId: id,
    actor: request.headers['x-actor'] ?? 'unknown',
    changes: changedAuditedLocationCells(beforeRow, afterRow)
  });
  return { location: result.rows[0] };
}

async function deleteLocation(id) {
  const result = await query('DELETE FROM location WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) {
    const error = new Error('Location not found');
    error.statusCode = 404;
    throw error;
  }
  return { deleted: result.rows[0].id };
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === '/api/schema') {
      sendJson(response, 200, tableConfigs);
      return;
    }
    if (url.pathname === '/api/schema-catalog') {
      sendJson(response, 200, await loadSchemaCatalog(query, tableConfigs));
      return;
    }
    if (url.pathname === '/api/table-view-drafts' && request.method === 'GET') {
      sendJson(response, 200, await listTableViewDrafts(query));
      return;
    }
    if (url.pathname === '/api/table-view-drafts' && request.method === 'POST') {
      const { body, catalog } = await tableViewDraftPayload(request);
      sendJson(response, 201, await createTableViewDraft(query, body, catalog));
      return;
    }
    const tableViewDraftMatch = url.pathname.match(/^\/api\/table-view-drafts\/([^/]+)$/);
    if (tableViewDraftMatch && request.method === 'GET') {
      sendJson(response, 200, await getTableViewDraft(query, tableViewDraftMatch[1]));
      return;
    }
    if (tableViewDraftMatch && request.method === 'PUT') {
      const { body, catalog } = await tableViewDraftPayload(request);
      sendJson(response, 200, await updateTableViewDraft(query, tableViewDraftMatch[1], body, catalog));
      return;
    }
    if (url.pathname === '/api/rows') {
      sendJson(response, 200, await rows(url));
      return;
    }
    if (url.pathname === '/api/facets') {
      sendJson(response, 200, await facets(url));
      return;
    }
    if (url.pathname === '/api/rows/cell' && request.method === 'PUT') {
      sendJson(response, 200, await updateConfiguredCell(request));
      return;
    }
    if (url.pathname === '/api/stats') {
      sendJson(response, 200, await stats());
      return;
    }
    if (url.pathname === '/api/planning/tasks' && request.method === 'GET') {
      sendJson(response, 200, await planningTasks());
      return;
    }
    if (url.pathname === '/api/planning/dependencies' && request.method === 'GET') {
      sendJson(response, 200, await planningDependencies());
      return;
    }
    if (url.pathname === '/api/planning/resources' && request.method === 'GET') {
      sendJson(response, 200, await planningResources());
      return;
    }
    if (url.pathname === '/api/planning/equipment' && request.method === 'GET') {
      sendJson(response, 200, await planningEquipment());
      return;
    }
    if (url.pathname === '/api/planning/workbench' && request.method === 'GET') {
      sendJson(response, 200, await planningWorkbench());
      return;
    }
    if (url.pathname === '/api/locations' && request.method === 'GET') {
      sendJson(response, 200, await locationRows(url));
      return;
    }
    if (url.pathname === '/api/locations/tree' && request.method === 'GET') {
      sendJson(response, 200, await locationTree(url));
      return;
    }
    if (url.pathname === '/api/locations' && request.method === 'POST') {
      sendJson(response, 201, await createLocation(request));
      return;
    }
    const locationMatch = url.pathname.match(/^\/api\/locations\/([^/]+)$/);
    if (locationMatch && request.method === 'PUT') {
      sendJson(response, 200, await updateLocation(request, locationMatch[1]));
      return;
    }
    if (locationMatch && request.method === 'DELETE') {
      sendJson(response, 200, await deleteLocation(locationMatch[1]));
      return;
    }
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(response, error.statusCode ?? 500, { error: error.message, fieldErrors: error.fieldErrors });
  }
});

server.listen(PORT, () => {
  console.log(`Table Lab API listening on http://localhost:${PORT}`);
});

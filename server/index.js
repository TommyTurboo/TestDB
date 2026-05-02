import http from 'node:http';
import { URL } from 'node:url';
import { query } from './db.js';
import { getColumn, getTableConfig, tableConfigs } from './schema.js';

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

async function stats() {
  const result = await query(`
    SELECT 'customers' AS table_name, count(*)::int AS total FROM customers
    UNION ALL SELECT 'projects', count(*)::int FROM projects
    UNION ALL SELECT 'tickets', count(*)::int FROM tickets
    UNION ALL SELECT 'time_entries', count(*)::int FROM time_entries
    UNION ALL SELECT 'documents', count(*)::int FROM documents
    UNION ALL SELECT 'audit_events', count(*)::int FROM audit_events
    UNION ALL SELECT 'location', count(*)::int FROM location
  `);
  return { tables: result.rows };
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
  const input = normalizeLocationInput(await readBody(request));
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
    if (url.pathname === '/api/rows') {
      sendJson(response, 200, await rows(url));
      return;
    }
    if (url.pathname === '/api/facets') {
      sendJson(response, 200, await facets(url));
      return;
    }
    if (url.pathname === '/api/stats') {
      sendJson(response, 200, await stats());
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
    sendJson(response, error.statusCode ?? 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Table Lab API listening on http://localhost:${PORT}`);
});

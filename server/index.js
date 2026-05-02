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
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  response.end(JSON.stringify(payload));
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
  `);
  return { tables: result.rows };
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
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(response, error.statusCode ?? 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Table Lab API listening on http://localhost:${PORT}`);
});

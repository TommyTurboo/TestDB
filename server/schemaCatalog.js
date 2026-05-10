const DEFAULT_SCHEMA = 'public';
const BLOCKED_TABLES = new Set(['audit_events']);
const SUPPORTED_RELATION_ACTIONS = new Set(['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL']);

function humanizeIdentifier(identifier) {
  return String(identifier ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function mapDatabaseType(dataType, udtName) {
  if (dataType === 'ARRAY') return 'array';
  if (['bigint', 'integer', 'smallint', 'numeric', 'double precision', 'real'].includes(dataType)) return 'number';
  if (dataType === 'boolean') return 'boolean';
  if (dataType === 'date') return 'date';
  if (dataType?.includes('timestamp')) return 'datetime';
  if (['json', 'jsonb'].includes(dataType)) return 'jsonb';
  if (udtName === 'uuid') return 'uuid';
  return 'text';
}

export function buildSchemaCatalog({ columns, relations, configuredTables = {} }) {
  const tableMap = new Map();

  columns
    .filter((column) => column.table_schema === DEFAULT_SCHEMA)
    .filter((column) => !BLOCKED_TABLES.has(column.table_name))
    .forEach((column) => {
      const tableName = column.table_name;
      const existing = tableMap.get(tableName) ?? {
        name: tableName,
        label: configuredTables[tableName]?.label ?? humanizeIdentifier(tableName),
        configured: Boolean(configuredTables[tableName]),
        supportedAsRoot: true,
        unsupportedReason: '',
        columns: [],
        relations: []
      };
      existing.columns.push({
        name: column.column_name,
        label: humanizeIdentifier(column.column_name),
        type: mapDatabaseType(column.data_type, column.udt_name),
        databaseType: column.data_type,
        nullable: column.is_nullable === 'YES',
        ordinal: Number(column.ordinal_position),
        hasDefault: column.column_default != null
      });
      tableMap.set(tableName, existing);
    });

  relations
    .filter((relation) => relation.source_schema === DEFAULT_SCHEMA && relation.target_schema === DEFAULT_SCHEMA)
    .filter((relation) => tableMap.has(relation.source_table) && tableMap.has(relation.target_table))
    .forEach((relation) => {
      const supported = SUPPORTED_RELATION_ACTIONS.has(relation.update_rule) && SUPPORTED_RELATION_ACTIONS.has(relation.delete_rule);
      tableMap.get(relation.source_table).relations.push({
        name: relation.constraint_name,
        column: relation.source_column,
        targetTable: relation.target_table,
        targetColumn: relation.target_column,
        supported,
        unsupportedReason: supported ? '' : `Referentieactie ${relation.update_rule}/${relation.delete_rule} is nog niet ondersteund.`
      });
    });

  const tables = [...tableMap.values()]
    .map((table) => ({
      ...table,
      columns: table.columns.sort((a, b) => a.ordinal - b.ordinal),
      relations: table.relations.sort((a, b) => a.column.localeCompare(b.column, 'nl-BE'))
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'nl-BE'));

  return {
    schema: DEFAULT_SCHEMA,
    tables,
    generatedAt: new Date().toISOString()
  };
}

export async function loadSchemaCatalog(query, configuredTables = {}) {
  const [columnsResult, relationsResult] = await Promise.all([
    query(
      `SELECT table_schema, table_name, column_name, ordinal_position, data_type, udt_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1
       ORDER BY table_name ASC, ordinal_position ASC`,
      [DEFAULT_SCHEMA]
    ),
    query(
      `SELECT
         tc.constraint_name,
         tc.table_schema AS source_schema,
         tc.table_name AS source_table,
         kcu.column_name AS source_column,
         ccu.table_schema AS target_schema,
         ccu.table_name AS target_table,
         ccu.column_name AS target_column,
         rc.update_rule,
         rc.delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = tc.constraint_name
        AND rc.constraint_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = $1
       ORDER BY tc.table_name ASC, kcu.column_name ASC`,
      [DEFAULT_SCHEMA]
    )
  ]);

  return buildSchemaCatalog({
    columns: columnsResult.rows,
    relations: relationsResult.rows,
    configuredTables
  });
}

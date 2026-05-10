import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSchemaCatalog, mapDatabaseType } from './schemaCatalog.js';

test('mapDatabaseType normalizes postgres types for the builder', () => {
  assert.equal(mapDatabaseType('bigint'), 'number');
  assert.equal(mapDatabaseType('numeric'), 'number');
  assert.equal(mapDatabaseType('boolean'), 'boolean');
  assert.equal(mapDatabaseType('date'), 'date');
  assert.equal(mapDatabaseType('timestamp with time zone'), 'datetime');
  assert.equal(mapDatabaseType('jsonb'), 'jsonb');
  assert.equal(mapDatabaseType('USER-DEFINED', 'uuid'), 'uuid');
  assert.equal(mapDatabaseType('character varying'), 'text');
});

test('buildSchemaCatalog exposes public tables, columns and safe direct relations', () => {
  const catalog = buildSchemaCatalog({
    configuredTables: { planning_tasks: { label: 'Planning tasks' } },
    columns: [
      { table_schema: 'public', table_name: 'planning_tasks', column_name: 'id', ordinal_position: 1, data_type: 'bigint', udt_name: 'int8', is_nullable: 'NO', column_default: "nextval('planning_tasks_id_seq')" },
      { table_schema: 'public', table_name: 'planning_tasks', column_name: 'project_id', ordinal_position: 2, data_type: 'bigint', udt_name: 'int8', is_nullable: 'NO', column_default: null },
      { table_schema: 'public', table_name: 'projects', column_name: 'id', ordinal_position: 1, data_type: 'bigint', udt_name: 'int8', is_nullable: 'NO', column_default: null },
      { table_schema: 'public', table_name: 'audit_events', column_name: 'id', ordinal_position: 1, data_type: 'bigint', udt_name: 'int8', is_nullable: 'NO', column_default: null },
      { table_schema: 'pg_catalog', table_name: 'pg_type', column_name: 'oid', ordinal_position: 1, data_type: 'oid', udt_name: 'oid', is_nullable: 'NO', column_default: null }
    ],
    relations: [
      {
        constraint_name: 'planning_tasks_project_id_fkey',
        source_schema: 'public',
        source_table: 'planning_tasks',
        source_column: 'project_id',
        target_schema: 'public',
        target_table: 'projects',
        target_column: 'id',
        update_rule: 'NO ACTION',
        delete_rule: 'CASCADE'
      }
    ]
  });

  assert.equal(catalog.schema, 'public');
  assert.deepEqual(catalog.tables.map((table) => table.name).sort(), ['planning_tasks', 'projects']);
  const tasks = catalog.tables.find((table) => table.name === 'planning_tasks');
  assert.equal(tasks.label, 'Planning tasks');
  assert.equal(tasks.configured, true);
  assert.equal(tasks.columns[0].name, 'id');
  assert.equal(tasks.columns[0].type, 'number');
  assert.equal(tasks.columns[1].nullable, false);
  assert.deepEqual(tasks.relations, [{
    name: 'planning_tasks_project_id_fkey',
    column: 'project_id',
    targetTable: 'projects',
    targetColumn: 'id',
    supported: true,
    unsupportedReason: ''
  }]);
});

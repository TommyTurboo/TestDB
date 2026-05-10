CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  segment TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  annual_revenue NUMERIC(14,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  budget NUMERIC(14,2) NOT NULL,
  risk_score INTEGER NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  starts_on DATE NOT NULL,
  ends_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id),
  ticket_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  story_points INTEGER NOT NULL,
  assignee TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS time_entries (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id),
  project_id BIGINT NOT NULL REFERENCES projects(id),
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  work_date DATE NOT NULL,
  consultant TEXT NOT NULL,
  role TEXT NOT NULL,
  hours NUMERIC(5,2) NOT NULL,
  billable BOOLEAN NOT NULL,
  hourly_rate NUMERIC(8,2) NOT NULL,
  note TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  markdown_body TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(markdown_body, ''))
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
);

CREATE TABLE IF NOT EXISTS location_type (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS location (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES location(id) ON DELETE RESTRICT,
  type_id UUID REFERENCES location_type(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  complex_code TEXT,
  complex_name TEXT,
  abbreviation TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  source_page INTEGER,
  source_section TEXT,
  confidence TEXT NOT NULL DEFAULT 'derived',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT location_confidence_check
    CHECK (confidence IN ('explicit', 'derived', 'inferred'))
);

CREATE TABLE IF NOT EXISTS work_packages (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id BIGINT REFERENCES work_packages(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  discipline TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planning_resources (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  discipline TEXT NOT NULL,
  capacity_hours_per_day NUMERIC(4,2) NOT NULL DEFAULT 8,
  calendar JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT planning_resources_type_check
    CHECK (resource_type IN ('person', 'team', 'role'))
);

CREATE TABLE IF NOT EXISTS planning_equipment (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  equipment_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT planning_equipment_status_check
    CHECK (status IN ('available', 'reserved', 'maintenance', 'unavailable'))
);

CREATE TABLE IF NOT EXISTS planning_tasks (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  work_package_id BIGINT REFERENCES work_packages(id) ON DELETE SET NULL,
  location_id UUID REFERENCES location(id) ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE,
  wbs_code TEXT NOT NULL,
  name TEXT NOT NULL,
  task_kind TEXT NOT NULL DEFAULT 'task',
  status TEXT NOT NULL DEFAULT 'not_started',
  progress INTEGER NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  constraint_type TEXT NOT NULL DEFAULT 'none',
  constraint_date DATE,
  discipline TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT planning_tasks_kind_check
    CHECK (task_kind IN ('task', 'milestone')),
  CONSTRAINT planning_tasks_status_check
    CHECK (status IN ('not_started', 'in_progress', 'complete', 'blocked')),
  CONSTRAINT planning_tasks_progress_check
    CHECK (progress BETWEEN 0 AND 100),
  CONSTRAINT planning_tasks_constraint_type_check
    CHECK (constraint_type IN ('none', 'start_no_earlier_than', 'finish_no_later_than', 'must_start_on', 'must_finish_on')),
  CONSTRAINT planning_tasks_date_order_check
    CHECK (end_date >= start_date),
  CONSTRAINT planning_tasks_milestone_date_check
    CHECK (task_kind <> 'milestone' OR start_date = end_date)
);

CREATE TABLE IF NOT EXISTS planning_dependencies (
  id BIGSERIAL PRIMARY KEY,
  predecessor_id BIGINT NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,
  successor_id BIGINT NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'FS',
  lag_days INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT planning_dependencies_type_check
    CHECK (dependency_type IN ('FS', 'SS', 'FF', 'SF')),
  CONSTRAINT planning_dependencies_no_self_check
    CHECK (predecessor_id <> successor_id),
  CONSTRAINT planning_dependencies_unique
    UNIQUE (predecessor_id, successor_id, dependency_type)
);

CREATE TABLE IF NOT EXISTS planning_task_resources (
  task_id BIGINT NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,
  resource_id BIGINT NOT NULL REFERENCES planning_resources(id) ON DELETE CASCADE,
  allocation_percent INTEGER NOT NULL DEFAULT 100,
  role_on_task TEXT NOT NULL DEFAULT 'Assigned',
  PRIMARY KEY (task_id, resource_id),
  CONSTRAINT planning_task_resources_allocation_check
    CHECK (allocation_percent BETWEEN 1 AND 200)
);

CREATE TABLE IF NOT EXISTS planning_task_equipment (
  task_id BIGINT NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,
  equipment_id BIGINT NOT NULL REFERENCES planning_equipment(id) ON DELETE CASCADE,
  usage_note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (task_id, equipment_id)
);

CREATE TABLE IF NOT EXISTS planning_task_documents (
  task_id BIGINT NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL DEFAULT 'reference',
  PRIMARY KEY (task_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_project_id ON tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_ticket_id ON time_entries(ticket_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project_id ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_customer_id ON time_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_work_date ON time_entries(work_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_consultant_trgm ON time_entries USING gin (consultant gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_time_entries_note_trgm ON time_entries USING gin (note gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_time_entries_attributes_gin ON time_entries USING gin (attributes);
CREATE INDEX IF NOT EXISTS idx_documents_search_vector ON documents USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_documents_properties_gin ON documents USING gin(properties);
CREATE INDEX IF NOT EXISTS idx_location_parent_id ON location(parent_id);
CREATE INDEX IF NOT EXISTS idx_location_complex_code ON location(complex_code);
CREATE INDEX IF NOT EXISTS idx_location_metadata ON location USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_work_packages_project_id ON work_packages(project_id);
CREATE INDEX IF NOT EXISTS idx_work_packages_parent_id ON work_packages(parent_id);
CREATE INDEX IF NOT EXISTS idx_planning_tasks_project_id ON planning_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_planning_tasks_work_package_id ON planning_tasks(work_package_id);
CREATE INDEX IF NOT EXISTS idx_planning_tasks_location_id ON planning_tasks(location_id);
CREATE INDEX IF NOT EXISTS idx_planning_tasks_dates ON planning_tasks(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_planning_tasks_status ON planning_tasks(status);
CREATE INDEX IF NOT EXISTS idx_planning_dependencies_predecessor_id ON planning_dependencies(predecessor_id);
CREATE INDEX IF NOT EXISTS idx_planning_dependencies_successor_id ON planning_dependencies(successor_id);
CREATE INDEX IF NOT EXISTS idx_planning_task_resources_resource_id ON planning_task_resources(resource_id);
CREATE INDEX IF NOT EXISTS idx_planning_task_equipment_equipment_id ON planning_task_equipment(equipment_id);
CREATE INDEX IF NOT EXISTS idx_planning_task_documents_document_id ON planning_task_documents(document_id);

import pg from 'pg';

const { Client } = pg;

const ROWS = Number(process.env.SEED_TIME_ENTRIES ?? 50000);
const BATCH_SIZE = 1000;

const client = new Client({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5436),
  database: process.env.PGDATABASE ?? 'tablelab',
  user: process.env.PGUSER ?? 'tablelab',
  password: process.env.PGPASSWORD ?? 'tablelab'
});

const segments = ['Enterprise', 'SMB', 'Public', 'Healthcare', 'Industrial'];
const countries = ['BE', 'NL', 'FR', 'DE', 'LU'];
const cities = ['Antwerpen', 'Gent', 'Brussel', 'Rotterdam', 'Lille', 'Aachen', 'Luxemburg'];
const projectStatuses = ['Discovery', 'Active', 'Paused', 'Completed', 'At risk'];
const priorities = ['Low', 'Medium', 'High', 'Critical'];
const ticketStatuses = ['Backlog', 'Ready', 'In progress', 'Review', 'Done'];
const consultants = ['Ada', 'Linus', 'Grace', 'Margaret', 'Ken', 'Barbara', 'Donald', 'Edsger', 'Radia', 'Guido', 'Frances', 'Leslie'];
const roles = ['Analyst', 'Developer', 'Architect', 'Tester', 'Data Engineer', 'Project Manager'];
const docTypes = ['Decision', 'Specification', 'Meeting notes', 'Runbook', 'Research'];
const actions = ['created', 'updated', 'assigned', 'commented', 'closed', 'reopened'];
const locationTypes = [
  ['project', 'Project'],
  ['complex', 'Stuwsluiscomplex'],
  ['asset_zone', 'Installatiezone'],
  ['building', 'Gebouw'],
  ['room', 'Lokaal'],
  ['technical_space', 'Technische ruimte'],
  ['bank', 'Oever'],
  ['structure_part', 'Constructiedeel'],
  ['cable_route', 'Kabelroute'],
  ['equipment_zone', 'Uitrustingszone']
];

const locationSeed = [
  { code: 'PROJECT-KANAAL-BOVEN-SCHELDE', name: 'Kanaal Bossuit-Kortrijk en Boven-Schelde', type: 'project', sort: 1, confidence: 'explicit', sourcePage: 1, children: [
    { code: 'ASPER', name: 'Asper', type: 'complex', complexCode: 'ASPER', complexName: 'Stuwsluiscomplex Asper', abbreviation: 'ASP', sourcePage: 12, confidence: 'explicit', children: [
      { code: 'ASPER-SLUIS', name: 'Sluis Asper', type: 'asset_zone', sort: 10, children: [
        { code: 'ASPER-SLUIS-BOVENHOOFD', name: 'Bovenhoofd', type: 'structure_part', sourcePage: 18 },
        { code: 'ASPER-SLUIS-BENEDENHOOFD', name: 'Benedenhoofd', type: 'structure_part', sourcePage: 19 },
        { code: 'ASPER-SLUIS-KOLK', name: 'Kolkomgeving', type: 'equipment_zone', confidence: 'derived' }
      ] },
      { code: 'ASPER-STUW', name: 'Stuw Asper', type: 'asset_zone', sort: 20, children: [
        { code: 'ASPER-STUW-LINKEROEVER', name: 'Linkeroever stuw', type: 'bank' },
        { code: 'ASPER-STUW-RECHTEROEVER', name: 'Rechteroever stuw', type: 'bank' },
        { code: 'ASPER-STUW-BORDES', name: 'Bedieningsbordes', type: 'structure_part', confidence: 'inferred' }
      ] },
      { code: 'ASPER-VISPASSAGE', name: 'Vispassage Asper', type: 'asset_zone', sort: 30 },
      { code: 'ASPER-DIENSTGEBOUW', name: 'Dienstgebouw Asper', type: 'building', sort: 40, children: [
        { code: 'ASPER-DIENSTGEBOUW-TECH-01', name: 'Technisch lokaal 01', type: 'technical_space', abbreviation: 'TL01' },
        { code: 'ASPER-DIENSTGEBOUW-BEDIENING', name: 'Bedieningslokaal', type: 'room' }
      ] },
      { code: 'ASPER-KABELGANG-NOORD', name: 'Kabelgang noord', type: 'cable_route', sort: 50 }
    ] },
    { code: 'OUDENAARDE', name: 'Oudenaarde', type: 'complex', complexCode: 'OUD', complexName: 'Stuwsluiscomplex Oudenaarde', abbreviation: 'OUD', sourcePage: 42, confidence: 'explicit', children: [
      { code: 'OUD-SLUIS', name: 'Sluis Oudenaarde', type: 'asset_zone', sort: 10, children: [
        { code: 'OUD-SLUIS-BOVENHOOFD', name: 'Bovenhoofd', type: 'structure_part' },
        { code: 'OUD-SLUIS-BENEDENHOOFD', name: 'Benedenhoofd', type: 'structure_part' }
      ] },
      { code: 'OUD-STUW', name: 'Stuw Oudenaarde', type: 'asset_zone', sort: 20, children: [
        { code: 'OUD-STUW-LINKEROEVER', name: 'Linkeroever', type: 'bank' },
        { code: 'OUD-STUW-RECHTEROEVER', name: 'Rechteroever', type: 'bank' }
      ] },
      { code: 'OUD-VISPASSAGE', name: 'Vispassage Oudenaarde', type: 'asset_zone', sort: 30 },
      { code: 'OUD-DIENSTGEBOUW', name: 'Dienstgebouw Oudenaarde', type: 'building', sort: 40, children: [
        { code: 'OUD-DIENSTGEBOUW-LAAGSPANNING', name: 'Laagspanningslokaal', type: 'technical_space', abbreviation: 'LS' },
        { code: 'OUD-DIENSTGEBOUW-SCADA', name: 'SCADA lokaal', type: 'technical_space' }
      ] },
      { code: 'OUD-KABELGANG-ZUID', name: 'Kabelgang zuid', type: 'cable_route', sort: 50 }
    ] },
    { code: 'KERKHOVE', name: 'Kerkhove', type: 'complex', complexCode: 'KERK', complexName: 'Stuwsluiscomplex Kerkhove', abbreviation: 'KERK', sourcePage: 73, confidence: 'explicit', children: [
      { code: 'KERK-SLUIS', name: 'Sluis Kerkhove', type: 'asset_zone', sort: 10, children: [
        { code: 'KERK-SLUIS-BOVENHOOFD', name: 'Bovenhoofd', type: 'structure_part' },
        { code: 'KERK-SLUIS-BENEDENHOOFD', name: 'Benedenhoofd', type: 'structure_part' },
        { code: 'KERK-SLUIS-KOLK', name: 'Kolkomgeving', type: 'equipment_zone' }
      ] },
      { code: 'KERK-STUW', name: 'Stuw Kerkhove', type: 'asset_zone', sort: 20, children: [
        { code: 'KERK-STUW-LINKEROEVER', name: 'Linkeroever', type: 'bank' },
        { code: 'KERK-STUW-RECHTEROEVER', name: 'Rechteroever', type: 'bank' },
        { code: 'KERK-STUW-KIOSK', name: 'Stuwkiosk', type: 'building', confidence: 'inferred' }
      ] },
      { code: 'KERK-VISPASSAGE', name: 'Vispassage Kerkhove', type: 'asset_zone', sort: 30 },
      { code: 'KERK-DIENSTGEBOUW', name: 'Dienstgebouw Kerkhove', type: 'building', sort: 40, children: [
        { code: 'KERK-DIENSTGEBOUW-TECH', name: 'Technische ruimte', type: 'technical_space' },
        { code: 'KERK-DIENSTGEBOUW-ARCHIEF', name: 'Archieflokaal', type: 'room', confidence: 'derived' }
      ] },
      { code: 'KERK-KABELGANG-WEST', name: 'Kabelgang west', type: 'cable_route', sort: 50 }
    ] }
  ] }
];

const planningResources = [
  ['RES-ENG-ELEC', 'Electrical engineering team', 'team', 'Electrical', 8],
  ['RES-ENG-MECH', 'Mechanical engineering team', 'team', 'Mechanical', 8],
  ['RES-ENG-CIVIL', 'Civil engineering team', 'team', 'Civil', 8],
  ['RES-AUTOMATION', 'Automation specialist', 'person', 'Automation', 7.5],
  ['RES-QA', 'QA and commissioning lead', 'person', 'Quality', 7.5],
  ['RES-SITE', 'Site execution crew', 'team', 'Construction', 8],
  ['RES-PM', 'Project controls manager', 'person', 'Planning', 7.5],
  ['RES-HSE', 'HSE coordinator', 'person', 'Safety', 6]
];

const planningEquipment = [
  ['EQ-LIFT-080T', '80t mobile crane', 'Crane', 'available'],
  ['EQ-GEN-250KVA', '250 kVA temporary generator', 'Power supply', 'available'],
  ['EQ-SCADA-RACK', 'SCADA test rack', 'Automation test bench', 'reserved'],
  ['EQ-PUMP-DEWATER', 'Dewatering pump set', 'Pump set', 'available'],
  ['EQ-SURVEY-SET', 'Survey total station', 'Survey equipment', 'available'],
  ['EQ-LOADBANK', 'Load bank', 'Electrical test equipment', 'available']
];

const workPackageSeed = [
  ['WP-00', 'Project controls and milestones', null, 'Planning'],
  ['WP-10', 'Engineering', null, 'Engineering'],
  ['WP-10.10', 'Civil engineering', 'WP-10', 'Civil'],
  ['WP-10.20', 'Mechanical engineering', 'WP-10', 'Mechanical'],
  ['WP-10.30', 'Electrical and automation engineering', 'WP-10', 'Electrical'],
  ['WP-20', 'Procurement', null, 'Procurement'],
  ['WP-30', 'Site preparation', null, 'Construction'],
  ['WP-40', 'Mechanical installation', null, 'Mechanical'],
  ['WP-50', 'Electrical and automation installation', null, 'Electrical'],
  ['WP-60', 'Testing and commissioning', null, 'Quality'],
  ['WP-70', 'Handover', null, 'Project controls']
];

const milestoneSeed = [
  ['PLN-M-001', '0.1', 'Project baseline approved', 'WP-00', '2026-06-05', 'complete', 100, 'Planning'],
  ['PLN-M-002', '1.4', 'Engineering freeze', 'WP-10', '2026-07-17', 'in_progress', 65, 'Engineering'],
  ['PLN-M-003', '2.4', 'IFC package issued', 'WP-20', '2026-08-14', 'not_started', 0, 'Engineering'],
  ['PLN-M-004', '3.4', 'Site ready', 'WP-30', '2026-09-11', 'not_started', 0, 'Construction'],
  ['PLN-M-005', '4.6', 'Mechanical completion', 'WP-40', '2026-10-23', 'not_started', 0, 'Mechanical'],
  ['PLN-M-006', '6.3', 'Start commissioning', 'WP-60', '2026-11-06', 'not_started', 0, 'Quality'],
  ['PLN-M-007', '7.2', 'PAC issued', 'WP-70', '2026-12-18', 'not_started', 0, 'Project controls'],
  ['PLN-M-008', '7.4', 'FAC issued', 'WP-70', '2027-01-29', 'not_started', 0, 'Project controls']
];

const taskBlueprints = [
  ['PLN-T-001', '1.1', 'Survey existing structures', 'WP-10.10', 0, 10, 'complete', 100, 'Civil', 'ASPER-SLUIS-BOVENHOOFD'],
  ['PLN-T-002', '1.2', 'Civil condition assessment', 'WP-10.10', 8, 18, 'complete', 100, 'Civil', 'ASPER-SLUIS-BENEDENHOOFD'],
  ['PLN-T-003', '1.3', 'Hydraulic interface review', 'WP-10.10', 15, 26, 'in_progress', 75, 'Civil', 'ASPER-STUW-BORDES'],
  ['PLN-T-004', '1.5', 'Mechanical concept update', 'WP-10.20', 6, 20, 'complete', 100, 'Mechanical', 'ASPER-SLUIS-KOLK'],
  ['PLN-T-005', '1.6', 'Gate drive calculations', 'WP-10.20', 19, 33, 'in_progress', 55, 'Mechanical', 'ASPER-SLUIS-KOLK'],
  ['PLN-T-006', '1.7', 'Electrical load list', 'WP-10.30', 4, 16, 'complete', 100, 'Electrical', 'ASPER-DIENSTGEBOUW-TECH-01'],
  ['PLN-T-007', '1.8', 'SCADA architecture update', 'WP-10.30', 16, 31, 'in_progress', 60, 'Automation', 'ASPER-DIENSTGEBOUW-BEDIENING'],
  ['PLN-T-008', '1.9', 'Cable route verification', 'WP-10.30', 24, 36, 'in_progress', 40, 'Electrical', 'ASPER-KABELGANG-NOORD'],
  ['PLN-T-009', '2.1', 'Prepare procurement package', 'WP-20', 38, 49, 'not_started', 0, 'Procurement', 'ASPER'],
  ['PLN-T-010', '2.2', 'Vendor clarification cycle', 'WP-20', 48, 62, 'not_started', 0, 'Procurement', 'ASPER'],
  ['PLN-T-011', '2.3', 'Long lead equipment order', 'WP-20', 60, 78, 'not_started', 0, 'Procurement', 'ASPER'],
  ['PLN-T-012', '2.5', 'Factory acceptance preparation', 'WP-20', 76, 91, 'not_started', 0, 'Quality', 'ASPER'],
  ['PLN-T-013', '3.1', 'Site logistics plan', 'WP-30', 70, 81, 'not_started', 0, 'Construction', 'ASPER'],
  ['PLN-T-014', '3.2', 'Temporary power setup', 'WP-30', 82, 90, 'not_started', 0, 'Electrical', 'ASPER-DIENSTGEBOUW-TECH-01'],
  ['PLN-T-015', '3.3', 'Dewatering setup', 'WP-30', 84, 95, 'not_started', 0, 'Construction', 'ASPER-SLUIS-KOLK'],
  ['PLN-T-016', '3.5', 'Access scaffolding installation', 'WP-30', 92, 101, 'not_started', 0, 'Construction', 'ASPER-SLUIS-BOVENHOOFD'],
  ['PLN-T-017', '4.1', 'Remove existing drive units', 'WP-40', 101, 111, 'not_started', 0, 'Mechanical', 'ASPER-SLUIS-KOLK'],
  ['PLN-T-018', '4.2', 'Install new gate drive frames', 'WP-40', 112, 126, 'not_started', 0, 'Mechanical', 'ASPER-SLUIS-KOLK'],
  ['PLN-T-019', '4.3', 'Align mechanical drive train', 'WP-40', 125, 136, 'not_started', 0, 'Mechanical', 'ASPER-SLUIS-KOLK'],
  ['PLN-T-020', '4.4', 'Mechanical punch walkdown', 'WP-40', 137, 143, 'not_started', 0, 'Quality', 'ASPER-SLUIS-KOLK'],
  ['PLN-T-021', '4.5', 'Close mechanical punch items', 'WP-40', 144, 149, 'not_started', 0, 'Mechanical', 'ASPER-SLUIS-KOLK'],
  ['PLN-T-022', '5.1', 'Install MCC panels', 'WP-50', 110, 121, 'not_started', 0, 'Electrical', 'ASPER-DIENSTGEBOUW-TECH-01'],
  ['PLN-T-023', '5.2', 'Pull power cables', 'WP-50', 118, 133, 'not_started', 0, 'Electrical', 'ASPER-KABELGANG-NOORD'],
  ['PLN-T-024', '5.3', 'Terminate field wiring', 'WP-50', 132, 146, 'not_started', 0, 'Electrical', 'ASPER-SLUIS-KOLK'],
  ['PLN-T-025', '5.4', 'SCADA panel installation', 'WP-50', 136, 148, 'not_started', 0, 'Automation', 'ASPER-DIENSTGEBOUW-BEDIENING'],
  ['PLN-T-026', '5.5', 'Network and PLC configuration', 'WP-50', 146, 158, 'not_started', 0, 'Automation', 'ASPER-DIENSTGEBOUW-BEDIENING'],
  ['PLN-T-027', '6.1', 'Cold commissioning', 'WP-60', 157, 166, 'not_started', 0, 'Quality', 'ASPER'],
  ['PLN-T-028', '6.2', 'Wet commissioning', 'WP-60', 166, 176, 'not_started', 0, 'Quality', 'ASPER-SLUIS-KOLK'],
  ['PLN-T-029', '6.4', 'Operator training', 'WP-60', 176, 182, 'not_started', 0, 'Automation', 'ASPER-DIENSTGEBOUW-BEDIENING'],
  ['PLN-T-030', '6.5', 'Reliability run', 'WP-60', 182, 196, 'not_started', 0, 'Quality', 'ASPER'],
  ['PLN-T-031', '7.1', 'As-built dossier compilation', 'WP-70', 188, 205, 'not_started', 0, 'Project controls', 'ASPER'],
  ['PLN-T-032', '7.3', 'Warranty observation period', 'WP-70', 207, 249, 'not_started', 0, 'Project controls', 'ASPER'],
  ['PLN-T-033', '7.5', 'Final closeout dossier', 'WP-70', 248, 260, 'not_started', 0, 'Project controls', 'ASPER'],
  ['PLN-T-034', '8.1', 'Oudenaarde site survey', 'WP-10.10', 18, 28, 'in_progress', 35, 'Civil', 'OUD-SLUIS-BOVENHOOFD'],
  ['PLN-T-035', '8.2', 'Oudenaarde mechanical interface review', 'WP-10.20', 26, 39, 'not_started', 0, 'Mechanical', 'OUD-SLUIS-BENEDENHOOFD'],
  ['PLN-T-036', '8.3', 'Oudenaarde cable route survey', 'WP-10.30', 30, 42, 'not_started', 0, 'Electrical', 'OUD-KABELGANG-ZUID'],
  ['PLN-T-037', '8.4', 'Oudenaarde procurement addendum', 'WP-20', 45, 58, 'not_started', 0, 'Procurement', 'OUDENAARDE'],
  ['PLN-T-038', '8.5', 'Oudenaarde site readiness review', 'WP-30', 92, 99, 'not_started', 0, 'Construction', 'OUDENAARDE'],
  ['PLN-T-039', '8.6', 'Oudenaarde electrical inspection', 'WP-60', 160, 168, 'not_started', 0, 'Quality', 'OUD-DIENSTGEBOUW-LAAGSPANNING'],
  ['PLN-T-040', '9.1', 'Kerkhove site survey', 'WP-10.10', 22, 32, 'not_started', 0, 'Civil', 'KERK-SLUIS-BOVENHOOFD'],
  ['PLN-T-041', '9.2', 'Kerkhove SCADA cabinet assessment', 'WP-10.30', 34, 45, 'not_started', 0, 'Automation', 'KERK-DIENSTGEBOUW-TECH'],
  ['PLN-T-042', '9.3', 'Kerkhove procurement addendum', 'WP-20', 55, 68, 'not_started', 0, 'Procurement', 'KERKHOVE'],
  ['PLN-T-043', '9.4', 'Kerkhove dewatering readiness', 'WP-30', 96, 104, 'not_started', 0, 'Construction', 'KERK-SLUIS-KOLK'],
  ['PLN-T-044', '9.5', 'Kerkhove commissioning rehearsal', 'WP-60', 172, 181, 'not_started', 0, 'Quality', 'KERKHOVE'],
  ['PLN-T-045', '9.6', 'Multi-site lessons learned', 'WP-70', 230, 240, 'not_started', 0, 'Project controls', 'PROJECT-KANAAL-BOVEN-SCHELDE']
];

function choice(values, index, salt = 0) {
  return values[(index + salt) % values.length];
}

function money(base, index, mod) {
  return (base + (index % mod) * 137.45).toFixed(2);
}

function json(value) {
  return JSON.stringify(value);
}

function dateFrom(index, start = new Date('2024-01-01T00:00:00Z')) {
  const date = new Date(start);
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

async function reset() {
  await client.query(`
    TRUNCATE
      planning_task_documents,
      planning_task_equipment,
      planning_task_resources,
      planning_dependencies,
      planning_tasks,
      planning_equipment,
      planning_resources,
      work_packages,
      audit_events,
      documents,
      time_entries,
      tickets,
      projects,
      customers
    RESTART IDENTITY CASCADE
  `);
}

async function ensureLocationSchema() {
  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await client.query(`
    CREATE TABLE IF NOT EXISTS location_type (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT
    )
  `);
  await client.query(`
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
      CONSTRAINT location_confidence_check CHECK (confidence IN ('explicit', 'derived', 'inferred'))
    )
  `);
  await client.query('CREATE INDEX IF NOT EXISTS idx_location_parent_id ON location(parent_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_location_complex_code ON location(complex_code)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_location_metadata ON location USING gin(metadata)');
}

async function seedLocationNode(node, parentId = null, inheritedComplex = {}, index = 0) {
  const typeResult = await client.query('SELECT id FROM location_type WHERE code = $1', [node.type]);
  const complexCode = node.complexCode ?? inheritedComplex.complexCode ?? null;
  const complexName = node.complexName ?? inheritedComplex.complexName ?? null;
  const result = await client.query(
    `INSERT INTO location (
       parent_id, type_id, code, name, display_name, complex_code, complex_name,
       abbreviation, sort_order, source, source_page, source_section, confidence, metadata, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
     ON CONFLICT (code) DO UPDATE SET
       parent_id = EXCLUDED.parent_id,
       type_id = EXCLUDED.type_id,
       name = EXCLUDED.name,
       display_name = EXCLUDED.display_name,
       complex_code = EXCLUDED.complex_code,
       complex_name = EXCLUDED.complex_name,
       abbreviation = EXCLUDED.abbreviation,
       sort_order = EXCLUDED.sort_order,
       source = EXCLUDED.source,
       source_page = EXCLUDED.source_page,
       source_section = EXCLUDED.source_section,
       confidence = EXCLUDED.confidence,
       metadata = EXCLUDED.metadata,
       updated_at = now()
     RETURNING id`,
    [
      parentId,
      typeResult.rows[0].id,
      node.code,
      node.name,
      `${node.code} - ${node.name}`,
      complexCode,
      complexName,
      node.abbreviation ?? null,
      node.sort ?? index,
      'Bestek locatie-extract',
      node.sourcePage ?? null,
      node.sourceSection ?? null,
      node.confidence ?? 'derived',
      json({ seed: true, sourceHint: 'reviewable JS seed tree' })
    ]
  );

  const nextComplex = { complexCode, complexName };
  for (const [childIndex, child] of (node.children ?? []).entries()) {
    await seedLocationNode(child, result.rows[0].id, nextComplex, childIndex + 1);
  }
}

async function seedLocations() {
  await ensureLocationSchema();
  for (const [code, name] of locationTypes) {
    await client.query(
      `INSERT INTO location_type (code, name)
       VALUES ($1,$2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
      [code, name]
    );
  }

  for (const node of locationSeed) {
    await seedLocationNode(node);
  }
}

async function ensurePlanningSchema() {
  await client.query(`
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
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS planning_resources (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      discipline TEXT NOT NULL,
      capacity_hours_per_day NUMERIC(4,2) NOT NULL DEFAULT 8,
      calendar JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT planning_resources_type_check CHECK (resource_type IN ('person', 'team', 'role'))
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS planning_equipment (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      equipment_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT planning_equipment_status_check CHECK (status IN ('available', 'reserved', 'maintenance', 'unavailable'))
    )
  `);
  await client.query(`
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
      CONSTRAINT planning_tasks_kind_check CHECK (task_kind IN ('task', 'milestone')),
      CONSTRAINT planning_tasks_status_check CHECK (status IN ('not_started', 'in_progress', 'complete', 'blocked')),
      CONSTRAINT planning_tasks_progress_check CHECK (progress BETWEEN 0 AND 100),
      CONSTRAINT planning_tasks_constraint_type_check CHECK (constraint_type IN ('none', 'start_no_earlier_than', 'finish_no_later_than', 'must_start_on', 'must_finish_on')),
      CONSTRAINT planning_tasks_date_order_check CHECK (end_date >= start_date),
      CONSTRAINT planning_tasks_milestone_date_check CHECK (task_kind <> 'milestone' OR start_date = end_date)
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS planning_dependencies (
      id BIGSERIAL PRIMARY KEY,
      predecessor_id BIGINT NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,
      successor_id BIGINT NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,
      dependency_type TEXT NOT NULL DEFAULT 'FS',
      lag_days INTEGER NOT NULL DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT planning_dependencies_type_check CHECK (dependency_type IN ('FS', 'SS', 'FF', 'SF')),
      CONSTRAINT planning_dependencies_no_self_check CHECK (predecessor_id <> successor_id),
      CONSTRAINT planning_dependencies_unique UNIQUE (predecessor_id, successor_id, dependency_type)
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS planning_task_resources (
      task_id BIGINT NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,
      resource_id BIGINT NOT NULL REFERENCES planning_resources(id) ON DELETE CASCADE,
      allocation_percent INTEGER NOT NULL DEFAULT 100,
      role_on_task TEXT NOT NULL DEFAULT 'Assigned',
      PRIMARY KEY (task_id, resource_id),
      CONSTRAINT planning_task_resources_allocation_check CHECK (allocation_percent BETWEEN 1 AND 200)
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS planning_task_equipment (
      task_id BIGINT NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,
      equipment_id BIGINT NOT NULL REFERENCES planning_equipment(id) ON DELETE CASCADE,
      usage_note TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (task_id, equipment_id)
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS planning_task_documents (
      task_id BIGINT NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,
      document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      link_type TEXT NOT NULL DEFAULT 'reference',
      PRIMARY KEY (task_id, document_id)
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_work_packages_project_id ON work_packages(project_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_work_packages_parent_id ON work_packages(parent_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_planning_tasks_project_id ON planning_tasks(project_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_planning_tasks_work_package_id ON planning_tasks(work_package_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_planning_tasks_location_id ON planning_tasks(location_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_planning_tasks_dates ON planning_tasks(start_date, end_date)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_planning_tasks_status ON planning_tasks(status)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_planning_dependencies_predecessor_id ON planning_dependencies(predecessor_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_planning_dependencies_successor_id ON planning_dependencies(successor_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_planning_task_resources_resource_id ON planning_task_resources(resource_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_planning_task_equipment_equipment_id ON planning_task_equipment(equipment_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_planning_task_documents_document_id ON planning_task_documents(document_id)');
}

async function seedCustomers() {
  const ids = [];
  for (let i = 0; i < 80; i += 1) {
    const result = await client.query(
      `INSERT INTO customers (code, name, segment, country, city, annual_revenue, active, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        `CUST-${String(i + 1).padStart(4, '0')}`,
        `${choice(['Northwind', 'Contoso', 'Fabrikam', 'Globex', 'Initech', 'Umbrella', 'Stark', 'Wayne'], i)} ${choice(['Logistics', 'Systems', 'Group', 'Services', 'Labs'], i, 2)}`,
        choice(segments, i),
        choice(countries, i, 1),
        choice(cities, i, 3),
        money(250000, i, 90),
        i % 11 !== 0,
        json({ tier: choice(['gold', 'silver', 'bronze'], i), sla: choice(['24x7', 'business-hours', 'best-effort'], i, 1), onboardingScore: (i * 7) % 100 })
      ]
    );
    ids.push(Number(result.rows[0].id));
  }
  return ids;
}

async function seedProjects(customerIds) {
  const ids = [];
  for (let i = 0; i < 240; i += 1) {
    const result = await client.query(
      `INSERT INTO projects (customer_id, code, name, status, budget, risk_score, tags, settings, starts_on, ends_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        customerIds[i % customerIds.length],
        `PRJ-${String(i + 1).padStart(5, '0')}`,
        `${choice(['Atlas', 'Beacon', 'Copper', 'Delta', 'Echo', 'Falcon'], i)} ${choice(['Migration', 'Portal', 'Insights', 'Automation', 'Operations'], i, 4)}`,
        choice(projectStatuses, i, 2),
        money(35000, i, 420),
        (i * 13) % 100,
        [choice(['finance', 'planning', 'support', 'security', 'reporting'], i), choice(['mui', 'ag-grid', 'postgres', 'api', 'workflow'], i, 3)],
        json({ featureFlags: { advancedFilters: i % 2 === 0, savedViews: true }, cadence: choice(['weekly', 'biweekly', 'monthly'], i) }),
        dateFrom(i % 420),
        i % 5 === 0 ? dateFrom((i % 420) + 180) : null
      ]
    );
    ids.push(Number(result.rows[0].id));
  }
  return ids;
}

async function seedTickets(projectIds) {
  const rows = [];
  for (let i = 0; i < 2400; i += 1) {
    rows.push([
      projectIds[i % projectIds.length],
      `TBL-${String(i + 1).padStart(6, '0')}`,
      `${choice(['Improve', 'Validate', 'Design', 'Refactor', 'Document', 'Investigate'], i)} ${choice(['table search', 'column manager', 'query pipeline', 'audit flow', 'report export'], i, 2)}`,
      `Ticket ${i + 1} bevat context over filtering, relationele data en gebruikersinteractie. Zoektermen zoals contract, budget, planning en risico komen bewust terug.`,
      choice(priorities, i, 1),
      choice(ticketStatuses, i, 2),
      (i % 13) + 1,
      choice(consultants, i, 3),
      json({ source: choice(['support', 'roadmap', 'operations', 'security'], i), impact: (i * 5) % 10 }),
      new Date(Date.UTC(2024, 0, 1 + (i % 620))).toISOString(),
      i % 4 === 0 ? new Date(Date.UTC(2024, 0, 8 + (i % 620))).toISOString() : null
    ]);
  }

  const ids = [];
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const values = [];
    const params = [];
    batch.forEach((row, index) => {
      const offset = index * 11;
      values.push(`($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11})`);
      params.push(...row);
    });
    const result = await client.query(
      `INSERT INTO tickets (project_id, ticket_key, title, description, priority, status, story_points, assignee, payload, opened_at, closed_at)
       VALUES ${values.join(',')}
       RETURNING id`,
      params
    );
    ids.push(...result.rows.map((row) => Number(row.id)));
  }
  return ids;
}

async function seedTimeEntries(ticketIds, projectIds, customerIds) {
  for (let start = 0; start < ROWS; start += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, ROWS - start);
    const values = [];
    const params = [];
    for (let index = 0; index < batchSize; index += 1) {
      const i = start + index;
      const ticketId = ticketIds[i % ticketIds.length];
      const projectId = projectIds[i % projectIds.length];
      const customerId = customerIds[i % customerIds.length];
      const offset = index * 11;
      values.push(`($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11})`);
      params.push(
        ticketId,
        projectId,
        customerId,
        dateFrom(i % 820, new Date('2023-06-01T00:00:00Z')),
        choice(consultants, i),
        choice(roles, i, 2),
        ((i % 9) + 1) * 0.75,
        i % 7 !== 0,
        65 + (i % 11) * 12.5,
        `${choice(['Analyse', 'Implementatie', 'Review', 'Workshop', 'Datamigratie'], i)} voor ${choice(['contract', 'budget', 'planning', 'risico', 'kwaliteit'], i, 4)} met referentie ${i % 997}.`,
        json({ remote: i % 3 !== 0, confidence: (i * 17) % 100, costCenter: `CC-${100 + (i % 25)}`, labels: [choice(['urgent', 'normal', 'blocked', 'validated'], i)] })
      );
    }
    await client.query(
      `INSERT INTO time_entries (ticket_id, project_id, customer_id, work_date, consultant, role, hours, billable, hourly_rate, note, attributes)
       VALUES ${values.join(',')}`,
      params
    );
    process.stdout.write(`Seeded time_entries ${start + batchSize}/${ROWS}\r`);
  }
  process.stdout.write('\n');
}

async function seedDocuments(projectIds) {
  const ids = [];
  for (let i = 0; i < 720; i += 1) {
    const result = await client.query(
      `INSERT INTO documents (project_id, title, markdown_body, doc_type, properties)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [
        projectIds[i % projectIds.length],
        `${choice(['ADR', 'Runbook', 'Research', 'Plan'], i)} ${i + 1}: ${choice(['Search UX', 'Column states', 'Postgres indexes', 'Grid rendering'], i, 2)}`,
        `# Document ${i + 1}\n\nDeze markdown bevat lange tekst voor zoektesten.\n\n- Scope: ${choice(['filtering', 'rendering', 'persistence', 'facets'], i)}\n- Beslissing: gebruik externe MUI controls bovenop AG Grid Community.\n\nExtra context over tabellen, kolommen, unieke waarden en performantie.`,
        choice(docTypes, i),
        json({ reviewed: i % 3 === 0, version: 1 + (i % 8), owner: choice(consultants, i, 5) })
      ]
    );
    ids.push(Number(result.rows[0].id));
  }
  return ids;
}

async function seedAuditEvents() {
  for (let i = 0; i < 5000; i += 1) {
    await client.query(
      `INSERT INTO audit_events (entity_type, entity_id, action, actor, details, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        choice(['customer', 'project', 'ticket', 'time_entry', 'document'], i),
        1 + (i % 2400),
        choice(actions, i),
        choice(consultants, i, 6),
        json({ ip: `10.0.${i % 255}.${(i * 7) % 255}`, userAgent: choice(['browser', 'api', 'worker'], i), diffSize: i % 31 }),
        new Date(Date.UTC(2024, 0, 1 + (i % 700), i % 24, i % 60)).toISOString()
      ]
    );
  }
}

async function seedPlanningResources() {
  const idsByCode = new Map();
  for (const [code, name, resourceType, discipline, capacity] of planningResources) {
    const result = await client.query(
      `INSERT INTO planning_resources (code, name, resource_type, discipline, capacity_hours_per_day, calendar)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [code, name, resourceType, discipline, capacity, json({ workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], seed: true })]
    );
    idsByCode.set(code, Number(result.rows[0].id));
  }
  return idsByCode;
}

async function seedPlanningEquipment() {
  const idsByCode = new Map();
  for (const [code, name, equipmentType, status] of planningEquipment) {
    const result = await client.query(
      `INSERT INTO planning_equipment (code, name, equipment_type, status, metadata)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [code, name, equipmentType, status, json({ seed: true, owner: 'Demo project equipment pool' })]
    );
    idsByCode.set(code, Number(result.rows[0].id));
  }
  return idsByCode;
}

async function seedWorkPackages(projectId) {
  const idsByCode = new Map();
  for (const [index, [code, name, parentCode, discipline]] of workPackageSeed.entries()) {
    const result = await client.query(
      `INSERT INTO work_packages (project_id, parent_id, code, name, discipline, sort_order, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [
        projectId,
        parentCode ? idsByCode.get(parentCode) : null,
        code,
        name,
        discipline,
        (index + 1) * 10,
        json({ seed: true, projectPhase: code.split('-')[1] ?? code })
      ]
    );
    idsByCode.set(code, Number(result.rows[0].id));
  }
  return idsByCode;
}

async function locationIdsByCode() {
  const result = await client.query('SELECT id, code FROM location');
  return new Map(result.rows.map((row) => [row.code, row.id]));
}

function addDays(dateText, days) {
  return dateFrom(days, new Date(`${dateText}T00:00:00Z`));
}

async function insertPlanningTask(projectId, packageIds, locationIds, task) {
  const [
    code,
    wbsCode,
    name,
    packageCode,
    startOffset,
    endOffset,
    status,
    progress,
    discipline,
    locationCode
  ] = task;
  const startDate = addDays('2026-06-01', startOffset);
  const endDate = addDays('2026-06-01', endOffset);
  const result = await client.query(
    `INSERT INTO planning_tasks (
       project_id, work_package_id, location_id, code, wbs_code, name, task_kind,
       status, progress, start_date, end_date, constraint_type, constraint_date,
       discipline, notes, metadata
     )
     VALUES ($1,$2,$3,$4,$5,$6,'task',$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      projectId,
      packageIds.get(packageCode),
      locationIds.get(locationCode) ?? null,
      code,
      wbsCode,
      name,
      status,
      progress,
      startDate,
      endDate,
      startOffset < 95 ? 'start_no_earlier_than' : 'none',
      startOffset < 95 ? startDate : null,
      discipline,
      `Seeded demo task for ${discipline.toLowerCase()} planning validation.`,
      json({ seed: true, source: 'planning demo blueprint', durationDays: endOffset - startOffset })
    ]
  );
  return Number(result.rows[0].id);
}

async function insertMilestone(projectId, packageIds, locationIds, milestone) {
  const [code, wbsCode, name, packageCode, milestoneDate, status, progress, discipline] = milestone;
  const result = await client.query(
    `INSERT INTO planning_tasks (
       project_id, work_package_id, location_id, code, wbs_code, name, task_kind,
       status, progress, start_date, end_date, constraint_type, constraint_date,
       discipline, notes, metadata
     )
     VALUES ($1,$2,$3,$4,$5,$6,'milestone',$7,$8,$9,$9,'must_finish_on',$9,$10,$11,$12)
     RETURNING id`,
    [
      projectId,
      packageIds.get(packageCode),
      locationIds.get('ASPER') ?? null,
      code,
      wbsCode,
      name,
      status,
      progress,
      milestoneDate,
      discipline,
      `Seeded planning milestone: ${name}.`,
      json({ seed: true, milestone: true })
    ]
  );
  return Number(result.rows[0].id);
}

async function seedDependencies(taskIds) {
  const dependencyCodes = [
    ['PLN-M-001', 'PLN-T-001', 'FS', 0],
    ['PLN-M-001', 'PLN-T-004', 'FS', 0],
    ['PLN-M-001', 'PLN-T-006', 'FS', 0],
    ['PLN-T-001', 'PLN-T-002', 'FS', 0],
    ['PLN-T-002', 'PLN-T-003', 'FS', 0],
    ['PLN-T-004', 'PLN-T-005', 'FS', 0],
    ['PLN-T-006', 'PLN-T-007', 'FS', 0],
    ['PLN-T-007', 'PLN-T-008', 'SS', 3],
    ['PLN-T-003', 'PLN-M-002', 'FS', 0],
    ['PLN-T-005', 'PLN-M-002', 'FS', 0],
    ['PLN-T-008', 'PLN-M-002', 'FS', 0],
    ['PLN-M-002', 'PLN-T-009', 'FS', 0],
    ['PLN-T-009', 'PLN-T-010', 'FS', 0],
    ['PLN-T-010', 'PLN-T-011', 'FS', 0],
    ['PLN-T-011', 'PLN-T-012', 'SS', 7],
    ['PLN-T-012', 'PLN-M-003', 'FS', 0],
    ['PLN-M-003', 'PLN-T-013', 'FS', 0],
    ['PLN-T-013', 'PLN-T-014', 'FS', 0],
    ['PLN-T-013', 'PLN-T-015', 'SS', 2],
    ['PLN-T-014', 'PLN-T-016', 'FS', 0],
    ['PLN-T-015', 'PLN-M-004', 'FS', 0],
    ['PLN-T-016', 'PLN-M-004', 'FS', 0],
    ['PLN-M-004', 'PLN-T-017', 'FS', 0],
    ['PLN-T-017', 'PLN-T-018', 'FS', 0],
    ['PLN-T-018', 'PLN-T-019', 'FS', 0],
    ['PLN-T-019', 'PLN-T-020', 'FS', 0],
    ['PLN-T-020', 'PLN-T-021', 'FS', 0],
    ['PLN-T-021', 'PLN-M-005', 'FS', 0],
    ['PLN-M-004', 'PLN-T-022', 'SS', 7],
    ['PLN-T-022', 'PLN-T-023', 'SS', 4],
    ['PLN-T-023', 'PLN-T-024', 'FS', 0],
    ['PLN-T-024', 'PLN-T-025', 'SS', 4],
    ['PLN-T-025', 'PLN-T-026', 'FS', 0],
    ['PLN-M-005', 'PLN-T-027', 'FS', 0],
    ['PLN-T-026', 'PLN-T-027', 'FS', 0],
    ['PLN-T-027', 'PLN-M-006', 'FS', 0],
    ['PLN-M-006', 'PLN-T-028', 'FS', 0],
    ['PLN-T-028', 'PLN-T-029', 'FS', 0],
    ['PLN-T-029', 'PLN-T-030', 'FS', 0],
    ['PLN-T-030', 'PLN-T-031', 'SS', 3],
    ['PLN-T-031', 'PLN-M-007', 'FS', 0],
    ['PLN-M-007', 'PLN-T-032', 'FS', 0],
    ['PLN-T-032', 'PLN-T-033', 'FS', 0],
    ['PLN-T-033', 'PLN-M-008', 'FS', 0],
    ['PLN-M-001', 'PLN-T-034', 'FS', 0],
    ['PLN-T-034', 'PLN-T-035', 'SS', 4],
    ['PLN-T-034', 'PLN-T-036', 'FS', 0],
    ['PLN-T-035', 'PLN-T-037', 'FS', 0],
    ['PLN-T-036', 'PLN-T-037', 'FS', 0],
    ['PLN-M-003', 'PLN-T-038', 'FS', 0],
    ['PLN-T-038', 'PLN-T-039', 'FS', 0],
    ['PLN-M-001', 'PLN-T-040', 'FS', 0],
    ['PLN-T-040', 'PLN-T-041', 'SS', 5],
    ['PLN-T-041', 'PLN-T-042', 'FS', 0],
    ['PLN-M-003', 'PLN-T-043', 'FS', 0],
    ['PLN-T-043', 'PLN-T-044', 'FS', 0],
    ['PLN-M-007', 'PLN-T-045', 'FS', 0],
    ['PLN-T-045', 'PLN-M-008', 'FS', 0]
  ];

  for (const [predecessorCode, successorCode, dependencyType, lagDays] of dependencyCodes) {
    await client.query(
      `INSERT INTO planning_dependencies (predecessor_id, successor_id, dependency_type, lag_days, metadata)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        taskIds.get(predecessorCode),
        taskIds.get(successorCode),
        dependencyType,
        lagDays,
        json({ seed: true })
      ]
    );
  }
}

async function seedTaskRelations(taskIds, resourceIds, equipmentIds, documentIds) {
  const resourceByDiscipline = {
    Civil: 'RES-ENG-CIVIL',
    Mechanical: 'RES-ENG-MECH',
    Electrical: 'RES-ENG-ELEC',
    Automation: 'RES-AUTOMATION',
    Quality: 'RES-QA',
    Construction: 'RES-SITE',
    Procurement: 'RES-PM',
    'Project controls': 'RES-PM',
    Planning: 'RES-PM'
  };
  for (const [index, task] of [...taskBlueprints, ...milestoneSeed].entries()) {
    const code = task[0];
    const discipline = taskBlueprints.includes(task) ? task[8] : task[7];
    const resourceCode = resourceByDiscipline[discipline] ?? 'RES-PM';
    await client.query(
      `INSERT INTO planning_task_resources (task_id, resource_id, allocation_percent, role_on_task)
       VALUES ($1,$2,$3,$4)`,
      [
        taskIds.get(code),
        resourceIds.get(resourceCode),
        code.startsWith('PLN-M-') ? 25 : 100,
        code.startsWith('PLN-M-') ? 'Milestone owner' : 'Primary owner'
      ]
    );

    if (!code.startsWith('PLN-M-') && index % 3 === 0 && resourceCode !== 'RES-PM') {
      await client.query(
        `INSERT INTO planning_task_resources (task_id, resource_id, allocation_percent, role_on_task)
         VALUES ($1,$2,25,'Support')`,
        [taskIds.get(code), resourceIds.get('RES-PM')]
      );
    }

    const documentId = documentIds[index % documentIds.length];
    await client.query(
      `INSERT INTO planning_task_documents (task_id, document_id, link_type)
       VALUES ($1,$2,$3)`,
      [taskIds.get(code), documentId, code.startsWith('PLN-M-') ? 'gate evidence' : 'reference']
    );
  }

  const equipmentByTask = {
    'PLN-T-001': ['EQ-SURVEY-SET'],
    'PLN-T-014': ['EQ-GEN-250KVA'],
    'PLN-T-015': ['EQ-PUMP-DEWATER'],
    'PLN-T-017': ['EQ-LIFT-080T'],
    'PLN-T-018': ['EQ-LIFT-080T'],
    'PLN-T-026': ['EQ-SCADA-RACK'],
    'PLN-T-027': ['EQ-SCADA-RACK', 'EQ-LOADBANK'],
    'PLN-T-028': ['EQ-SCADA-RACK', 'EQ-PUMP-DEWATER'],
    'PLN-T-030': ['EQ-SCADA-RACK'],
    'PLN-T-034': ['EQ-SURVEY-SET'],
    'PLN-T-039': ['EQ-LOADBANK'],
    'PLN-T-043': ['EQ-PUMP-DEWATER'],
    'PLN-T-044': ['EQ-SCADA-RACK']
  };
  for (const [taskCode, equipmentCodes] of Object.entries(equipmentByTask)) {
    for (const equipmentCode of equipmentCodes) {
      await client.query(
        `INSERT INTO planning_task_equipment (task_id, equipment_id, usage_note)
         VALUES ($1,$2,$3)`,
        [taskIds.get(taskCode), equipmentIds.get(equipmentCode), 'Seeded equipment assignment for timeline validation']
      );
    }
  }
}

async function seedPlanning(projectIds, documentIds) {
  const projectId = projectIds[0];
  const packageIds = await seedWorkPackages(projectId);
  const resourceIds = await seedPlanningResources();
  const equipmentIds = await seedPlanningEquipment();
  const locations = await locationIdsByCode();
  const taskIds = new Map();

  for (const milestone of milestoneSeed) {
    taskIds.set(milestone[0], await insertMilestone(projectId, packageIds, locations, milestone));
  }
  for (const task of taskBlueprints) {
    taskIds.set(task[0], await insertPlanningTask(projectId, packageIds, locations, task));
  }

  await seedDependencies(taskIds);
  await seedTaskRelations(taskIds, resourceIds, equipmentIds, documentIds);
  console.log(`Seeded planning: ${taskIds.size} planning objects, ${planningResources.length} resources, ${planningEquipment.length} equipment items.`);
}

async function main() {
  await client.connect();
  await ensureLocationSchema();
  await ensurePlanningSchema();
  await reset();
  const customerIds = await seedCustomers();
  const projectIds = await seedProjects(customerIds);
  const ticketIds = await seedTickets(projectIds);
  await seedTimeEntries(ticketIds, projectIds, customerIds);
  const documentIds = await seedDocuments(projectIds);
  await seedAuditEvents();
  await seedLocations();
  await seedPlanning(projectIds, documentIds);
  await client.query('ANALYZE');
  await client.end();
  console.log(`Seed complete: ${ROWS} time entries plus related data.`);
}

main().catch(async (error) => {
  console.error(error);
  await client.end().catch(() => {});
  process.exit(1);
});

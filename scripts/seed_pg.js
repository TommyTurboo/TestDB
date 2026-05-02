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
    TRUNCATE audit_events, documents, time_entries, tickets, projects, customers
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
  for (let i = 0; i < 720; i += 1) {
    await client.query(
      `INSERT INTO documents (project_id, title, markdown_body, doc_type, properties)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        projectIds[i % projectIds.length],
        `${choice(['ADR', 'Runbook', 'Research', 'Plan'], i)} ${i + 1}: ${choice(['Search UX', 'Column states', 'Postgres indexes', 'Grid rendering'], i, 2)}`,
        `# Document ${i + 1}\n\nDeze markdown bevat lange tekst voor zoektesten.\n\n- Scope: ${choice(['filtering', 'rendering', 'persistence', 'facets'], i)}\n- Beslissing: gebruik externe MUI controls bovenop AG Grid Community.\n\nExtra context over tabellen, kolommen, unieke waarden en performantie.`,
        choice(docTypes, i),
        json({ reviewed: i % 3 === 0, version: 1 + (i % 8), owner: choice(consultants, i, 5) })
      ]
    );
  }
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

async function main() {
  await client.connect();
  await reset();
  const customerIds = await seedCustomers();
  const projectIds = await seedProjects(customerIds);
  const ticketIds = await seedTickets(projectIds);
  await seedTimeEntries(ticketIds, projectIds, customerIds);
  await seedDocuments(projectIds);
  await seedAuditEvents();
  await seedLocations();
  await client.query('ANALYZE');
  await client.end();
  console.log(`Seed complete: ${ROWS} time entries plus related data.`);
}

main().catch(async (error) => {
  console.error(error);
  await client.end().catch(() => {});
  process.exit(1);
});

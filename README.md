# TestDB Table Lab

Sandbox voor AG Grid Community + Material UI patronen rond grote relationele testdata op PostgreSQL.

## Start

```powershell
docker compose up -d postgres
docker compose run --rm api npm run seed
docker compose up -d api web
```

Open daarna `http://localhost:5173`.

## Wat zit erin?

- PostgreSQL database met relationele tabellen: `customers`, `projects`, `tickets`, `time_entries`, `documents`, plus `audit_events`.
- Grote tabel `time_entries` met standaard 50.000 records om rendering, zoeken en server-side querygedrag te testen.
- API met paging, sortering, globale search, kolom-scoped search en unique-value lijsten.
- React/MUI/AG Grid UI met column manager, zichtbaarheid, pseudo-pinning, drag/drop volgorde, quick filters en saved views.

## Lokaal zonder Docker

Zet eerst PostgreSQL klaar en configureer `.env` of omgevingsvariabelen op basis van `.env.example`.

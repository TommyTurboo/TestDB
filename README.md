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

## Bundle-grootte controleren

De Vite build toont de gegenereerde assets en chunk-groottes. Draai na wijzigingen:

```powershell
npm run build
npm run bundle:size
```

`npm run bundle:size` leest de bestaande bestanden in `dist/assets` en vat de JavaScript chunks samen met raw en gzip-groottes. De check is informatief en faalt de build niet; gebruik hem in reviews om te zien of de initiele `index-*.js` chunk en de lazy `LocationsPage-*.js` chunk logisch blijven.

Referentie voor de lazy-loading refactor: de oude single-entry JavaScript bundle was ongeveer 1,65 MB. Na de refactor hoort de initiele `index-*.js` onder die baseline te blijven en hoort locatie-specifieke code zichtbaar te zijn als aparte `LocationsPage-*.js` lazy chunk.

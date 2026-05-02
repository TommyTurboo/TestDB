import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AgGridReact } from 'ag-grid-react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AppBar,
  Autocomplete,
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  CssBaseline,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputAdornment,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  ThemeProvider,
  Toolbar,
  Tooltip,
  Typography,
  createTheme
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import SearchIcon from '@mui/icons-material/Search';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import TuneIcon from '@mui/icons-material/Tune';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const STORAGE_KEY = 'table-lab-view-state-v1';
const FULL_GRID_LIMIT = 100000;

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#174E4F' },
    secondary: { main: '#C0632B' },
    background: { default: '#F4F0E8', paper: '#FFFDF8' }
  },
  typography: {
    fontFamily: '"Aptos", "Segoe UI", sans-serif',
    h4: { fontWeight: 800, letterSpacing: '-0.04em' },
    h6: { fontWeight: 800 },
    button: { fontWeight: 800, textTransform: 'none' }
  },
  shape: { borderRadius: 14 }
});

function defaultState(schema) {
  const table = 'time_entries';
  const columns = schema[table].columns.map((column, index) => ({
    ...column,
    visible: true,
    order: index,
    pin: column.pinned ?? null
  }));

  return {
    table,
    columns,
    quick: '',
    scopedColumns: [],
    selectedFacet: 'consultant',
    facets: {},
    pageSize: 100,
    page: 0,
    sort: [{ field: 'work_date', direction: 'desc' }],
    savedViews: []
  };
}

function loadState(schema) {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return defaultState(schema);
  try {
    const parsed = JSON.parse(saved);
    const table = parsed.table && schema[parsed.table] ? parsed.table : 'time_entries';
    const base = defaultState(schema);
    const mergedColumns = schema[table].columns.map((column, index) => {
      const previous = parsed.columns?.find((item) => item.field === column.field);
      return {
        ...column,
        visible: previous?.visible ?? true,
        order: previous?.order ?? index,
        pin: previous?.pin ?? column.pinned ?? null
      };
    });
    return { ...base, ...parsed, table, columns: mergedColumns };
  } catch {
    return defaultState(schema);
  }
}

function stateForTable(schema, table) {
  return {
    ...defaultState(schema),
    table,
    columns: schema[table].columns.map((column, index) => ({
      ...column,
      visible: true,
      order: index,
      pin: column.pinned ?? null
    })),
    selectedFacet: schema[table].columns[0].field
  };
}

function PinStateIcon({ pin }) {
  if (pin === 'left') return <PushPinIcon fontSize="inherit" className="pin-left" />;
  if (pin === 'right') return <PushPinIcon fontSize="inherit" className="pin-right" />;
  return <PushPinOutlinedIcon fontSize="inherit" className="pin-none" />;
}

function pinLabel(pin) {
  if (pin === 'left') return 'Pinned links';
  if (pin === 'right') return 'Pinned rechts';
  return 'Niet gepinned';
}

function SortableColumn({ column, onToggle, onCyclePin }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: column.field });
  return (
    <ListItem
      ref={setNodeRef}
      dense
      className="column-item"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      secondaryAction={
        <Tooltip title={`${pinLabel(column.pin)}. Klik voor volgende pin-status.`}>
          <IconButton
            size="small"
            color={column.pin ? 'secondary' : 'default'}
            className="pin-cycle-button"
            onClick={() => onCyclePin(column.field)}
          >
            <PinStateIcon pin={column.pin} />
          </IconButton>
        </Tooltip>
      }
    >
      <IconButton size="small" {...attributes} {...listeners}>
        <DragIndicatorIcon fontSize="small" />
      </IconButton>
      <Checkbox checked={column.visible} onChange={() => onToggle(column.field)} />
      <ListItemText primary={column.label} secondary={`${column.type} · ${pinLabel(column.pin)}`} />
    </ListItem>
  );
}

function highlight(value, term) {
  if (!term || value == null) return String(value ?? '');
  const source = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const index = source.toLowerCase().indexOf(term.toLowerCase());
  if (index < 0) return source;
  return (
    <>
      {source.slice(0, index)}
      <mark>{source.slice(index, index + term.length)}</mark>
      {source.slice(index + term.length)}
    </>
  );
}

function App() {
  const [schema, setSchema] = useState(null);
  const [state, setState] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [timing, setTiming] = useState({});
  const [stats, setStats] = useState([]);
  const [facetValues, setFacetValues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('columns');
  const [controlOpen, setControlOpen] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/schema`).then((response) => response.json()),
      fetch(`${API_BASE}/api/stats`).then((response) => response.json()).catch(() => ({ tables: [] }))
    ]).then(([schemaPayload, statsPayload]) => {
      setSchema(schemaPayload);
      setState(loadState(schemaPayload));
      setStats(statsPayload.tables ?? []);
    });
  }, []);

  useEffect(() => {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const orderedColumns = useMemo(() => {
    if (!state) return [];
    return [...state.columns].sort((a, b) => {
      const pinRank = { left: 0, null: 1, right: 2 };
      const aRank = pinRank[a.pin ?? 'null'];
      const bRank = pinRank[b.pin ?? 'null'];
      return aRank === bRank ? a.order - b.order : aRank - bRank;
    });
  }, [state]);

  const columnDefs = useMemo(() => orderedColumns
    .filter((column) => column.visible)
    .map((column) => ({
      field: column.field,
      headerName: column.label,
      width: column.width,
      pinned: column.pin,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => highlight(params.value, state?.quick),
      valueFormatter: (params) => (typeof params.value === 'object' ? JSON.stringify(params.value) : params.value)
    })), [orderedColumns, state?.quick]);

  useEffect(() => {
    if (!state) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      table: state.table,
      limit: String(FULL_GRID_LIMIT),
      offset: '0',
      sort: JSON.stringify(state.sort),
      scoped: JSON.stringify(state.scopedColumns),
      facets: JSON.stringify(state.facets)
    });
    if (state.quick) params.set('q', state.quick);
    setLoading(true);
    fetch(`${API_BASE}/api/rows?${params}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        setRows(payload.rows ?? []);
        setTotal(payload.total ?? 0);
        setTiming(payload.timing ?? {});
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [state?.table, state?.quick, JSON.stringify(state?.scopedColumns), JSON.stringify(state?.sort), JSON.stringify(state?.facets)]);

  useEffect(() => {
    if (!state?.selectedFacet) return;
    const params = new URLSearchParams({
      table: state.table,
      field: state.selectedFacet,
      scoped: JSON.stringify(state.scopedColumns),
      facets: JSON.stringify({})
    });
    if (state.quick) params.set('q', state.quick);
    fetch(`${API_BASE}/api/facets?${params}`)
      .then((response) => response.json())
      .then((payload) => setFacetValues(payload.values ?? []));
  }, [state?.table, state?.selectedFacet, state?.quick, JSON.stringify(state?.scopedColumns)]);

  if (!schema || !state) {
    return <LinearProgress />;
  }

  const tableColumns = schema[state.table].columns;
  const sortableColumnFields = [...state.columns].sort((a, b) => a.order - b.order).map((column) => column.field);
  const sortableColumns = [...state.columns].sort((a, b) => a.order - b.order);
  const visibleCount = state.columns.filter((column) => column.visible).length;
  const visibleSearchableColumns = state.columns.filter((column) => column.visible && ['text', 'long_text', 'markdown', 'jsonb'].includes(column.type));
  const selectedFacetValues = state.facets[state.selectedFacet] ?? [];

  function updateColumns(updater) {
    setState((current) => ({ ...current, columns: updater(current.columns), page: 0 }));
  }

  function toggleColumn(field) {
    setState((current) => {
      const currentColumn = current.columns.find((column) => column.field === field);
      const nextVisible = !currentColumn?.visible;
      return {
        ...current,
        page: 0,
        columns: current.columns.map((column) => column.field === field ? { ...column, visible: nextVisible } : column),
        scopedColumns: nextVisible ? current.scopedColumns : current.scopedColumns.filter((columnField) => columnField !== field)
      };
    });
  }

  function cyclePinColumn(field) {
    const nextPin = { null: 'left', left: 'right', right: null };
    updateColumns((columns) => columns.map((column) => {
      if (column.field !== field) return column;
      return { ...column, pin: nextPin[column.pin ?? 'null'] };
    }));
  }

  function onDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    updateColumns((columns) => {
      const sorted = [...columns].sort((a, b) => a.order - b.order);
      const oldIndex = sorted.findIndex((column) => column.field === active.id);
      const newIndex = sorted.findIndex((column) => column.field === over.id);
      return arrayMove(sorted, oldIndex, newIndex).map((column, order) => ({ ...column, order }));
    });
  }

  function resetView() {
    setState(defaultState(schema));
  }

  function saveView() {
    const name = `View ${state.savedViews.length + 1}`;
    setState((current) => ({
      ...current,
      savedViews: [...current.savedViews, { name, createdAt: new Date().toISOString(), snapshot: current }]
    }));
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box className="app-shell">
        <AppBar position="static" color="transparent" elevation={0}>
          <Toolbar className="topbar">
            <Box>
              <Typography variant="h4">Table Interaction Lab</Typography>
              <Typography color="text.secondary">PostgreSQL + AG Grid Community + Material UI control layer</Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              {stats.map((item) => <Chip key={item.table_name} label={`${item.table_name}: ${item.total.toLocaleString('nl-BE')}`} />)}
            </Stack>
          </Toolbar>
        </AppBar>

        <Stack direction="row" spacing={2} className="workspace">
          <Paper className={controlOpen ? 'main-panel' : 'main-panel main-panel-full'} elevation={0}>
            <Stack direction="row" spacing={1.5} alignItems="center" className="query-bar">
              <FormControl size="small" sx={{ minWidth: 190 }}>
                <Select value={state.table} onChange={(event) => setState(stateForTable(schema, event.target.value))}>
                  {Object.entries(schema).map(([key, config]) => <MenuItem key={key} value={key}>{config.label}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField
                size="small"
                value={state.quick}
                onChange={(event) => setState((current) => ({ ...current, quick: event.target.value, page: 0 }))}
                placeholder="Globale quickfilter doorheen zichtbare data"
                sx={{ flex: 1 }}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>
                }}
              />
              <Autocomplete
                multiple
                size="small"
                options={visibleSearchableColumns}
                getOptionLabel={(option) => option.label}
                value={visibleSearchableColumns.filter((column) => state.scopedColumns.includes(column.field))}
                onChange={(_, value) => setState((current) => ({ ...current, scopedColumns: value.map((column) => column.field), page: 0 }))}
                renderInput={(params) => <TextField {...params} label="Zoek enkel in zichtbare kolommen" />}
                sx={{ width: 420 }}
              />
              <Tooltip title="Sla huidige view op in localStorage">
                <IconButton onClick={saveView} color="primary"><SaveIcon /></IconButton>
              </Tooltip>
              <Tooltip title={controlOpen ? 'Controls verbergen' : 'Controls tonen'}>
                <IconButton
                  onClick={() => setControlOpen((open) => !open)}
                  color={controlOpen ? 'secondary' : 'primary'}
                >
                  <TuneIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Reset view">
                <IconButton onClick={resetView}><RestartAltIcon /></IconButton>
              </Tooltip>
            </Stack>

            {loading && <LinearProgress />}
            <Box className="ag-theme-quartz grid-box">
              <AgGridReact
                rowData={rows}
                columnDefs={columnDefs}
                rowHeight={44}
                headerHeight={48}
                suppressDragLeaveHidesColumns
                onSortChanged={(event) => {
                  const sortModel = event.api.getColumnState()
                    .filter((column) => column.sort)
                    .map((column) => ({ field: column.colId, direction: column.sort }));
                  if (sortModel.length) setState((current) => ({ ...current, sort: sortModel, page: 0 }));
                }}
              />
            </Box>

            <Stack direction="row" justifyContent="space-between" alignItems="center" className="footer-bar">
              <Typography color="text.secondary">
                {total.toLocaleString('nl-BE')} records · rows {timing.rowsMs ?? '-'} ms · count {timing.countMs ?? '-'} ms
              </Typography>
              <Chip label={`${rows.length.toLocaleString('nl-BE')} rijen geladen in de grid`} color={rows.length === total ? 'success' : 'warning'} />
            </Stack>
          </Paper>

          {controlOpen && <Drawer variant="permanent" anchor="right" PaperProps={{ className: 'control-drawer' }}>
            <Stack spacing={2} className="drawer-content">
              <Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="h6">Control layer</Typography>
                  <Button size="small" onClick={() => setControlOpen(false)}>Hide</Button>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  AG Grid blijft de renderer; MUI bootst enterprise-achtige bediening erbuiten na.
                </Typography>
              </Box>
              <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable">
                <Tab value="columns" icon={<Badge badgeContent={visibleCount} color="secondary"><ViewColumnIcon /></Badge>} label="Columns" />
                <Tab value="values" label="Values" />
                <Tab value="views" label="Views" />
              </Tabs>
              <Divider />

              {tab === 'columns' && (
                <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                  <SortableContext items={sortableColumnFields} strategy={verticalListSortingStrategy}>
                    <List dense>
                      {sortableColumns.map((column) => (
                        <SortableColumn key={column.field} column={column} onToggle={toggleColumn} onCyclePin={cyclePinColumn} />
                      ))}
                    </List>
                  </SortableContext>
                </DndContext>
              )}

              {tab === 'values' && (
                <Stack spacing={1.5}>
                  <TextField
                    select
                    size="small"
                    label="Unieke waarden voor kolom"
                    value={state.selectedFacet}
                    onChange={(event) => setState((current) => ({ ...current, selectedFacet: event.target.value }))}
                  >
                    {tableColumns.map((column) => <MenuItem key={column.field} value={column.field}>{column.label}</MenuItem>)}
                  </TextField>
                  <List dense className="facet-list">
                    {facetValues.map((item) => {
                      const selected = selectedFacetValues.includes(item.value);
                      return (
                        <ListItemButton
                          key={item.value}
                          selected={selected}
                          onClick={() => setState((current) => {
                            const values = current.facets[current.selectedFacet] ?? [];
                            const next = selected ? values.filter((value) => value !== item.value) : [...values, item.value];
                            return { ...current, page: 0, facets: { ...current.facets, [current.selectedFacet]: next } };
                          })}
                        >
                          <ListItemText primary={item.value || '(leeg)'} secondary={`${item.count.toLocaleString('nl-BE')} records`} />
                          <Checkbox edge="end" checked={selected} />
                        </ListItemButton>
                      );
                    })}
                  </List>
                </Stack>
              )}

              {tab === 'views' && (
                <Stack spacing={1.2}>
                  <Button variant="contained" startIcon={<SaveIcon />} onClick={saveView}>Bewaar huidige view</Button>
                  {state.savedViews.length === 0 && <Typography color="text.secondary">Nog geen views opgeslagen.</Typography>}
                  {state.savedViews.map((view, index) => (
                    <Paper key={`${view.name}-${view.createdAt}`} variant="outlined" className="saved-view">
                      <Typography fontWeight={800}>{view.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{new Date(view.createdAt).toLocaleString('nl-BE')}</Typography>
                      <Button size="small" onClick={() => setState({ ...view.snapshot, savedViews: state.savedViews })}>Herstel</Button>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Stack>
          </Drawer>}
        </Stack>
      </Box>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(<App />);

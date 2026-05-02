import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AgGridReact } from 'ag-grid-react';
import { Tree } from 'react-arborist';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Alert,
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
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ApartmentIcon from '@mui/icons-material/Apartment';
import ArchitectureIcon from '@mui/icons-material/Architecture';
import BusinessIcon from '@mui/icons-material/Business';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LayersIcon from '@mui/icons-material/Layers';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import PlaceIcon from '@mui/icons-material/Place';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import RouteIcon from '@mui/icons-material/Route';
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
const LOCATION_TREE_ROW_HEIGHT = 42;

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

function confidenceColor(confidence) {
  if (confidence === 'explicit') return 'success';
  if (confidence === 'inferred') return 'warning';
  return 'default';
}

const locationBaseColumns = [
  { field: 'code', label: 'Code', type: 'text', width: 155 },
  { field: 'name', label: 'Naam', type: 'text', width: 220 },
  { field: 'type', label: 'Type', type: 'text', width: 155 },
  { field: 'complexName', label: 'Complex', type: 'text', width: 230 },
  { field: 'parentName', label: 'Parent', type: 'text', width: 220 },
  { field: 'confidence', label: 'Confidence', type: 'text', width: 135 },
  { field: 'sourcePage', label: 'Bronpagina', type: 'number', width: 120 },
  { field: 'abbreviation', label: 'Afkorting', type: 'text', width: 120 },
  { field: 'childCount', label: 'Kinderen', type: 'number', width: 110 },
  { field: 'metadata', label: 'Metadata', type: 'jsonb', width: 260 }
];

function defaultLocationColumns() {
  return locationBaseColumns.map((column, index) => ({
    ...column,
    visible: !['metadata', 'abbreviation'].includes(column.field),
    order: index,
    pin: column.field === 'code' ? 'left' : null
  }));
}

function matchesLocationQuery(row, quick, scopedColumns) {
  if (!quick) return true;
  const term = quick.toLowerCase();
  const fields = scopedColumns.length ? scopedColumns : ['code', 'name', 'type', 'complexName', 'complexCode', 'parentName', 'confidence', 'metadata'];
  return fields.some((field) => String(typeof row[field] === 'object' ? JSON.stringify(row[field]) : row[field] ?? '').toLowerCase().includes(term));
}

function matchesTreeQuery(node, query) {
  if (!query) return true;
  const term = query.toLowerCase();
  return [node.name, node.code, node.type, node.typeName, node.complexName]
    .some((value) => String(value ?? '').toLowerCase().includes(term));
}

function filterTreeNodes(nodes, query, confidenceFilter) {
  return nodes
    .map((node) => {
      const children = node.children ? filterTreeNodes(node.children, query, confidenceFilter) : [];
      const confidenceMatches = confidenceFilter === 'all' || node.confidence === confidenceFilter;
      const nodeMatches = matchesTreeQuery(node, query) && confidenceMatches;
      if (!nodeMatches && children.length === 0) return null;
      return { ...node, children: children.length ? children : undefined };
    })
    .filter(Boolean);
}

function buildOpenState(nodes, expandAll = false, depth = 0, state = {}) {
  nodes.forEach((node) => {
    if (node.children?.length && (expandAll || depth < 2)) {
      state[node.id] = true;
      buildOpenState(node.children, expandAll, depth + 1, state);
    }
  });
  return state;
}

function buildBreadcrumb(row, rows) {
  if (!row) return [];
  const byId = new Map(rows.map((item) => [item.id, item]));
  const trail = [];
  let current = row;
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    trail.unshift(current);
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return trail;
}

function wouldCreateLocationCycle(rows, id, parentId) {
  if (!id || !parentId) return false;
  if (id === parentId) return true;
  const childrenByParent = rows.reduce((map, row) => {
    if (!row.parentId) return map;
    map.set(row.parentId, [...(map.get(row.parentId) ?? []), row.id]);
    return map;
  }, new Map());
  const stack = [...(childrenByParent.get(id) ?? [])];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (current === parentId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(childrenByParent.get(current) ?? []));
  }
  return false;
}

function locationTypeIcon(type) {
  if (type === 'project') return <AccountTreeIcon fontSize="small" />;
  if (type === 'complex') return <ApartmentIcon fontSize="small" />;
  if (type === 'building') return <BusinessIcon fontSize="small" />;
  if (type === 'room' || type === 'technical_space') return <MeetingRoomIcon fontSize="small" />;
  if (type === 'structure_part') return <ArchitectureIcon fontSize="small" />;
  if (type === 'cable_route') return <RouteIcon fontSize="small" />;
  if (type === 'bank' || type === 'equipment_zone' || type === 'asset_zone') return <LayersIcon fontSize="small" />;
  return <PlaceIcon fontSize="small" />;
}

function shortTypeLabel(typeName, type) {
  const value = typeName ?? type;
  const labels = {
    Project: 'Project',
    Stuwsluiscomplex: 'Complex',
    Installatiezone: 'Zone',
    Gebouw: 'Gebouw',
    Lokaal: 'Lokaal',
    'Technische ruimte': 'Tech.',
    Oever: 'Oever',
    Constructiedeel: 'Deel',
    Kabelroute: 'Kabel',
    Uitrustingszone: 'Uitrusting'
  };
  return labels[value] ?? value;
}

const confidenceLabels = {
  explicit: 'Explicit',
  derived: 'Derived',
  inferred: 'Inferred'
};

function LocationNode({ node, style, dragHandle }) {
  const data = node.data;
  const hasChildren = !node.isLeaf;
  const childCount = data.children?.length ?? 0;
  const levelClass = `level-${Math.min(node.level ?? 0, 4)}`;
  const confidenceKey = data.confidence ?? 'unknown';
  const confidenceLabel = confidenceLabels[confidenceKey] ?? confidenceKey;
  return (
    <div style={style} className={`location-node type-${data.type} confidence-${data.confidence} ${levelClass} ${node.isSelected ? 'selected' : ''}`}>
      <button
        type="button"
        className={`tree-toggle ${hasChildren ? 'has-children' : 'is-leaf'} ${node.isOpen ? 'is-open' : ''}`}
        onClick={(event) => {
          event.stopPropagation();
          if (hasChildren) node.toggle();
        }}
        disabled={!hasChildren}
        aria-label={hasChildren ? (node.isOpen ? 'Locatie inklappen' : 'Locatie uitklappen') : undefined}
      >
        <ChevronRightIcon fontSize="small" />
      </button>
      <div ref={dragHandle} className="tree-node-main">
        <span className="tree-node-icon">{locationTypeIcon(data.type)}</span>
        <div className="tree-node-copy">
          <span className="tree-node-title" title={`${data.code} - ${data.name}`}>{data.name}</span>
          <span className="tree-node-subtitle" title={`${data.code} - ${shortTypeLabel(data.typeName, data.type)}`}>
            <span className="tree-node-code">{data.code}</span>
            <span className="tree-node-type">{shortTypeLabel(data.typeName, data.type)}</span>
          </span>
        </div>
      </div>
      <div className="tree-node-badges">
        {childCount > 0 && <span className="tree-count-badge" title="Aantal onderliggende locaties">{childCount}</span>}
        <span className={`confidence-badge ${confidenceKey}`} title={`${confidenceKey?.slice(0, 1).toUpperCase() ?? '-'} = ${confidenceLabel}`}>
          {confidenceKey?.slice(0, 1) ?? '-'}
        </span>
      </div>
    </div>
  );
}

function LocationsPage() {
  const [queryText, setQueryText] = useState('');
  const [treeSearch, setTreeSearch] = useState('');
  const [treeConfidenceFilter, setTreeConfidenceFilter] = useState('all');
  const [rows, setRows] = useState([]);
  const [treeNodes, setTreeNodes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [treeOpen, setTreeOpen] = useState(true);
  const [controlOpen, setControlOpen] = useState(true);
  const [detailTab, setDetailTab] = useState('overview');
  const [columns, setColumns] = useState(defaultLocationColumns);
  const [scopedColumns, setScopedColumns] = useState([]);
  const [sort, setSort] = useState([{ field: 'code', direction: 'asc' }]);
  const [layoutWidths, setLayoutWidths] = useState({ tree: 380, controls: 360, detail: 340 });
  const locationGridRef = useRef(null);
  const treeBoxRef = useRef(null);
  const [treeViewportHeight, setTreeViewportHeight] = useState(320);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const selected = rows.find((row) => row.id === selectedId) ?? rows[0];
  const selectedChildren = selected ? rows.filter((row) => row.parentId === selected.id) : [];
  const selectedBreadcrumb = useMemo(() => buildBreadcrumb(selected, rows), [selected, rows]);
  const filteredTreeNodes = useMemo(
    () => filterTreeNodes(treeNodes, treeSearch, treeConfidenceFilter),
    [treeNodes, treeSearch, treeConfidenceFilter]
  );
  const treeInitialOpenState = useMemo(
    () => buildOpenState(filteredTreeNodes, Boolean(treeSearch || treeConfidenceFilter !== 'all')),
    [filteredTreeNodes, treeSearch, treeConfidenceFilter]
  );
  const visibleSearchableColumns = columns.filter((column) => column.visible && ['text', 'jsonb'].includes(column.type));
  const filteredRows = useMemo(() => rows.filter((row) => matchesLocationQuery(row, queryText, scopedColumns)), [rows, queryText, scopedColumns]);
  const orderedLocationColumns = useMemo(() => [...columns].sort((a, b) => {
    const pinRank = { left: 0, null: 1, right: 2 };
    const aRank = pinRank[a.pin ?? 'null'];
    const bRank = pinRank[b.pin ?? 'null'];
    return aRank === bRank ? a.order - b.order : aRank - bRank;
  }), [columns]);
  const locationColumnDefs = useMemo(() => orderedLocationColumns
    .filter((column) => column.visible)
    .map((column) => ({
      field: column.field,
      headerName: column.label,
      width: column.width,
      pinned: column.pin,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        if (column.field === 'confidence') return <Chip size="small" color={confidenceColor(params.value)} label={params.value} />;
        return highlight(params.value, queryText);
      },
      valueFormatter: (params) => (typeof params.value === 'object' ? JSON.stringify(params.value) : params.value)
    })), [orderedLocationColumns, queryText]);

  function loadLocations() {
    setLoading(true);
    setError('');
    Promise.all([
      fetch(`${API_BASE}/api/locations`).then((response) => response.json()),
      fetch(`${API_BASE}/api/locations/tree`).then((response) => response.json())
    ])
      .then(([listPayload, treePayload]) => {
        if (listPayload.error) throw new Error(listPayload.error);
        if (treePayload.error) throw new Error(treePayload.error);
        setRows(listPayload.rows ?? []);
        setTreeNodes(treePayload.nodes ?? []);
        setSelectedId((current) => current ?? listPayload.rows?.[0]?.id ?? null);
      })
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    const element = treeBoxRef.current;
    if (!element || !treeOpen) return undefined;

    const updateTreeHeight = () => {
      setTreeViewportHeight(Math.max(240, Math.floor(element.clientHeight)));
    };

    updateTreeHeight();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateTreeHeight);
      return () => window.removeEventListener('resize', updateTreeHeight);
    }

    const observer = new ResizeObserver(updateTreeHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [treeOpen]);

  useEffect(() => {
    const api = locationGridRef.current?.api;
    if (!api || !selectedId) return;
    api.forEachNode((rowNode) => rowNode.setSelected(rowNode.data?.id === selectedId));
    api.redrawRows();
  }, [selectedId, filteredRows]);

  async function moveLocation({ dragIds, parentId }) {
    const id = dragIds[0];
    const row = rows.find((item) => item.id === id);
    if (!row) return;
    if (wouldCreateLocationCycle(rows, id, parentId)) {
      setError('Deze verplaatsing zou een cyclische locatieboom maken en is geblokkeerd.');
      return;
    }
    setError('');
    const response = await fetch(`${API_BASE}/api/locations/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...row, parentId: parentId || null, typeCode: row.typeCode })
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? 'Locatie kon niet verplaatst worden');
      return;
    }
    loadLocations();
  }

  function updateLocationColumns(updater) {
    setColumns((current) => updater(current));
  }

  function toggleLocationColumn(field) {
    setColumns((current) => {
      const currentColumn = current.find((column) => column.field === field);
      const nextVisible = !currentColumn?.visible;
      if (!nextVisible) setScopedColumns((currentScoped) => currentScoped.filter((columnField) => columnField !== field));
      return current.map((column) => column.field === field ? { ...column, visible: nextVisible } : column);
    });
  }

  function cycleLocationPin(field) {
    const nextPin = { null: 'left', left: 'right', right: null };
    updateLocationColumns((current) => current.map((column) => column.field === field ? { ...column, pin: nextPin[column.pin ?? 'null'] } : column));
  }

  function onLocationDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    updateLocationColumns((current) => {
      const sorted = [...current].sort((a, b) => a.order - b.order);
      const oldIndex = sorted.findIndex((column) => column.field === active.id);
      const newIndex = sorted.findIndex((column) => column.field === over.id);
      return arrayMove(sorted, oldIndex, newIndex).map((column, order) => ({ ...column, order }));
    });
  }

  function resetLocationView() {
    setColumns(defaultLocationColumns());
    setScopedColumns([]);
    setQueryText('');
    setTreeSearch('');
    setTreeConfidenceFilter('all');
    setLayoutWidths({ tree: 380, controls: 360, detail: 340 });
    setControlOpen(true);
    setTreeOpen(true);
  }

  function startPanelResize(panel, event) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = layoutWidths[panel];
    const bounds = {
      tree: { min: 300, max: 560 },
      controls: { min: 300, max: 520 },
      detail: { min: 300, max: 560 }
    };
    const onMove = (moveEvent) => {
      const nextWidth = Math.min(bounds[panel].max, Math.max(bounds[panel].min, startWidth + moveEvent.clientX - startX));
      setLayoutWidths((current) => ({ ...current, [panel]: nextWidth }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const sortableLocationFields = [...columns].sort((a, b) => a.order - b.order).map((column) => column.field);
  const sortableLocationColumns = [...columns].sort((a, b) => a.order - b.order);
  const visibleCount = columns.filter((column) => column.visible).length;

  return (
    <Stack spacing={2} className="locations-page">
      <Paper className="locations-hero" elevation={0}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
          <Box>
            <Typography variant="h4">Locatiebeheer</Typography>
            <Typography color="text.secondary">
              PostgreSQL is leidend; tabel en boom tonen dezelfde parent-child locaties uit de database.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant={treeOpen ? 'contained' : 'outlined'} startIcon={<AccountTreeIcon />} onClick={() => setTreeOpen((open) => !open)}>
              Tree
            </Button>
            <Tooltip title={controlOpen ? 'Controls verbergen' : 'Controls tonen'}>
              <IconButton onClick={() => setControlOpen((open) => !open)} color={controlOpen ? 'secondary' : 'primary'}><TuneIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Reset locatie view">
              <IconButton onClick={resetLocationView}><RestartAltIcon /></IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </Paper>

      {loading && <LinearProgress />}
      {error && <Alert severity="warning">{error}</Alert>}

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} className="locations-workspace">
        {treeOpen && <Paper className="locations-tree-card resizable-panel" elevation={0} style={{ flexBasis: layoutWidths.tree, minWidth: layoutWidths.tree }}>
          <Box className="resize-handle resize-handle-right" onPointerDown={(event) => startPanelResize('tree', event)} />
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Box>
              <Typography variant="h6">Locatieboom</Typography>
              <Typography variant="body2" color="text.secondary">Navigator: sleep via de node naar een nieuwe parent.</Typography>
            </Box>
            <IconButton size="small" onClick={() => setTreeOpen(false)}><ChevronRightIcon /></IconButton>
          </Stack>
          <Stack spacing={1} className="tree-tools">
            <TextField
              size="small"
              value={treeSearch}
              onChange={(event) => setTreeSearch(event.target.value)}
              placeholder="Zoek in boom"
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            />
            <Stack direction="row" spacing={1}>
              {['all', 'explicit', 'derived', 'inferred'].map((value) => (
                <Chip
                  key={value}
                  size="small"
                  clickable
                  color={treeConfidenceFilter === value ? confidenceColor(value) : 'default'}
                  label={value === 'all' ? 'Alle' : value}
                  onClick={() => setTreeConfidenceFilter(value)}
                />
              ))}
            </Stack>
          </Stack>
          <Box className="arborist-box" ref={treeBoxRef}>
            <Tree
              key={`${treeSearch}-${treeConfidenceFilter}`}
              data={filteredTreeNodes}
              width="100%"
              height={treeViewportHeight}
              rowHeight={LOCATION_TREE_ROW_HEIGHT}
              indent={18}
              initialOpenState={treeInitialOpenState}
              selection={selected?.id}
              onSelect={(nodes) => setSelectedId(nodes[0]?.id ?? null)}
              onMove={moveLocation}
              disableDrop={({ parentNode, dragNodes }) => dragNodes.some((dragNode) => wouldCreateLocationCycle(rows, dragNode.id, parentNode?.id))}
            >
              {LocationNode}
            </Tree>
          </Box>
        </Paper>}

        <Paper className={controlOpen ? 'locations-table-card' : 'locations-table-card locations-table-wide'} elevation={0}>
          <Stack direction="row" spacing={1.5} alignItems="center" className="query-bar locations-query-bar">
            <TextField
              size="small"
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              placeholder="Globale quickfilter doorheen locaties"
              sx={{ flex: 1 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            />
            <Autocomplete
              multiple
              size="small"
              options={visibleSearchableColumns}
              getOptionLabel={(option) => option.label}
              value={visibleSearchableColumns.filter((column) => scopedColumns.includes(column.field))}
              onChange={(_, value) => setScopedColumns(value.map((column) => column.field))}
              renderInput={(params) => <TextField {...params} label="Zoek enkel in zichtbare kolommen" />}
              sx={{ width: 360 }}
            />
            <Tooltip title={controlOpen ? 'Controls verbergen' : 'Controls tonen'}>
              <IconButton onClick={() => setControlOpen((open) => !open)} color={controlOpen ? 'secondary' : 'primary'}><TuneIcon /></IconButton>
            </Tooltip>
          </Stack>
          <Box className="ag-theme-quartz locations-grid-box">
            <AgGridReact
              ref={locationGridRef}
              rowData={filteredRows}
              columnDefs={locationColumnDefs}
              getRowId={(params) => params.data.id}
              getRowClass={(params) => params.data?.id === selectedId ? 'location-row-selected' : ''}
              rowHeight={38}
              headerHeight={40}
              suppressDragLeaveHidesColumns
              rowSelection="single"
              onRowClicked={(event) => setSelectedId(event.data.id)}
              onFirstDataRendered={(event) => {
                event.api.forEachNode((rowNode) => rowNode.setSelected(rowNode.data?.id === selectedId));
              }}
              onSortChanged={(event) => {
                const sortModel = event.api.getColumnState()
                  .filter((column) => column.sort)
                  .map((column) => ({ field: column.colId, direction: column.sort }));
                if (sortModel.length) setSort(sortModel);
              }}
            />
          </Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" className="footer-bar">
            <Typography color="text.secondary">
              {filteredRows.length.toLocaleString('nl-BE')} van {rows.length.toLocaleString('nl-BE')} locaties · sort {sort[0]?.field ?? 'code'}
            </Typography>
            <Chip label={`${visibleCount} zichtbare kolommen`} color="success" />
          </Stack>
        </Paper>

        {controlOpen && <Paper className="locations-control-card resizable-panel" elevation={0} style={{ flexBasis: layoutWidths.controls, minWidth: layoutWidths.controls }}>
          <Box className="resize-handle resize-handle-left" onPointerDown={(event) => startPanelResize('controls', event)} />
          <Stack spacing={2} className="drawer-content">
            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="h6">Location controls</Typography>
                <Button size="small" onClick={() => setControlOpen(false)}>Hide</Button>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Dezelfde AG Grid control-layer: kolommen tonen/verbergen, pinnen en sorteerbare volgorde.
              </Typography>
            </Box>
            <DndContext sensors={sensors} onDragEnd={onLocationDragEnd}>
              <SortableContext items={sortableLocationFields} strategy={verticalListSortingStrategy}>
                <List dense>
                  {sortableLocationColumns.map((column) => (
                    <SortableColumn key={column.field} column={column} onToggle={toggleLocationColumn} onCyclePin={cycleLocationPin} />
                  ))}
                </List>
              </SortableContext>
            </DndContext>
          </Stack>
        </Paper>}

        <Paper className="locations-detail-card resizable-panel" elevation={0} style={{ flexBasis: layoutWidths.detail, minWidth: layoutWidths.detail }}>
          <Box className="resize-handle resize-handle-left" onPointerDown={(event) => startPanelResize('detail', event)} />
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <InfoOutlinedIcon color="primary" />
            <Typography variant="h6">Locatiedossier</Typography>
          </Stack>
          {!selected && <Typography color="text.secondary">Selecteer een locatie.</Typography>}
          {selected && (
            <Stack spacing={1.5}>
              <Box className="detail-identity-card">
                <Stack direction="row" spacing={1.2} alignItems="flex-start">
                  <Box className={`detail-type-icon type-${selected.typeCode}`}>{locationTypeIcon(selected.typeCode)}</Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary">Geselecteerde locatie</Typography>
                    <Typography variant="h6" noWrap title={selected.name}>{selected.name}</Typography>
                    <Typography color="text.secondary" noWrap title={selected.displayName}>{selected.displayName}</Typography>
                  </Box>
                </Stack>
              </Box>
              <Box className="breadcrumb-card">
                {selectedBreadcrumb.map((item, index) => (
                  <React.Fragment key={item.id}>
                    {index > 0 && <ChevronRightIcon fontSize="small" />}
                    <Chip size="small" label={item.code} color={item.id === selected.id ? 'primary' : 'default'} />
                  </React.Fragment>
                ))}
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label={selected.code} color="primary" />
                <Chip label={selected.type} />
                <Chip label={selected.confidence} color={confidenceColor(selected.confidence)} />
              </Stack>
              <Tabs value={detailTab} onChange={(_, value) => setDetailTab(value)} variant="fullWidth">
                <Tab value="overview" label="Overzicht" />
                <Tab value="relations" label="Relaties" />
                <Tab value="source" label="Bron" />
              </Tabs>
              {detailTab === 'overview' && (
                <Stack spacing={1} className="detail-facts">
                  <Box><Typography variant="caption">Complex</Typography><Typography>{selected.complexName ?? '-'}</Typography></Box>
                  <Box><Typography variant="caption">Complexcode</Typography><Typography>{selected.complexCode ?? '-'}</Typography></Box>
                  <Box><Typography variant="caption">Afkorting</Typography><Typography>{selected.abbreviation ?? '-'}</Typography></Box>
                  <Box><Typography variant="caption">Sortering</Typography><Typography>{selected.sortOrder}</Typography></Box>
                </Stack>
              )}
              {detailTab === 'relations' && (
                <Stack spacing={1}>
                  <Box className="relation-card"><Typography variant="caption">Parent</Typography><Typography>{selected.parentName ?? 'Root-node'}</Typography></Box>
                  <Box className="relation-card"><Typography variant="caption">Kinderen</Typography><Typography>{selectedChildren.length ? selectedChildren.map((child) => child.code).join(', ') : 'Geen'}</Typography></Box>
                </Stack>
              )}
              {detailTab === 'source' && (
                <Stack spacing={1}>
                  <Box className="relation-card"><Typography variant="caption">Bron</Typography><Typography>{selected.source ?? '-'}</Typography></Box>
                  <Box className="relation-card"><Typography variant="caption">Pagina / sectie</Typography><Typography>{selected.sourcePage ?? '-'} {selected.sourceSection ?? ''}</Typography></Box>
                  <Box className="metadata-box">
                    <Typography variant="caption" color="text.secondary">Metadata</Typography>
                    <pre>{JSON.stringify(selected.metadata ?? {}, null, 2)}</pre>
                  </Box>
                </Stack>
              )}
            </Stack>
          )}
        </Paper>
      </Stack>
    </Stack>
  );
}

function App() {
  const [appTab, setAppTab] = useState('tables');
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
      <Box className={`app-shell ${appTab === 'locations' ? 'app-shell-locations' : ''}`}>
        <AppBar position="static" color="transparent" elevation={0}>
          <Toolbar className="topbar">
            <Box>
              <Typography variant="h4">Table Interaction Lab</Typography>
              <Typography color="text.secondary">PostgreSQL + AG Grid Community + Material UI control layer</Typography>
            </Box>
            <Stack direction="row" spacing={2} alignItems="center">
              <Tabs value={appTab} onChange={(_, value) => setAppTab(value)} className="app-tabs">
                <Tab value="tables" label="Table Lab" />
                <Tab value="locations" label="Locaties" />
              </Tabs>
              <Stack direction="row" spacing={1} className="stats-chips">
                {stats.map((item) => <Chip key={item.table_name} label={`${item.table_name}: ${item.total.toLocaleString('nl-BE')}`} />)}
              </Stack>
            </Stack>
          </Toolbar>
        </AppBar>

        {appTab === 'locations' && <LocationsPage />}

        {appTab === 'tables' && <Stack direction="row" spacing={2} className="workspace">
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
        </Stack>}
      </Box>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(<App />);

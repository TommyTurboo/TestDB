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
  Popover,
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
import FileDownloadIcon from '@mui/icons-material/FileDownload';
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

function filterValueKey(value) {
  if (value == null || value === '') return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function displayFilterValue(value) {
  const key = filterValueKey(value);
  return key || '(leeg)';
}

function getUniqueColumnValues(rows, field) {
  const values = new Map();
  rows.forEach((row) => {
    const key = filterValueKey(row[field]);
    const current = values.get(key) ?? { value: key, label: displayFilterValue(row[field]), count: 0 };
    current.count += 1;
    values.set(key, current);
  });
  return [...values.values()].sort((a, b) => a.label.localeCompare(b.label, 'nl-BE', { sensitivity: 'base', numeric: true }));
}

const editableLocationFields = new Set(['code', 'name', 'type', 'complexCode', 'complexName', 'abbreviation', 'source', 'sourcePage', 'sourceSection', 'confidence']);
const staticAllowedValuesByColumn = {
  status: ['explicit', 'derived', 'inferred'],
  confidence: ['explicit', 'derived', 'inferred']
};

function isEditableLocationField(field) {
  return editableLocationFields.has(field);
}

function allowedValuesFromUniqueRows(rows, field) {
  return getUniqueColumnValues(rows, field).map((item) => item.label);
}

function getAllowedValuesForColumn(rows, field) {
  if (staticAllowedValuesByColumn[field]) return staticAllowedValuesByColumn[field];
  if (field === 'type') return allowedValuesFromUniqueRows(rows, field);
  return null;
}

function getSelectableColumnValues(rows, field) {
  const allowedValues = getAllowedValuesForColumn(rows, field);
  if (!allowedValues) return getUniqueColumnValues(rows, field);

  return allowedValues
    .map((allowedValue) => {
      const value = filterValueKey(allowedValue);
      const count = rows.reduce((total, row) => total + (filterValueKey(row[field]) === value ? 1 : 0), 0);
      return { value, label: displayFilterValue(value), count };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'nl-BE', { sensitivity: 'base', numeric: true }));
}

function validateClipboardValue(value, allowedValues) {
  if (!allowedValues) return { valid: true, value };
  const pastedValue = filterValueKey(value).trim();
  const exactMatch = allowedValues.find((allowedValue) => filterValueKey(allowedValue) === pastedValue);
  if (exactMatch != null) return { valid: true, value: filterValueKey(exactMatch) };

  const caseInsensitiveMatch = allowedValues.find((allowedValue) => filterValueKey(allowedValue).toLowerCase() === pastedValue.toLowerCase());
  if (caseInsensitiveMatch != null) return { valid: true, value: filterValueKey(caseInsensitiveMatch) };

  return { valid: false, value };
}

function parseClipboardTable(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
    .map((line) => line.split('\t'));
}

function locationCellKey(rowId, field) {
  return `${rowId ?? ''}::${field ?? ''}`;
}

function matchesColumnValueFilters(row, filters) {
  return Object.entries(filters).every(([field, selectedValues]) => {
    if (!Array.isArray(selectedValues) || selectedValues.length === 0) return true;
    return selectedValues.includes(filterValueKey(row[field]));
  });
}

function cloneFilterValues(filters) {
  return Object.fromEntries(Object.entries(filters).map(([field, values]) => [field, [...values]]));
}

function describeAgFilter(filter) {
  if (!filter) return '';
  if (filter.values) return filter.values.join(', ');
  if (filter.filter != null && filter.filterTo != null) return `${filter.type ?? 'between'} ${filter.filter} - ${filter.filterTo}`;
  if (filter.filter != null) return `${filter.type ?? 'is'} ${filter.filter}`;
  if (filter.condition1 || filter.condition2) {
    return [filter.condition1, filter.condition2].filter(Boolean).map(describeAgFilter).join(` ${filter.operator ?? 'AND'} `);
  }
  return filter.type ?? 'actief';
}

function buildFilterChips(filterModel, columnLabels = {}) {
  const chips = [];
  Object.entries(filterModel.ag ?? {}).forEach(([field, filter]) => {
    chips.push({
      key: `ag-${field}`,
      label: `${columnLabels[field] ?? field}: ${describeAgFilter(filter)}`,
      tone: 'primary'
    });
  });
  if (filterModel.quick) {
    chips.push({ key: 'quick', label: `Quick: ${filterModel.quick}`, tone: 'default' });
  }
  if (filterModel.scopedColumns?.length) {
    chips.push({
      key: 'scope',
      label: `Zoekt in: ${filterModel.scopedColumns.map((field) => columnLabels[field] ?? field).join(', ')}`,
      tone: 'default'
    });
  }
  Object.entries(filterModel.valueFilters ?? {}).forEach(([field, values]) => {
    if (!values.length) return;
    chips.push({
      key: `value-${field}`,
      label: `${columnLabels[field] ?? field}: ${values.map(displayFilterValue).join(', ')}`,
      tone: 'secondary'
    });
  });
  return chips;
}

function titleForFilterSet(filterModel, columnLabels) {
  const chips = buildFilterChips(filterModel, columnLabels);
  if (!chips.length) return 'Filterset: alle zichtbare rijen';
  return `Filterset: ${chips.slice(0, 3).map((chip) => chip.label).join(' · ')}${chips.length > 3 ? ' · ...' : ''}`;
}

function FilterChips({ filterModel, columnLabels }) {
  const chips = buildFilterChips(filterModel, columnLabels);
  if (!chips.length) return <Chip size="small" label="Geen actieve filters" variant="outlined" />;
  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap className="filter-context-chips">
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          size="small"
          label={chip.label}
          color={chip.tone === 'primary' ? 'primary' : chip.tone === 'secondary' ? 'secondary' : 'default'}
          variant={chip.tone === 'default' ? 'outlined' : 'filled'}
        />
      ))}
    </Stack>
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatExportCell(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function exportFileName(name) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `${name}-${stamp}.xls`;
}

function downloadExcelWorkbook(fileName, columns, sections, includeSectionColumn = false) {
  const headerCells = [
    ...(includeSectionColumn ? ['Exportsectie'] : []),
    ...columns.map((column) => column.headerName ?? column.field)
  ];
  const bodyRows = sections.flatMap((section) => section.rows.map((row) => [
    ...(includeSectionColumn ? [section.title] : []),
    ...columns.map((column) => formatExportCell(row[column.field]))
  ]));
  const htmlRows = [
    `<tr>${headerCells.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr>`,
    ...bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
  ].join('');
  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><table>${htmlRows}</table></body></html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function GridResizeDivider({ label, onPointerDown }) {
  return (
    <Box
      className="grid-height-divider"
      role="separator"
      aria-label={label}
      onPointerDown={onPointerDown}
    >
      <Box className="grid-height-divider-line" />
      <Box className="grid-height-divider-handle" />
    </Box>
  );
}

function defaultFilterResultSetGridHeight(resultSet) {
  const visibleRows = Math.min(Math.max(resultSet.rows.length, 3), 8);
  return 34 + (visibleRows * 32) + 2;
}

function FilterResultSetGrid({ resultSet, columnDefs, getRowClass, onRowClicked, height }) {
  const gridHeight = height ?? defaultFilterResultSetGridHeight(resultSet);

  return (
    <Box className="ag-theme-quartz filter-result-grid" style={{ height: gridHeight }}>
      <AgGridReact
        rowData={resultSet.rows}
        columnDefs={columnDefs}
        getRowId={(params) => params.data.id}
        getRowClass={getRowClass}
        rowHeight={32}
        headerHeight={34}
        suppressDragLeaveHidesColumns
        suppressCellFocus
        rowSelection="single"
        onRowClicked={onRowClicked}
      />
    </Box>
  );
}

function CellValueEditorPopover({ editor, rows, columns, onClose, onApply }) {
  const [query, setQuery] = useState('');
  const column = columns.find((item) => item.field === editor?.field);
  const values = useMemo(() => {
    if (!editor?.field) return [];
    return getSelectableColumnValues(rows, editor.field);
  }, [rows, editor?.field]);
  const visibleValues = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return values;
    return values.filter((item) => item.label.toLowerCase().includes(term));
  }, [values, query]);

  if (!editor) return null;

  return (
    <Popover
      open
      anchorEl={editor.anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      PaperProps={{ className: 'cell-value-editor-popover' }}
    >
      <Stack spacing={1}>
        <Box>
          <Typography variant="subtitle2">{column?.headerName ?? editor.field}</Typography>
          <Typography variant="caption" color="text.secondary">Kies een bestaande unieke waarde voor deze kolom</Typography>
        </Box>
        <TextField
          size="small"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Zoek waarde"
          autoFocus
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
        />
        <List dense className="cell-value-editor-list">
          {visibleValues.map((item) => {
            const selected = filterValueKey(editor.currentValue) === item.value;
            return (
              <ListItemButton key={item.value} dense selected={selected} onClick={() => onApply(editor, item.value)}>
                <ListItemText
                  primary={item.label}
                  secondary={`${item.count.toLocaleString('nl-BE')} rijen`}
                  primaryTypographyProps={{ noWrap: true, title: item.label }}
                />
              </ListItemButton>
            );
          })}
          {visibleValues.length === 0 && (
            <Typography variant="body2" color="text.secondary" className="column-value-empty">Geen waarden gevonden.</Typography>
          )}
        </List>
        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">Dubbelklik op een cel om te wijzigen.</Typography>
          <Button size="small" onClick={onClose}>Sluit</Button>
        </Stack>
      </Stack>
    </Popover>
  );
}

function FilterResultSetPanel({ resultSet, columnDefs, columnLabels, height, onRemove, onToggle, getRowClass, onRowClicked }) {
  return (
    <Box className={`filter-result-set-panel ${resultSet.collapsed ? 'is-collapsed' : ''}`}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} className="filter-result-set-bar">
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap title={resultSet.title}>{resultSet.title}</Typography>
          <Typography variant="caption" color="text.secondary" className="filter-result-count">
            {resultSet.rows.length.toLocaleString('nl-BE')} rijen · {new Date(resultSet.createdAt).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} className="filter-result-actions">
          <Button size="small" onClick={() => onToggle(resultSet.id)}>{resultSet.collapsed ? 'Open' : 'Klap in'}</Button>
          <Button size="small" color="error" onClick={() => onRemove(resultSet.id)}>Verwijder</Button>
        </Stack>
      </Stack>
      <FilterChips filterModel={resultSet.filterModel} columnLabels={columnLabels} />
      {!resultSet.collapsed && (
        <FilterResultSetGrid
          resultSet={resultSet}
          columnDefs={columnDefs}
          getRowClass={getRowClass}
          onRowClicked={onRowClicked}
          height={height}
        />
      )}
    </Box>
  );
}

function LocationColumnHeader(props) {
  const [sort, setSort] = useState(props.column?.getSort?.() ?? null);
  const field = props.column?.getColId?.();
  const activeFilterCount = props.activeFilterCount ?? 0;
  const pinnedLeft = props.pin === 'left';

  useEffect(() => {
    if (!props.column) return undefined;
    function updateSort() {
      setSort(props.column.getSort?.() ?? null);
    }
    props.column.addEventListener('sortChanged', updateSort);
    updateSort();
    return () => props.column.removeEventListener('sortChanged', updateSort);
  }, [props.column]);

  function sortColumn(event) {
    if (!props.enableSorting) return;
    props.progressSort?.(event.shiftKey);
  }

  function openFilter(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!field) return;
    props.onOpenFilter?.(event.currentTarget, field);
  }

  function togglePinLeft(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!field) return;
    props.onTogglePinLeft?.(field);
  }

  return (
    <Box className="location-column-header">
      <button type="button" className="location-column-title" onClick={sortColumn} title={props.displayName}>
        <span>{props.displayName}</span>
        {sort && <span className="location-column-sort">{sort === 'asc' ? 'ASC' : 'DESC'}</span>}
      </button>
      <Tooltip title={pinnedLeft ? 'Pin links verwijderen' : 'Pin kolom links'}>
        <button
          type="button"
          className={`location-header-pin-button ${pinnedLeft ? 'is-active' : ''}`}
          onClick={togglePinLeft}
          aria-label={pinnedLeft ? `Pin links verwijderen voor ${props.displayName}` : `Pin ${props.displayName} links`}
        >
          <PinStateIcon pin={pinnedLeft ? 'left' : null} />
        </button>
      </Tooltip>
      <Tooltip title={activeFilterCount ? `${activeFilterCount} actieve filterwaarden` : 'Filter deze kolom'}>
        <button
          type="button"
          className={`location-header-filter-button ${activeFilterCount ? 'is-active' : ''}`}
          onClick={openFilter}
          aria-label={`Filter ${props.displayName}`}
        >
          <TuneIcon fontSize="inherit" />
        </button>
      </Tooltip>
    </Box>
  );
}

function MainDataGrid({
  controlOpen,
  queryText,
  setQueryText,
  visibleSearchableColumns,
  scopedColumns,
  setScopedColumns,
  rows,
  columnValueFilters,
  setColumnValueFilters,
  setControlOpen,
  locationGridRef,
  filteredRows,
  allRows,
  locationColumnDefs,
  selectedId,
  setSelectedId,
  setSort,
  sort,
  visibleCount,
  onAddFilterSet,
  resultSets,
  columnLabels,
  onRemoveResultSet,
  onToggleResultSet,
  onTogglePinLeft,
  onApplyCellValue,
  onApplyPastedCells,
  onPasteNotice
}) {
  const [cellEditor, setCellEditor] = useState(null);
  const [headerFilter, setHeaderFilter] = useState(null);
  const [selectedCellKeys, setSelectedCellKeys] = useState(() => new Set());
  const [isCellDragSelecting, setIsCellDragSelecting] = useState(false);
  const pasteStatsRef = useRef({ total: 0, rejected: 0, timer: null });
  const tableRootRef = useRef(null);
  const lastFocusedCellRef = useRef(null);
  const dragSelectionRef = useRef({ pending: false, active: false, moved: false, startCell: null });
  const suppressNextCellClickRef = useRef(false);
  const [manualMainGridHeight, setManualMainGridHeight] = useState(null);
  const [manualResultSetHeights, setManualResultSetHeights] = useState({});
  const getLocationRowClass = (params) => params.data?.id === selectedId ? 'location-row-selected' : '';
  const mainGridVisibleRows = resultSets.length > 0
    ? Math.min(Math.max(filteredRows.length, 6), 12)
    : null;
  const mainGridAutoHeight = mainGridVisibleRows ? 40 + (mainGridVisibleRows * 38) + 3 : null;
  const mainGridHeight = manualMainGridHeight ?? mainGridAutoHeight;
  const exportColumns = locationColumnDefs.map((column) => ({
    field: column.field,
    headerName: column.headerName
  }));
  const gridColumnDefs = useMemo(() => locationColumnDefs.map((column) => ({
    ...column,
    headerComponent: LocationColumnHeader,
    headerComponentParams: {
      activeFilterCount: columnValueFilters[column.field]?.length ?? 0,
      pin: column.pinned ?? null,
      onTogglePinLeft,
      onOpenFilter: (anchorEl, field) => setHeaderFilter({ anchorEl, field })
    }
  })), [locationColumnDefs, columnValueFilters, onTogglePinLeft]);

  useEffect(() => {
    const resultSetIds = new Set(resultSets.map((resultSet) => resultSet.id));
    if (resultSetIds.size === 0) {
      setManualMainGridHeight(null);
      setManualResultSetHeights({});
      return;
    }
    setManualResultSetHeights((current) => Object.fromEntries(
      Object.entries(current).filter(([id]) => resultSetIds.has(id))
    ));
  }, [resultSets]);

  function startGridHeightResize(kind, id, currentHeight, event) {
    event.preventDefault();
    const startY = event.clientY;
    const measuredMainHeight = tableRootRef.current?.getBoundingClientRect().height;
    const startHeight = kind === 'main'
      ? Math.round(measuredMainHeight ?? currentHeight)
      : Math.round(currentHeight);
    const minHeight = kind === 'main' ? 220 : 120;
    const maxHeight = kind === 'main'
      ? Math.max(320, window.innerHeight - 260)
      : Math.min(480, Math.max(180, window.innerHeight - 280));

    document.body.classList.add('is-grid-height-resizing');

    function handlePointerMove(pointerEvent) {
      const nextHeight = clamp(startHeight + pointerEvent.clientY - startY, minHeight, maxHeight);
      if (kind === 'main') {
        setManualMainGridHeight(nextHeight);
        return;
      }
      setManualResultSetHeights((current) => ({ ...current, [id]: nextHeight }));
    }

    function handlePointerUp() {
      document.body.classList.remove('is-grid-height-resizing');
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function rememberCell(event) {
    const field = event.column?.getColId();
    if (!field) return;
    lastFocusedCellRef.current = {
      rowIndex: event.rowIndex,
      colId: field,
      rowId: event.data?.id
    };
  }

  function selectedCellColumn() {
    const firstKey = selectedCellKeys.values().next().value;
    return firstKey ? firstKey.split('::')[1] : null;
  }

  function canSelectCell(field) {
    const lockedColumn = selectedCellColumn();
    return !lockedColumn || lockedColumn === field;
  }

  function toggleCellSelection(event, previousFocusedCell = null) {
    const field = event.column?.getColId();
    const rowId = event.data?.id;
    if (!field || !rowId || !isEditableLocationField(field)) return;
    if (!canSelectCell(field)) {
      onPasteNotice(`Selectie blijft beperkt tot kolom ${selectedCellColumn()}.`);
      return;
    }
    const key = locationCellKey(rowId, field);
    setSelectedCellKeys((current) => {
      const next = new Set(current);
      if (
        current.size === 0
        && previousFocusedCell?.rowId
        && previousFocusedCell.colId === field
        && previousFocusedCell.rowId !== rowId
      ) {
        next.add(locationCellKey(previousFocusedCell.rowId, field));
      }
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearCellSelection() {
    setSelectedCellKeys((current) => current.size ? new Set() : current);
  }

  function addCellsToSelection(cells, replace = false) {
    setSelectedCellKeys((current) => {
      const next = replace ? new Set() : new Set(current);
      const currentFirstKey = current.values().next().value;
      const currentColumn = currentFirstKey ? currentFirstKey.split('::')[1] : null;
      const lockedColumn = replace ? cells.find((cell) => cell?.field)?.field : currentColumn;
      cells.forEach((cell) => {
        if (!cell?.rowId || !cell?.field || !isEditableLocationField(cell.field)) return;
        if (lockedColumn && cell.field !== lockedColumn) return;
        next.add(locationCellKey(cell.rowId, cell.field));
      });
      return next;
    });
  }

  function cellFromGridEvent(event) {
    const field = event.column?.getColId();
    const rowId = event.data?.id;
    if (!field || !rowId || !isEditableLocationField(field)) return null;
    return {
      rowIndex: event.rowIndex,
      field,
      rowId
    };
  }

  function beginCellDragSelection(event) {
    if (event.event?.button !== 0) return;
    if (!(event.event?.ctrlKey || event.event?.metaKey)) {
      clearCellSelection();
      return;
    }
    const cell = cellFromGridEvent(event);
    if (!cell) return;
    if (!canSelectCell(cell.field)) {
      onPasteNotice(`Selectie blijft beperkt tot kolom ${selectedCellColumn()}.`);
      return;
    }
    dragSelectionRef.current = {
      pending: true,
      active: false,
      moved: false,
      append: true,
      startCell: cell
    };
  }

  function extendCellDragSelection(event) {
    const dragState = dragSelectionRef.current;
    if (!dragState.pending || !dragState.startCell) return;
    const cell = cellFromGridEvent(event);
    if (!cell) return;
    if (cell.field !== dragState.startCell.field) return;
    if (!dragState.moved && cell.rowId === dragState.startCell.rowId && cell.field === dragState.startCell.field) return;

    dragState.active = true;
    dragState.moved = true;
    setIsCellDragSelecting(true);
    addCellsToSelection([dragState.startCell, cell], false);
  }

  function getSelectedCells(api) {
    if (!selectedCellKeys.size) return [];
    const displayedColumns = api.getAllDisplayedColumns();
    const columnRank = new Map(displayedColumns.map((column, index) => [column.getColId(), index]));
    const cells = [];
    api.forEachNodeAfterFilterAndSort((rowNode) => {
      if (!rowNode.data) return;
      displayedColumns.forEach((column) => {
        const field = column.getColId();
        const key = locationCellKey(rowNode.data.id, field);
        if (selectedCellKeys.has(key)) {
          cells.push({
            row: rowNode.data,
            rowIndex: rowNode.rowIndex,
            field,
            colIndex: columnRank.get(field) ?? 0
          });
        }
      });
    });
    return cells.sort((a, b) => a.rowIndex === b.rowIndex ? a.colIndex - b.colIndex : a.rowIndex - b.rowIndex);
  }

  function openCellEditor(event) {
    rememberCell(event);
    const field = event.column?.getColId();
    if (!field || !event.data || !isEditableLocationField(field)) return;
    const target = event.event?.target;
    const anchorEl = target instanceof Element ? target.closest('.ag-cell') ?? target : null;
    if (!anchorEl) return;
    setCellEditor({
      anchorEl,
      row: event.data,
      field,
      currentValue: event.value
    });
  }

  async function applyCellValue(editor, value) {
    await onApplyCellValue(editor.row, editor.field, value);
    setCellEditor(null);
  }

  function flushPasteStats() {
    const stats = pasteStatsRef.current;
    if (!stats.total) return;
    if (stats.rejected > 0) {
      onPasteNotice(`${stats.total.toLocaleString('nl-BE')} waarden geplakt, ${stats.rejected.toLocaleString('nl-BE')} ongeldig genegeerd.`);
    } else {
      onPasteNotice(`${stats.total.toLocaleString('nl-BE')} waarden geplakt.`);
    }
    pasteStatsRef.current = { total: 0, rejected: 0, timer: null };
  }

  function trackPasteCell(rejected) {
    const stats = pasteStatsRef.current;
    stats.total += 1;
    if (rejected) stats.rejected += 1;
    if (stats.timer) window.clearTimeout(stats.timer);
    stats.timer = window.setTimeout(flushPasteStats, 0);
  }

  function processCellFromClipboard(params) {
    const field = params.column?.getColId();
    const allowedValues = getAllowedValuesForColumn(allRows, field);
    if (!allowedValues) {
      trackPasteCell(false);
      return params.value;
    }

    const validated = validateClipboardValue(params.value, allowedValues);
    trackPasteCell(!validated.valid);
    return validated.valid ? validated.value : params.node?.data?.[field];
  }

  function handleGridPaste(event) {
    const text = event.clipboardData?.getData('text/plain');
    const api = locationGridRef.current?.api;
    if (!text || !api) return;

    const focusedCell = api.getFocusedCell();
    const fallbackCell = lastFocusedCellRef.current;
    const startColId = focusedCell?.column?.getColId?.() ?? fallbackCell?.colId;
    const startRowIndex = focusedCell?.rowIndex ?? fallbackCell?.rowIndex;
    if (!startColId || startRowIndex == null) {
      onPasteNotice('Klik eerst een doelcel in de locatiegrid en plak daarna opnieuw.');
      return;
    }

    const pastedRows = parseClipboardTable(text);
    if (!pastedRows.length) return;

    const displayedColumns = api.getAllDisplayedColumns();
    const startColumnIndex = displayedColumns.findIndex((column) => column.getColId() === startColId);
    if (startColumnIndex < 0) return;

    event.preventDefault();
    event.stopPropagation?.();

    let total = 0;
    let rejected = 0;
    const changesByRow = new Map();
    const selectedCells = getSelectedCells(api);

    if (selectedCells.length > 0) {
      const pastedValues = pastedRows.flat();
      selectedCells.forEach((cell, index) => {
        const rawValue = pastedRows.length === 1 && pastedRows[0].length === 1
          ? pastedRows[0][0]
          : pastedValues[index % pastedValues.length];
        if (rawValue == null || !isEditableLocationField(cell.field)) return;

        total += 1;
        const allowedValues = getAllowedValuesForColumn(allRows, cell.field);
        const validated = validateClipboardValue(rawValue, allowedValues);
        if (!validated.valid) {
          rejected += 1;
          return;
        }

        const nextValue = validated.value;
        if (filterValueKey(cell.row[cell.field]) === filterValueKey(nextValue)) return;
        const currentPatch = changesByRow.get(cell.row.id) ?? { row: cell.row, values: {} };
        currentPatch.values[cell.field] = nextValue;
        changesByRow.set(cell.row.id, currentPatch);
      });

      if (total === 0) return;
      if (changesByRow.size > 0) onApplyPastedCells([...changesByRow.values()]);
      onPasteNotice(`${total.toLocaleString('nl-BE')} geselecteerde cellen geplakt, ${rejected.toLocaleString('nl-BE')} ongeldig genegeerd.`);
      return;
    }

    pastedRows.forEach((pastedRow, rowOffset) => {
      const rowNode = api.getDisplayedRowAtIndex(startRowIndex + rowOffset);
      if (!rowNode?.data) return;

      pastedRow.forEach((rawValue, columnOffset) => {
        const column = displayedColumns[startColumnIndex + columnOffset];
        const field = column?.getColId();
        if (!field || !isEditableLocationField(field)) return;

        total += 1;
        const allowedValues = getAllowedValuesForColumn(allRows, field);
        const validated = validateClipboardValue(rawValue, allowedValues);
        if (!validated.valid) {
          rejected += 1;
          return;
        }

        const nextValue = validated.value;
        if (filterValueKey(rowNode.data[field]) === filterValueKey(nextValue)) return;
        const currentPatch = changesByRow.get(rowNode.data.id) ?? { row: rowNode.data, values: {} };
        currentPatch.values[field] = nextValue;
        changesByRow.set(rowNode.data.id, currentPatch);
      });
    });

    if (total === 0) return;
    if (changesByRow.size > 0) onApplyPastedCells([...changesByRow.values()]);
    onPasteNotice(`${total.toLocaleString('nl-BE')} waarden geplakt, ${rejected.toLocaleString('nl-BE')} ongeldig genegeerd.`);
  }

  function handleGridCopy(event) {
    const api = locationGridRef.current?.api;
    const selectedCells = api ? getSelectedCells(api) : [];
    if (selectedCells.length > 0) {
      event.preventDefault();
      event.stopPropagation?.();
      event.clipboardData?.setData('text/plain', selectedCells.map((cell) => filterValueKey(cell.row[cell.field])).join('\n'));
      onPasteNotice(`${selectedCells.length.toLocaleString('nl-BE')} geselecteerde cellen gekopieerd.`);
      return;
    }

    const focusedCell = api?.getFocusedCell();
    const fallbackCell = lastFocusedCellRef.current;
    const rowIndex = focusedCell?.rowIndex ?? fallbackCell?.rowIndex;
    const field = focusedCell?.column?.getColId?.() ?? fallbackCell?.colId;
    if (!api || rowIndex == null || !field) return;

    const rowNode = api.getDisplayedRowAtIndex(rowIndex);
    if (!rowNode?.data) return;
    event.preventDefault();
    event.stopPropagation?.();
    event.clipboardData?.setData('text/plain', filterValueKey(rowNode.data[field]));
    onPasteNotice(`Waarde gekopieerd: ${displayFilterValue(rowNode.data[field])}`);
  }

  function getMainExportRows() {
    const api = locationGridRef.current?.api;
    if (!api) return filteredRows;
    const exportRows = [];
    api.forEachNodeAfterFilterAndSort((rowNode) => {
      if (rowNode.data) exportRows.push(rowNode.data);
    });
    return exportRows;
  }

  function exportMainTable() {
    const exportRows = getMainExportRows();
    downloadExcelWorkbook(
      exportFileName('locaties-main-tabel'),
      exportColumns,
      [{ title: 'Main tabel', rows: exportRows }],
      false
    );
    onPasteNotice(`${exportRows.length.toLocaleString('nl-BE')} rijen geexporteerd naar Excel.`);
  }

  function exportMainTableWithFilterSets() {
    const mainRows = getMainExportRows();
    const sections = [
      { title: 'Main tabel', rows: mainRows },
      ...resultSets.map((resultSet, index) => ({
        title: `Filterset ${index + 1}: ${resultSet.title}`,
        rows: resultSet.rows
      }))
    ];
    const rowCount = sections.reduce((total, section) => total + section.rows.length, 0);
    downloadExcelWorkbook(
      exportFileName('locaties-main-met-filtersets'),
      exportColumns,
      sections,
      true
    );
    onPasteNotice(`${rowCount.toLocaleString('nl-BE')} rijen geexporteerd naar Excel.`);
  }

  useEffect(() => {
    locationGridRef.current?.api?.refreshCells({ force: true });
  }, [selectedCellKeys, filteredRows]);

  useEffect(() => {
    function endCellDragSelection() {
      const dragState = dragSelectionRef.current;
      if (dragState.moved) suppressNextCellClickRef.current = true;
      dragSelectionRef.current = { pending: false, active: false, moved: false, startCell: null };
      setIsCellDragSelecting(false);
    }

    window.addEventListener('mouseup', endCellDragSelection);
    return () => window.removeEventListener('mouseup', endCellDragSelection);
  }, []);

  useEffect(() => {
    function isTextInputActive() {
      const active = document.activeElement;
      return Boolean(active?.closest?.('input, textarea, [contenteditable="true"], .MuiPopover-root'));
    }

    function isLocationGridActive() {
      const active = document.activeElement;
      return Boolean(tableRootRef.current?.contains(active) || lastFocusedCellRef.current);
    }

    function onWindowPaste(event) {
      if (isTextInputActive() || !isLocationGridActive()) return;
      handleGridPaste(event);
    }

    function onWindowCopy(event) {
      if (isTextInputActive() || !isLocationGridActive()) return;
      handleGridCopy(event);
    }

    window.addEventListener('paste', onWindowPaste);
    window.addEventListener('copy', onWindowCopy);
    return () => {
      window.removeEventListener('paste', onWindowPaste);
      window.removeEventListener('copy', onWindowCopy);
    };
  });

  return (
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
        <ScopedColumnValuePicker
          options={visibleSearchableColumns}
          selectedFields={scopedColumns}
          onSelectedFieldsChange={setScopedColumns}
          rows={rows}
          filters={columnValueFilters}
          onFiltersChange={setColumnValueFilters}
          label="Zoek enkel in zichtbare kolommen"
          width={360}
        />
        <Tooltip title="Exporteer de huidige main tabel naar Excel">
          <span>
            <Button size="small" variant="outlined" startIcon={<FileDownloadIcon />} onClick={exportMainTable}>
              Main export
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Exporteer de main tabel met eventuele filtersets eronder toegevoegd">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileDownloadIcon />}
              onClick={exportMainTableWithFilterSets}
            >
              Export + filtersets
            </Button>
          </span>
        </Tooltip>
        <Button size="small" variant="contained" onClick={onAddFilterSet}>Filterset toevoegen</Button>
        <Tooltip title={controlOpen ? 'Controls verbergen' : 'Controls tonen'}>
          <IconButton onClick={() => setControlOpen((open) => !open)} color={controlOpen ? 'secondary' : 'primary'}><TuneIcon /></IconButton>
        </Tooltip>
      </Stack>
      <Box className={`locations-table-scroll ${resultSets.length > 0 ? 'has-filter-result-sets' : ''}`}>
        <Box
          className={`ag-theme-quartz locations-grid-box ${isCellDragSelecting ? 'is-cell-drag-selecting' : ''}`}
          ref={tableRootRef}
          style={mainGridHeight ? { height: mainGridHeight } : undefined}
          onPaste={handleGridPaste}
          onCopy={handleGridCopy}
        >
          <AgGridReact
            ref={locationGridRef}
            rowData={filteredRows}
            columnDefs={gridColumnDefs}
            getRowId={(params) => params.data.id}
            getRowClass={getLocationRowClass}
            defaultColDef={{
              filter: false,
              suppressHeaderMenuButton: true,
              cellClassRules: {
                'location-cell-multi-selected': (params) => selectedCellKeys.has(locationCellKey(params.data?.id, params.column?.getColId()))
              }
            }}
            rowHeight={38}
            headerHeight={40}
            suppressDragLeaveHidesColumns
            rowSelection="single"
            onCellMouseDown={beginCellDragSelection}
            onCellMouseOver={extendCellDragSelection}
            onCellClicked={(event) => {
              const previousFocusedCell = lastFocusedCellRef.current;
              rememberCell(event);
              setSelectedId(event.data.id);
              if (suppressNextCellClickRef.current) {
                suppressNextCellClickRef.current = false;
                return;
              }
              if (event.event?.ctrlKey || event.event?.metaKey) toggleCellSelection(event, previousFocusedCell);
              else clearCellSelection();
            }}
            onCellFocused={(event) => {
              const rowNode = event.api.getDisplayedRowAtIndex(event.rowIndex);
              const colId = event.column?.getColId?.();
              if (colId && event.rowIndex != null) {
                lastFocusedCellRef.current = { rowIndex: event.rowIndex, colId, rowId: rowNode?.data?.id };
              }
            }}
            onCellDoubleClicked={openCellEditor}
            processCellFromClipboard={processCellFromClipboard}
            suppressClickEdit
            onCellValueChanged={(event) => {
              const field = event.column?.getColId();
              if (!field || !isEditableLocationField(field) || event.oldValue === event.newValue) return;
              onApplyCellValue({ ...event.data, [field]: event.oldValue }, field, filterValueKey(event.newValue));
            }}
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
        {resultSets.length > 0 && (
          <GridResizeDivider
            label="Hoogte hoofdtabel aanpassen"
            onPointerDown={(event) => startGridHeightResize('main', null, mainGridHeight ?? 360, event)}
          />
        )}
        {resultSets.length > 0 && (
          <Stack spacing={0} className="filter-result-sets">
            {resultSets.map((resultSet) => (
              <React.Fragment key={resultSet.id}>
                <FilterResultSetPanel
                  resultSet={resultSet}
                  columnDefs={gridColumnDefs}
                  columnLabels={columnLabels}
                  height={manualResultSetHeights[resultSet.id]}
                  onRemove={onRemoveResultSet}
                  onToggle={onToggleResultSet}
                  getRowClass={getLocationRowClass}
                  onRowClicked={(event) => setSelectedId(event.data.id)}
                />
                {!resultSet.collapsed && (
                  <GridResizeDivider
                    label={`Hoogte filterset ${resultSet.title} aanpassen`}
                    onPointerDown={(event) => startGridHeightResize(
                      'filterSet',
                      resultSet.id,
                      manualResultSetHeights[resultSet.id] ?? defaultFilterResultSetGridHeight(resultSet),
                      event
                    )}
                  />
                )}
              </React.Fragment>
            ))}
          </Stack>
        )}
        <CellValueEditorPopover
          editor={cellEditor}
          rows={allRows}
          columns={locationColumnDefs}
          onClose={() => setCellEditor(null)}
          onApply={applyCellValue}
        />
        <ColumnFilterPopover
          anchorEl={headerFilter?.anchorEl}
          activeField={headerFilter?.field}
          columns={exportColumns}
          rows={rows}
          filters={columnValueFilters}
          onFiltersChange={setColumnValueFilters}
          onClose={() => setHeaderFilter(null)}
        />
        <Stack direction="row" justifyContent="space-between" alignItems="center" className="footer-bar">
          <Typography color="text.secondary">
            {filteredRows.length.toLocaleString('nl-BE')} van {allRows.length.toLocaleString('nl-BE')} locaties · sort {sort[0]?.field ?? 'code'}
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="center">
            {selectedCellKeys.size > 0 && (
              <Chip size="small" label={`${selectedCellKeys.size.toLocaleString('nl-BE')} cellen geselecteerd`} color="primary" variant="outlined" />
            )}
            <Tooltip title="Ctrl+V valideert vaste waarden per kolom; ongeldige waarden worden genegeerd.">
              <Chip size="small" label="Paste validatie actief" variant="outlined" />
            </Tooltip>
            <Chip size="small" label={`${visibleCount} zichtbare kolommen`} color="success" />
          </Stack>
        </Stack>
      </Box>
    </Paper>
  );
}

function ScopedColumnValuePicker({
  options,
  selectedFields,
  onSelectedFieldsChange,
  rows,
  filters,
  onFiltersChange,
  label,
  width
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [activeField, setActiveField] = useState('');
  const [valueQuery, setValueQuery] = useState('');
  const [draftValues, setDraftValues] = useState([]);
  const selectedColumns = options.filter((column) => selectedFields.includes(column.field));
  const activeColumn = options.find((column) => column.field === activeField);
  const uniqueValues = useMemo(() => {
    if (!activeField) return [];
    return getUniqueColumnValues(rows, activeField);
  }, [rows, activeField]);
  const visibleValues = useMemo(() => {
    const term = valueQuery.trim().toLowerCase();
    if (!term) return uniqueValues;
    return uniqueValues.filter((item) => item.label.toLowerCase().includes(term));
  }, [uniqueValues, valueQuery]);
  const popoverOpen = Boolean(anchorEl && activeColumn);

  function changeSelectedColumns(value) {
    const nextFields = value.map((column) => column.field);
    onSelectedFieldsChange(nextFields);
    onFiltersChange((current) => Object.fromEntries(
      Object.entries(current).filter(([field, values]) => nextFields.includes(field) && values.length > 0)
    ));
  }

  function openValueFilter(event, field, ensureSelected = false) {
    event.preventDefault();
    event.stopPropagation();
    if (ensureSelected && !selectedFields.includes(field)) {
      onSelectedFieldsChange([...selectedFields, field]);
    }
    setActiveField(field);
    setValueQuery('');
    setDraftValues(filters[field] ?? []);
    setAnchorEl(event.currentTarget);
  }

  function toggleDraftValue(value) {
    setDraftValues((current) => (
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    ));
  }

  function applyDraft() {
    onFiltersChange((current) => {
      const next = { ...current };
      if (draftValues.length) next[activeField] = draftValues;
      else delete next[activeField];
      return next;
    });
    setAnchorEl(null);
  }

  function resetActiveFilter() {
    setDraftValues([]);
    onFiltersChange((current) => {
      const next = { ...current };
      delete next[activeField];
      return next;
    });
  }

  return (
    <>
      <Autocomplete
        multiple
        size="small"
        options={options}
        getOptionLabel={(option) => option.label}
        value={options.filter((column) => selectedFields.includes(column.field))}
        onChange={(_, value) => changeSelectedColumns(value)}
        renderInput={(params) => <TextField {...params} label={label} />}
        renderOption={(props, option, state) => {
          const activeCount = filters[option.field]?.length ?? 0;
          return (
            <li {...props} className={`${props.className ?? ''} column-value-option`}>
              <Box className="column-value-option-copy">
                <Checkbox size="small" checked={state.selected} tabIndex={-1} />
                <Typography variant="body2" noWrap title={option.label}>{option.label}</Typography>
              </Box>
              <Button
                size="small"
                variant="text"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => openValueFilter(event, option.field, true)}
              >
                {activeCount ? `${activeCount} actief` : 'Filter'}
              </Button>
            </li>
          );
        }}
        PaperComponent={(paperProps) => (
          <Paper {...paperProps}>
            {paperProps.children}
            <Divider />
            <Box className="column-value-filter-footer" onMouseDown={(event) => event.preventDefault()}>
              <Typography variant="caption" className="column-value-filter-title">Filters per kolom</Typography>
              {selectedColumns.length === 0 && (
                <Typography variant="caption" color="text.secondary">Selecteer kolommen om waarde-filters te tonen.</Typography>
              )}
              {selectedColumns.map((column) => {
                const activeCount = filters[column.field]?.length ?? 0;
                return (
                  <Box key={column.field} className="column-value-filter-row">
                    <Typography variant="body2" noWrap title={column.label}>{column.label}</Typography>
                    <Button size="small" variant="text" onClick={(event) => openValueFilter(event, column.field)}>
                      {activeCount ? `${activeCount} actief` : 'Filter waarden...'}
                    </Button>
                  </Box>
                );
              })}
            </Box>
          </Paper>
        )}
        sx={{ width }}
      />
      <Popover
        open={popoverOpen}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ className: 'column-value-popover' }}
      >
        <Stack spacing={1}>
          <Box>
            <Typography variant="subtitle2">{activeColumn?.label}</Typography>
            <Typography variant="caption" color="text.secondary">Unieke waarden in huidige griddata</Typography>
          </Box>
          <TextField
            size="small"
            value={valueQuery}
            onChange={(event) => setValueQuery(event.target.value)}
            placeholder="Zoek waarde"
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
          />
          <List dense className="column-value-list">
            {visibleValues.map((item) => (
              <ListItemButton key={item.value} dense onClick={() => toggleDraftValue(item.value)}>
                <Checkbox size="small" edge="start" checked={draftValues.includes(item.value)} tabIndex={-1} />
                <ListItemText
                  primary={item.label}
                  secondary={`${item.count.toLocaleString('nl-BE')} rijen`}
                  primaryTypographyProps={{ noWrap: true, title: item.label }}
                />
              </ListItemButton>
            ))}
            {visibleValues.length === 0 && <Typography variant="body2" color="text.secondary" className="column-value-empty">Geen waarden gevonden.</Typography>}
          </List>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button size="small" onClick={resetActiveFilter}>Reset</Button>
            <Button size="small" variant="contained" onClick={applyDraft}>Apply</Button>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
}

function ColumnFilterPopover({ anchorEl, activeField, columns, rows, filters, onFiltersChange, onClose }) {
  const activeColumn = columns.find((column) => column.field === activeField);
  const [valueQuery, setValueQuery] = useState('');
  const [draftValues, setDraftValues] = useState([]);
  const uniqueValues = useMemo(() => {
    if (!activeColumn?.field) return [];
    return getUniqueColumnValues(rows, activeColumn.field);
  }, [rows, activeColumn?.field]);
  const visibleValues = useMemo(() => {
    const term = valueQuery.trim().toLowerCase();
    if (!term) return uniqueValues;
    return uniqueValues.filter((item) => item.label.toLowerCase().includes(term));
  }, [uniqueValues, valueQuery]);

  useEffect(() => {
    if (!activeColumn?.field || !anchorEl) return;
    setValueQuery('');
    setDraftValues(filters[activeColumn.field] ?? []);
  }, [activeColumn?.field, anchorEl, filters]);

  function toggleDraftValue(value) {
    setDraftValues((current) => (
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    ));
  }

  function applyDraft() {
    if (!activeColumn?.field) return;
    onFiltersChange((current) => {
      const next = { ...current };
      if (draftValues.length) next[activeColumn.field] = draftValues;
      else delete next[activeColumn.field];
      return next;
    });
    onClose();
  }

  function resetActiveFilter() {
    if (!activeColumn?.field) return;
    setDraftValues([]);
    onFiltersChange((current) => {
      const next = { ...current };
      delete next[activeColumn.field];
      return next;
    });
  }

  return (
    <Popover
      open={Boolean(anchorEl && activeColumn)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      PaperProps={{ className: 'column-filter-panel' }}
    >
      <Stack spacing={1}>
        <Box>
          <Typography variant="subtitle2">{activeColumn?.headerName ?? activeColumn?.field}</Typography>
          <Typography variant="caption" color="text.secondary">Filter op unieke waarden in deze kolom</Typography>
        </Box>
        <TextField
          size="small"
          value={valueQuery}
          onChange={(event) => setValueQuery(event.target.value)}
          placeholder="Zoek waarde"
          autoFocus
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
        />
        <List dense className="column-value-list">
          {visibleValues.map((item) => (
            <ListItemButton key={item.value} dense onClick={() => toggleDraftValue(item.value)}>
              <Checkbox size="small" edge="start" checked={draftValues.includes(item.value)} tabIndex={-1} />
              <ListItemText
                primary={item.label}
                secondary={`${item.count.toLocaleString('nl-BE')} rijen`}
                primaryTypographyProps={{ noWrap: true, title: item.label }}
              />
            </ListItemButton>
          ))}
          {visibleValues.length === 0 && <Typography variant="body2" color="text.secondary" className="column-value-empty">Geen waarden gevonden.</Typography>}
        </List>
        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            {draftValues.length.toLocaleString('nl-BE')} geselecteerd
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={resetActiveFilter}>Reset</Button>
            <Button size="small" variant="contained" onClick={applyDraft}>Apply</Button>
          </Stack>
        </Stack>
      </Stack>
    </Popover>
  );
}

function ColumnFiltersButton({ columns, rows, filters, onFiltersChange }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [activeField, setActiveField] = useState(columns[0]?.field ?? '');
  const [valueQuery, setValueQuery] = useState('');
  const [draftValues, setDraftValues] = useState([]);
  const activeColumn = columns.find((column) => column.field === activeField) ?? columns[0];
  const activeCount = Object.values(filters).reduce((total, values) => total + (values?.length ? 1 : 0), 0);
  const uniqueValues = useMemo(() => {
    if (!activeColumn?.field) return [];
    return getUniqueColumnValues(rows, activeColumn.field);
  }, [rows, activeColumn?.field]);
  const visibleValues = useMemo(() => {
    const term = valueQuery.trim().toLowerCase();
    if (!term) return uniqueValues;
    return uniqueValues.filter((item) => item.label.toLowerCase().includes(term));
  }, [uniqueValues, valueQuery]);

  function openFilters(event) {
    const field = activeColumn?.field ?? columns[0]?.field ?? '';
    setActiveField(field);
    setValueQuery('');
    setDraftValues(filters[field] ?? []);
    setAnchorEl(event.currentTarget);
  }

  function changeColumn(field) {
    setActiveField(field);
    setValueQuery('');
    setDraftValues(filters[field] ?? []);
  }

  function toggleDraftValue(value) {
    setDraftValues((current) => (
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    ));
  }

  function applyDraft() {
    if (!activeColumn?.field) return;
    onFiltersChange((current) => {
      const next = { ...current };
      if (draftValues.length) next[activeColumn.field] = draftValues;
      else delete next[activeColumn.field];
      return next;
    });
  }

  function resetActiveFilter() {
    if (!activeColumn?.field) return;
    setDraftValues([]);
    onFiltersChange((current) => {
      const next = { ...current };
      delete next[activeColumn.field];
      return next;
    });
  }

  function clearAllFilters() {
    setDraftValues([]);
    onFiltersChange({});
  }

  return (
    <>
      <Button
        size="small"
        variant={activeCount ? 'contained' : 'outlined'}
        startIcon={<TuneIcon />}
        onClick={openFilters}
      >
        {activeCount ? `Kolomfilters (${activeCount})` : 'Kolomfilters'}
      </Button>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ className: 'column-filter-panel' }}
      >
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              select
              size="small"
              label="Kolom"
              value={activeColumn?.field ?? ''}
              onChange={(event) => changeColumn(event.target.value)}
              sx={{ flex: 1 }}
            >
              {columns.map((column) => (
                <MenuItem key={column.field} value={column.field}>{column.headerName ?? column.field}</MenuItem>
              ))}
            </TextField>
            <Button size="small" color="error" onClick={clearAllFilters}>Alles leeg</Button>
          </Stack>
          <TextField
            size="small"
            value={valueQuery}
            onChange={(event) => setValueQuery(event.target.value)}
            placeholder="Zoek waarde"
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
          />
          <List dense className="column-value-list">
            {visibleValues.map((item) => (
              <ListItemButton key={item.value} dense onClick={() => toggleDraftValue(item.value)}>
                <Checkbox size="small" edge="start" checked={draftValues.includes(item.value)} tabIndex={-1} />
                <ListItemText
                  primary={item.label}
                  secondary={`${item.count.toLocaleString('nl-BE')} rijen`}
                  primaryTypographyProps={{ noWrap: true, title: item.label }}
                />
              </ListItemButton>
            ))}
            {visibleValues.length === 0 && <Typography variant="body2" color="text.secondary" className="column-value-empty">Geen waarden gevonden.</Typography>}
          </List>
          <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
            <Typography variant="caption" color="text.secondary">
              {(filters[activeColumn?.field] ?? []).length.toLocaleString('nl-BE')} actief voor deze kolom
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={resetActiveFilter}>Reset kolom</Button>
              <Button size="small" variant="contained" onClick={applyDraft}>Apply</Button>
            </Stack>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
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
  const [pasteNotice, setPasteNotice] = useState('');
  const [treeOpen, setTreeOpen] = useState(true);
  const [controlOpen, setControlOpen] = useState(true);
  const [detailTab, setDetailTab] = useState('overview');
  const [columns, setColumns] = useState(defaultLocationColumns);
  const [scopedColumns, setScopedColumns] = useState([]);
  const [columnValueFilters, setColumnValueFilters] = useState({});
  const [filterResultSets, setFilterResultSets] = useState([]);
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
  const locationColumnLabels = useMemo(
    () => Object.fromEntries(locationBaseColumns.map((column) => [column.field, column.label])),
    []
  );
  const filteredRows = useMemo(
    () => rows.filter((row) => matchesLocationQuery(row, queryText, scopedColumns) && matchesColumnValueFilters(row, columnValueFilters)),
    [rows, queryText, scopedColumns, columnValueFilters]
  );
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
      editable: isEditableLocationField(column.field),
      filter: false,
      suppressHeaderMenuButton: true,
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
    if (!pasteNotice) return undefined;
    const timer = window.setTimeout(() => setPasteNotice(''), 3500);
    return () => window.clearTimeout(timer);
  }, [pasteNotice]);

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

  function buildNextLocationRow(row, values) {
    const nextRow = { ...row };
    Object.entries(values).forEach(([field, valueKey]) => {
      if (!isEditableLocationField(field)) return;
      const value = valueKey === '' ? null : valueKey;
      nextRow[field] = value;

      if (field === 'type') {
        const matchingType = rows.find((item) => filterValueKey(item.type) === valueKey);
        nextRow.typeCode = matchingType?.typeCode ?? row.typeCode;
        nextRow.type = matchingType?.type ?? value;
      }

      if (field === 'sourcePage') {
        nextRow.sourcePage = valueKey === '' ? null : Number(valueKey);
      }
    });
    nextRow.displayName = `${nextRow.code} - ${nextRow.name}`;
    return nextRow;
  }

  async function updateLocationCell(row, field, valueKey) {
    if (!isEditableLocationField(field)) return;
    const nextRow = buildNextLocationRow(row, { [field]: valueKey });
    setError('');
    const previousRows = rows;
    setRows((current) => current.map((item) => item.id === row.id ? nextRow : item));

    const response = await fetch(`${API_BASE}/api/locations/${row.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(nextRow)
    });
    const payload = await response.json();
    if (!response.ok) {
      setRows(previousRows);
      setError(payload.error ?? 'Celwaarde kon niet worden bijgewerkt');
      return;
    }
    loadLocations();
  }

  async function updateLocationCells(changes) {
    if (!changes.length) return;
    setError('');
    const previousRows = rows;
    const nextRowsById = new Map(changes.map((change) => [change.row.id, buildNextLocationRow(change.row, change.values)]));
    setRows((current) => current.map((item) => nextRowsById.get(item.id) ?? item));

    const responses = await Promise.all([...nextRowsById.values()].map(async (nextRow) => {
      const response = await fetch(`${API_BASE}/api/locations/${nextRow.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(nextRow)
      });
      const payload = await response.json();
      return { response, payload };
    }));

    const failed = responses.find((item) => !item.response.ok);
    if (failed) {
      setRows(previousRows);
      setError(failed.payload.error ?? 'Geplakte waarden konden niet worden bijgewerkt');
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
      if (!nextVisible) setColumnValueFilters((currentFilters) => {
        const nextFilters = { ...currentFilters };
        delete nextFilters[field];
        return nextFilters;
      });
      return current.map((column) => column.field === field ? { ...column, visible: nextVisible } : column);
    });
  }

  function cycleLocationPin(field) {
    const nextPin = { null: 'left', left: 'right', right: null };
    updateLocationColumns((current) => current.map((column) => column.field === field ? { ...column, pin: nextPin[column.pin ?? 'null'] } : column));
  }

  function toggleLocationPinLeft(field) {
    updateLocationColumns((current) => current.map((column) => {
      if (column.field !== field) return column;
      return { ...column, pin: column.pin === 'left' ? null : 'left' };
    }));
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

  function addFilterResultSet() {
    const api = locationGridRef.current?.api;
    if (!api) return;
    const rowsSnapshot = [];
    api.forEachNodeAfterFilterAndSort((rowNode) => {
      if (rowNode.data) rowsSnapshot.push(rowNode.data);
    });
    const filterModel = {
      ag: api.getFilterModel(),
      quick: queryText.trim(),
      scopedColumns: [...scopedColumns],
      valueFilters: cloneFilterValues(columnValueFilters)
    };
    const id = `filter-set-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setFilterResultSets((current) => [
      {
        id,
        title: titleForFilterSet(filterModel, locationColumnLabels),
        filterModel,
        rows: rowsSnapshot,
        createdAt: new Date().toISOString(),
        collapsed: false
      },
      ...current
    ]);
  }

  function removeFilterResultSet(id) {
    setFilterResultSets((current) => current.filter((resultSet) => resultSet.id !== id));
  }

  function toggleFilterResultSet(id) {
    setFilterResultSets((current) => current.map((resultSet) => (
      resultSet.id === id ? { ...resultSet, collapsed: !resultSet.collapsed } : resultSet
    )));
  }

  function resetLocationView() {
    setColumns(defaultLocationColumns());
    setScopedColumns([]);
    setColumnValueFilters({});
    setFilterResultSets([]);
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
      <Paper className="locations-toolbar" elevation={0}>
        <Stack direction="row" spacing={1.25} justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography variant="h6" noWrap>Locaties</Typography>
            <Chip size="small" label={`${rows.length.toLocaleString('nl-BE')} items`} variant="outlined" />
            {filteredRows.length !== rows.length && (
              <Chip size="small" label={`${filteredRows.length.toLocaleString('nl-BE')} gefilterd`} color="primary" variant="outlined" />
            )}
          </Stack>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Button size="small" variant={treeOpen ? 'contained' : 'outlined'} startIcon={<AccountTreeIcon />} onClick={() => setTreeOpen((open) => !open)}>
              Tree
            </Button>
            <Tooltip title={controlOpen ? 'Controls verbergen' : 'Controls tonen'}>
              <IconButton size="small" onClick={() => setControlOpen((open) => !open)} color={controlOpen ? 'secondary' : 'primary'}><TuneIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Tooltip title="Reset locatie view">
              <IconButton size="small" onClick={resetLocationView}><RestartAltIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </Paper>

      {loading && <LinearProgress />}
      {error && <Alert severity="warning">{error}</Alert>}
      {pasteNotice && <Alert severity="info" onClose={() => setPasteNotice('')}>{pasteNotice}</Alert>}

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

        <MainDataGrid
          controlOpen={controlOpen}
          queryText={queryText}
          setQueryText={setQueryText}
          visibleSearchableColumns={visibleSearchableColumns}
          scopedColumns={scopedColumns}
          setScopedColumns={setScopedColumns}
          rows={rows}
          columnValueFilters={columnValueFilters}
          setColumnValueFilters={setColumnValueFilters}
          setControlOpen={setControlOpen}
          locationGridRef={locationGridRef}
          filteredRows={filteredRows}
          allRows={rows}
          locationColumnDefs={locationColumnDefs}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          setSort={setSort}
          sort={sort}
          visibleCount={visibleCount}
          onAddFilterSet={addFilterResultSet}
          resultSets={filterResultSets}
          columnLabels={locationColumnLabels}
          onRemoveResultSet={removeFilterResultSet}
          onToggleResultSet={toggleFilterResultSet}
          onTogglePinLeft={toggleLocationPinLeft}
          onApplyCellValue={updateLocationCell}
          onApplyPastedCells={updateLocationCells}
          onPasteNotice={setPasteNotice}
        />

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
              <Typography className="topbar-subtitle" color="text.secondary">PostgreSQL + AG Grid Community + Material UI control layer</Typography>
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

import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AgGridReact } from 'ag-grid-react';
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
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
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

function createLocationsPageLoader() {
  return lazy(() => import('./LocationsPage.jsx'));
}

function createPlanningPageLoader() {
  return lazy(() => import('./PlanningPage.jsx'));
}

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

function stateForDraft(schema, draft) {
  const tableConfig = schema[draft.rootTable];
  if (!tableConfig) return null;
  const draftColumnsByName = new Map((draft.columns ?? []).map((column) => [column.name, column]));
  const selectedColumns = (draft.columns ?? [])
    .map((draftColumn, index) => {
      const baseColumn = tableConfig.columns.find((column) => column.field === draftColumn.name);
      if (!baseColumn) return null;
      const editType = draftColumn.editType ?? baseColumn.editType ?? 'readonly';
      return {
        ...baseColumn,
        label: draftColumn.label ?? baseColumn.label,
        description: draftColumn.description ?? baseColumn.description ?? '',
        visible: draftColumn.visible !== false,
        order: Number.isFinite(Number(draftColumn.order)) ? Number(draftColumn.order) : index,
        pin: draftColumn.pin ?? baseColumn.pinned ?? null,
        width: draftColumn.width ?? baseColumn.width,
        editType,
        editable: editType !== 'readonly',
        required: draftColumn.required ?? baseColumn.required,
        min: draftColumn.min ?? baseColumn.min,
        max: draftColumn.max ?? baseColumn.max,
        readOnlyReason: editType === 'readonly' ? 'Alleen-lezen in builder draft.' : baseColumn.readOnlyReason
      };
    })
    .filter(Boolean);
  const remainingColumns = tableConfig.columns
    .filter((column) => !draftColumnsByName.has(column.field))
    .map((column, index) => ({
      ...column,
      visible: false,
      order: selectedColumns.length + index,
      pin: column.pinned ?? null
    }));

  return {
    ...defaultState(schema),
    table: draft.rootTable,
    columns: [...selectedColumns, ...remainingColumns],
    selectedFacet: selectedColumns[0]?.field ?? tableConfig.columns[0]?.field,
    quick: '',
    scopedColumns: [],
    facets: {},
    sort: tableConfig.defaultSort ? [{ ...tableConfig.defaultSort }] : []
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

function editTypeLabel(editType) {
  if (editType === 'singleSelect') return 'lijst';
  if (editType === 'relationSelect') return 'relatie';
  if (editType === 'number') return 'getal';
  if (editType === 'date') return 'datum';
  if (editType === 'boolean') return 'ja/nee';
  if (editType === 'text') return 'tekst';
  return 'vast';
}

const builderEditTypes = [
  { value: 'readonly', label: 'Read-only', types: null },
  { value: 'text', label: 'Tekst', types: ['text', 'long_text', 'markdown', 'uuid'] },
  { value: 'number', label: 'Getal', types: ['number'] },
  { value: 'date', label: 'Datum', types: ['date', 'datetime'] }
];

function builderEditTypeFits(editType, columnType) {
  const option = builderEditTypes.find((item) => item.value === editType);
  return !option?.types || option.types.includes(columnType);
}

function TableColumnHeader({ displayName, editType, editable, readOnlyReason }) {
  const label = editTypeLabel(editType);
  const title = editable
    ? `${displayName}: bewerkbaar als ${label}`
    : `${displayName}: ${readOnlyReason ?? 'alleen-lezen'}`;
  return (
    <Tooltip title={title}>
      <span className={`table-column-header ${editable ? 'is-editable' : 'is-readonly'}`}>
        <span className="table-column-header-name">{displayName}</span>
        <span className="table-column-header-badge">{label}</span>
      </span>
    </Tooltip>
  );
}

function SchemaBuilderPanel({
  catalog,
  catalogError,
  drafts,
  draftsError,
  activeDraft,
  savingDraft,
  selectedRootTable,
  onSelectRootTable,
  onUseTable,
  onOpenDraft,
  onPreviewDraft,
  onSaveDraft
}) {
  const [draftName, setDraftName] = useState('');
  const [selectedColumns, setSelectedColumns] = useState([]);
  const orderedDraftColumns = useMemo(
    () => [...selectedColumns].sort((a, b) => a.order - b.order),
    [selectedColumns]
  );
  const visibleDraftColumns = orderedDraftColumns.filter((column) => column.visible !== false);

  useEffect(() => {
    if (!activeDraft) return;
    const rootTable = catalog?.tables.find((table) => table.name === activeDraft.rootTable);
    setDraftName(activeDraft.name ?? '');
    setSelectedColumns((activeDraft.columns ?? []).map((column, order) => ({
      ...(typeof column === 'string' ? { name: column } : column),
      label: typeof column === 'string'
        ? rootTable?.columns.find((item) => item.name === column)?.label ?? column
        : column.label ?? rootTable?.columns.find((item) => item.name === column.name)?.label ?? column.name,
      description: typeof column === 'string' ? '' : column.description ?? '',
      visible: typeof column === 'string' ? true : column.visible !== false,
      order: typeof column === 'string' || !Number.isFinite(Number(column.order)) ? order : Number(column.order),
      pin: typeof column === 'string' ? null : column.pin ?? null,
      width: typeof column === 'string' ? null : column.width ?? null,
      editType: typeof column === 'string' ? 'readonly' : column.editType ?? 'readonly',
      required: typeof column === 'string' ? false : column.required === true,
      min: typeof column === 'string' ? null : column.min ?? null,
      max: typeof column === 'string' ? null : column.max ?? null
    })));
  }, [activeDraft, catalog]);

  useEffect(() => {
    if (!catalog || activeDraft?.rootTable === selectedRootTable) return;
    const rootTable = catalog.tables.find((table) => table.name === selectedRootTable) ?? catalog.tables[0];
    setDraftName((current) => current || `${rootTable?.label ?? 'Nieuwe view'} draft`);
    setSelectedColumns((rootTable?.columns ?? []).slice(0, 6).map((column, order) => ({
      name: column.name,
      label: column.label,
      description: '',
      type: column.type,
      nullable: column.nullable,
      visible: true,
      order,
      pin: null,
      width: null,
      editType: 'readonly',
      required: false,
      min: null,
      max: null
    })));
  }, [catalog, selectedRootTable, activeDraft?.rootTable]);

  if (catalogError) {
    return (
      <Alert severity="warning">
        Schema-catalogus kon niet worden geladen: {catalogError}
      </Alert>
    );
  }
  if (!catalog) return <LinearProgress />;

  const rootTable = catalog.tables.find((table) => table.name === selectedRootTable) ?? catalog.tables[0];
  const supportedRelations = rootTable?.relations.filter((relation) => relation.supported) ?? [];
  const unsupportedRelations = rootTable?.relations.filter((relation) => !relation.supported) ?? [];
  const canSave = Boolean(draftName.trim() && rootTable && selectedColumns.length > 0);
  const selectedColumnNames = new Set(selectedColumns.map((column) => column.name));

  function toggleDraftColumn(columnName) {
    setSelectedColumns((current) => {
      if (current.some((column) => column.name === columnName)) {
        return current
          .filter((column) => column.name !== columnName)
          .map((column, order) => ({ ...column, order }));
      }
      const catalogColumn = rootTable.columns.find((column) => column.name === columnName);
      if (!catalogColumn) return current;
      return [...current, {
        name: catalogColumn.name,
        label: catalogColumn.label,
        description: '',
        type: catalogColumn.type,
        nullable: catalogColumn.nullable,
        visible: true,
        order: current.length,
        pin: null,
        width: null,
        editType: 'readonly',
        required: false,
        min: null,
        max: null
      }];
    });
  }

  function updateDraftColumn(columnName, patch) {
    setSelectedColumns((current) => current.map((column) => (
      column.name === columnName ? { ...column, ...patch } : column
    )));
  }

  function moveDraftColumn(columnName, direction) {
    setSelectedColumns((current) => {
      const sorted = [...current].sort((a, b) => a.order - b.order);
      const index = sorted.findIndex((column) => column.name === columnName);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= sorted.length) return current;
      return arrayMove(sorted, index, nextIndex).map((column, order) => ({ ...column, order }));
    });
  }

  function currentDraftPayload() {
    return {
      id: activeDraft?.rootTable === rootTable?.name ? activeDraft.id : undefined,
      name: draftName,
      rootTable: rootTable?.name,
      columns: orderedDraftColumns
    };
  }

  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="subtitle2" fontWeight={800}>Table View Builder</Typography>
        <Typography variant="body2" color="text.secondary">
          Kies een bestaande database table als root voor een toekomstige view.
        </Typography>
      </Box>
      <TextField
        select
        size="small"
        label="Root table"
        value={rootTable?.name ?? ''}
        onChange={(event) => onSelectRootTable(event.target.value)}
      >
        {catalog.tables.map((table) => (
          <MenuItem key={table.name} value={table.name}>
            {table.label}
          </MenuItem>
        ))}
      </TextField>

      {rootTable && (
        <Stack spacing={1.25}>
          <Paper variant="outlined" className="schema-builder-draft-card">
            <Stack spacing={1}>
              <TextField
                size="small"
                label="Draftnaam"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
              <Button
                size="small"
                variant="contained"
                startIcon={<SaveIcon />}
                disabled={!canSave || savingDraft}
                onClick={() => onSaveDraft(currentDraftPayload())}
              >
                {savingDraft ? 'Opslaan...' : activeDraft?.rootTable === rootTable.name ? 'Draft bijwerken' : 'Draft opslaan'}
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={!rootTable.configured || selectedColumns.length === 0}
                onClick={() => onPreviewDraft(currentDraftPayload())}
              >
                Preview in Table Lab
              </Button>
              <Typography variant="caption" color="text.secondary">
                {selectedColumns.length} geselecteerde kolommen, {visibleDraftColumns.length} zichtbaar
              </Typography>
            </Stack>
          </Paper>

          <Paper variant="outlined" className="schema-builder-preview">
            <Typography className="schema-builder-section-title" variant="caption">Preview</Typography>
            <Box className="schema-builder-preview-grid">
              {visibleDraftColumns.length === 0 && (
                <Typography variant="body2" color="text.secondary">Geen zichtbare kolommen geselecteerd.</Typography>
              )}
              {visibleDraftColumns.map((column) => (
                <Box
                  key={column.name}
                  className={`schema-builder-preview-cell ${column.pin ? `is-pinned-${column.pin}` : ''}`}
                  sx={{ width: column.width ? `${column.width}px` : undefined }}
                >
                  <Typography noWrap fontWeight={800}>{column.label}</Typography>
                  <Typography noWrap variant="caption" color="text.secondary">
                    {column.description || `${column.name} · ${column.type}`}
                  </Typography>
                  <Chip
                    className="schema-builder-edit-chip"
                    size="small"
                    color={column.editType === 'readonly' ? 'default' : 'secondary'}
                    label={column.editType === 'readonly' ? 'read-only' : column.editType}
                  />
                </Box>
              ))}
            </Box>
          </Paper>

          <Box>
            <Typography className="schema-builder-section-title" variant="caption">Opgeslagen drafts</Typography>
            {draftsError && <Alert severity="warning">{draftsError}</Alert>}
            <List dense className="schema-builder-list schema-builder-drafts">
              {drafts.length === 0 && (
                <ListItem dense disablePadding>
                  <ListItemText primary="Nog geen drafts opgeslagen." />
                </ListItem>
              )}
              {drafts.map((draft) => (
                <ListItemButton
                  key={draft.id}
                  selected={activeDraft?.id === draft.id}
                  onClick={() => onOpenDraft(draft.id)}
                >
                  <ListItemText
                    primary={draft.name}
                    secondary={`${draft.rootTable} · ${draft.columns.filter((column) => column.visible !== false).length}/${draft.columns.length} zichtbaar`}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>

          <Paper variant="outlined" className="schema-builder-summary">
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={800} noWrap>{rootTable.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{rootTable.name}</Typography>
                </Box>
                <Chip size="small" label={rootTable.configured ? 'fallback bestaat' : 'nieuw'} color={rootTable.configured ? 'success' : 'default'} />
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={`${rootTable.columns.length} kolommen`} />
                <Chip size="small" label={`${supportedRelations.length} relaties`} />
                {unsupportedRelations.length > 0 && <Chip size="small" color="warning" label={`${unsupportedRelations.length} niet ondersteund`} />}
              </Stack>
              {rootTable.configured && (
                <Button size="small" variant="outlined" onClick={() => onUseTable(rootTable.name)}>
                  Open in Table Lab
                </Button>
              )}
            </Stack>
          </Paper>

          <Box>
            <Typography className="schema-builder-section-title" variant="caption">Kolommen</Typography>
            <List dense className="schema-builder-list">
              {rootTable.columns.map((column) => (
                <ListItem key={column.name} dense disablePadding secondaryAction={
                  <Checkbox
                    edge="end"
                    checked={selectedColumnNames.has(column.name)}
                    onChange={() => toggleDraftColumn(column.name)}
                  />
                }>
                  <ListItemText
                    primary={column.label}
                    secondary={`${column.name} · ${column.type}${column.nullable ? ' · optioneel' : ' · verplicht'}`}
                  />
                </ListItem>
              ))}
            </List>
          </Box>

          <Box>
            <Typography className="schema-builder-section-title" variant="caption">Kolomconfiguratie</Typography>
            <Stack spacing={1}>
              {orderedDraftColumns.length === 0 && (
                <Typography variant="body2" color="text.secondary">Selecteer kolommen om ze te configureren.</Typography>
              )}
              {orderedDraftColumns.map((column, index) => (
                <Paper key={column.name} variant="outlined" className="schema-builder-column-config">
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Checkbox
                        checked={column.visible !== false}
                        onChange={(event) => updateDraftColumn(column.name, { visible: event.target.checked })}
                      />
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography fontWeight={800} noWrap>{column.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{column.type}</Typography>
                      </Box>
                      <Tooltip title="Omhoog">
                        <span>
                          <IconButton size="small" disabled={index === 0} onClick={() => moveDraftColumn(column.name, -1)}>
                            <KeyboardArrowUpIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Omlaag">
                        <span>
                          <IconButton size="small" disabled={index === orderedDraftColumns.length - 1} onClick={() => moveDraftColumn(column.name, 1)}>
                            <KeyboardArrowDownIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                    <TextField
                      size="small"
                      label="Label"
                      value={column.label}
                      onChange={(event) => updateDraftColumn(column.name, { label: event.target.value })}
                    />
                    <TextField
                      size="small"
                      label="Beschrijving"
                      value={column.description ?? ''}
                      onChange={(event) => updateDraftColumn(column.name, { description: event.target.value })}
                    />
                    <Stack direction="row" spacing={1}>
                      <TextField
                        select
                        size="small"
                        label="Pin"
                        value={column.pin ?? ''}
                        onChange={(event) => updateDraftColumn(column.name, { pin: event.target.value || null })}
                        sx={{ flex: 1 }}
                      >
                        <MenuItem value="">Geen</MenuItem>
                        <MenuItem value="left">Links</MenuItem>
                        <MenuItem value="right">Rechts</MenuItem>
                      </TextField>
                      <TextField
                        size="small"
                        label="Breedte"
                        type="number"
                        value={column.width ?? ''}
                        onChange={(event) => updateDraftColumn(column.name, { width: event.target.value ? Number(event.target.value) : null })}
                        sx={{ width: 120 }}
                      />
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <TextField
                        select
                        size="small"
                        label="Edit type"
                        value={column.editType ?? 'readonly'}
                        onChange={(event) => updateDraftColumn(column.name, { editType: event.target.value })}
                        sx={{ flex: 1 }}
                      >
                        {builderEditTypes.map((option) => (
                          <MenuItem
                            key={option.value}
                            value={option.value}
                            disabled={!builderEditTypeFits(option.value, column.type)}
                          >
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <FormControl size="small" sx={{ width: 128 }}>
                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ height: 40 }}>
                          <Checkbox
                            checked={column.required === true}
                            onChange={(event) => updateDraftColumn(column.name, { required: event.target.checked })}
                            disabled={(column.editType ?? 'readonly') === 'readonly'}
                          />
                          <Typography variant="body2">Verplicht</Typography>
                        </Stack>
                      </FormControl>
                    </Stack>
                    {(column.editType ?? 'readonly') === 'number' && (
                      <Stack direction="row" spacing={1}>
                        <TextField
                          size="small"
                          label="Min"
                          type="number"
                          value={column.min ?? ''}
                          onChange={(event) => updateDraftColumn(column.name, { min: event.target.value ? Number(event.target.value) : null })}
                          sx={{ flex: 1 }}
                        />
                        <TextField
                          size="small"
                          label="Max"
                          type="number"
                          value={column.max ?? ''}
                          onChange={(event) => updateDraftColumn(column.name, { max: event.target.value ? Number(event.target.value) : null })}
                          sx={{ flex: 1 }}
                        />
                      </Stack>
                    )}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Box>

          <Box>
            <Typography className="schema-builder-section-title" variant="caption">Directe relaties</Typography>
            <List dense className="schema-builder-list">
              {rootTable.relations.length === 0 && (
                <ListItem dense disablePadding>
                  <ListItemText primary="Geen directe foreign keys gevonden." />
                </ListItem>
              )}
              {rootTable.relations.map((relation) => (
                <ListItem key={`${relation.name}-${relation.column}`} dense disablePadding>
                  <ListItemText
                    primary={`${relation.column} -> ${relation.targetTable}.${relation.targetColumn}`}
                    secondary={relation.supported ? 'Ondersteund als directe relatie' : relation.unsupportedReason}
                  />
                  <Chip size="small" color={relation.supported ? 'success' : 'warning'} label={relation.supported ? 'veilig' : 'later'} />
                </ListItem>
              ))}
            </List>
          </Box>
        </Stack>
      )}
    </Stack>
  );
}

function confidenceColor(confidence) {
  if (confidence === 'explicit') return 'success';
  if (confidence === 'inferred') return 'warning';
  return 'default';
}

class FeatureLoadErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error) {
    console.error('Lazy feature failed to load', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return this.props.fallback({
      error: this.state.error,
      retry: () => {
        this.setState({ error: null });
        this.props.onRetry?.();
      }
    });
  }
}

function LocationsLoadingFallback() {
  return (
    <Paper className="locations-toolbar" elevation={0}>
      <Stack spacing={1}>
        <Typography variant="h6">Locaties laden</Typography>
        <LinearProgress />
      </Stack>
    </Paper>
  );
}

function PlanningLoadingFallback() {
  return (
    <Paper className="locations-toolbar" elevation={0}>
      <Stack spacing={1}>
        <Typography variant="h6">Planning laden</Typography>
        <LinearProgress />
      </Stack>
    </Paper>
  );
}

function LocationsLoadErrorFallback({ error, onRetry, onBackToTables }) {
  return (
    <Paper className="locations-toolbar" elevation={0}>
      <Stack spacing={1.25}>
        <Alert severity="warning">
          Locaties konden niet worden geladen. Controleer je verbinding of probeer opnieuw.
        </Alert>
        <Typography variant="caption" color="text.secondary">
          {error?.message ?? 'Onbekende laadfout'}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={onRetry}>Opnieuw proberen</Button>
          <Button variant="outlined" onClick={onBackToTables}>Terug naar tabellen</Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

function PlanningLoadErrorFallback({ error, onRetry, onBackToTables }) {
  return (
    <Paper className="locations-toolbar" elevation={0}>
      <Stack spacing={1.25}>
        <Alert severity="warning">
          Planning kon niet worden geladen. Controleer de API of probeer opnieuw.
        </Alert>
        <Typography variant="caption" color="text.secondary">
          {error?.message ?? 'Onbekende laadfout'}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={onRetry}>Opnieuw proberen</Button>
          <Button variant="outlined" onClick={onBackToTables}>Terug naar tabellen</Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

function App() {
  const [appTab, setAppTab] = useState('tables');
  const [locationsLoadAttempt, setLocationsLoadAttempt] = useState(0);
  const [planningLoadAttempt, setPlanningLoadAttempt] = useState(0);
  const [schema, setSchema] = useState(null);
  const [schemaCatalog, setSchemaCatalog] = useState(null);
  const [schemaCatalogError, setSchemaCatalogError] = useState('');
  const [tableViewDrafts, setTableViewDrafts] = useState([]);
  const [tableViewDraftsError, setTableViewDraftsError] = useState('');
  const [activeTableViewDraft, setActiveTableViewDraft] = useState(null);
  const [savingTableViewDraft, setSavingTableViewDraft] = useState(false);
  const [selectedRootTable, setSelectedRootTable] = useState('');
  const [state, setState] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [timing, setTiming] = useState({});
  const [stats, setStats] = useState([]);
  const [facetValues, setFacetValues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tableNotice, setTableNotice] = useState('');
  const [tab, setTab] = useState('columns');
  const [controlOpen, setControlOpen] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const LocationsPage = useMemo(createLocationsPageLoader, [locationsLoadAttempt]);
  const PlanningPage = useMemo(createPlanningPageLoader, [planningLoadAttempt]);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/schema`).then((response) => response.json()),
      fetch(`${API_BASE}/api/schema-catalog`).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }).catch((error) => ({ error: error.message })),
      fetch(`${API_BASE}/api/table-view-drafts`).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }).catch((error) => ({ error: error.message })),
      fetch(`${API_BASE}/api/stats`).then((response) => response.json()).catch(() => ({ tables: [] }))
    ]).then(([schemaPayload, catalogPayload, draftsPayload, statsPayload]) => {
      setSchema(schemaPayload);
      setState(loadState(schemaPayload));
      if (catalogPayload.error) {
        setSchemaCatalogError(catalogPayload.error);
      } else {
        setSchemaCatalog(catalogPayload);
        setSelectedRootTable(catalogPayload.tables?.[0]?.name ?? '');
      }
      if (draftsPayload.error) {
        setTableViewDraftsError(draftsPayload.error);
      } else {
        setTableViewDrafts(draftsPayload.drafts ?? []);
      }
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
  const editableColumnCount = useMemo(
    () => state?.columns?.filter((column) => column.editable === true).length ?? 0,
    [state?.columns]
  );

  const columnDefs = useMemo(() => orderedColumns
    .filter((column) => column.visible)
    .map((column) => {
      const selectValues = column.editType === 'singleSelect' ? column.options ?? [] : [];
      const usesSelectEditor = column.editType === 'singleSelect';
      return ({
      field: column.field,
      headerName: column.label,
      headerComponent: TableColumnHeader,
      headerComponentParams: {
        editType: column.editType,
        editable: column.editable === true,
        readOnlyReason: column.readOnlyReason
      },
      width: column.width,
      pinned: column.pin,
      sortable: true,
      resizable: true,
      editable: column.editable === true,
      cellEditor: usesSelectEditor ? 'agSelectCellEditor' : undefined,
      cellEditorParams: usesSelectEditor ? { values: selectValues } : undefined,
      singleClickEdit: column.editable === true,
      cellClass: column.editable === true ? 'table-cell-editable' : 'table-cell-readonly',
      valueParser: (params) => column.editType === 'number' || column.type === 'number' ? Number(params.newValue) : params.newValue,
      cellRenderer: (params) => highlight(params.value, state?.quick),
      valueFormatter: (params) => (typeof params.value === 'object' ? JSON.stringify(params.value) : params.value)
    });
    }), [orderedColumns, state?.quick]);

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

  async function refreshTableViewDrafts() {
    const response = await fetch(`${API_BASE}/api/table-view-drafts`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Drafts konden niet worden geladen.');
    setTableViewDrafts(payload.drafts ?? []);
    setTableViewDraftsError('');
    return payload.drafts ?? [];
  }

  async function saveTableViewDraft(draft) {
    setSavingTableViewDraft(true);
    setTableViewDraftsError('');
    try {
      const response = await fetch(`${API_BASE}/api/table-view-drafts${draft.id ? `/${draft.id}` : ''}`, {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft)
      });
      const payload = await response.json();
      if (!response.ok) {
        const message = Object.values(payload.fieldErrors ?? {})[0] ?? payload.error ?? 'Draft kon niet worden opgeslagen.';
        throw new Error(message);
      }
      setActiveTableViewDraft(payload.draft);
      setSelectedRootTable(payload.draft.rootTable);
      await refreshTableViewDrafts();
    } catch (error) {
      setTableViewDraftsError(error.message);
    } finally {
      setSavingTableViewDraft(false);
    }
  }

  async function openTableViewDraft(id) {
    setTableViewDraftsError('');
    try {
      const response = await fetch(`${API_BASE}/api/table-view-drafts/${id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Draft kon niet worden geopend.');
      setActiveTableViewDraft(payload.draft);
      setSelectedRootTable(payload.draft.rootTable);
    } catch (error) {
      setTableViewDraftsError(error.message);
    }
  }

  async function updateConfiguredTableCell(event) {
    const field = event.column?.getColId();
    if (!field || event.oldValue === event.newValue) return;
    const column = state.columns.find((item) => item.field === field);
    if (!column?.editable) return;
    const previousRows = rows;
    setRows((current) => current.map((row) => row.id === event.data.id ? { ...row, [field]: event.newValue } : row));
    setTableNotice(`${column.label ?? field} opslaan...`);
    const response = await fetch(`${API_BASE}/api/rows/cell`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        table: state.table,
        id: event.data.id,
        field,
        value: event.newValue
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      setRows(previousRows);
      setTableNotice(payload.fieldErrors?.[field] ?? payload.error ?? 'Celwaarde kon niet worden opgeslagen');
      return;
    }
    setTableNotice(`${column.label ?? field} opgeslagen`);
    window.setTimeout(() => setTableNotice(''), 1800);
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box className={`app-shell ${appTab === 'locations' || appTab === 'planning' ? 'app-shell-locations' : ''}`}>
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
                <Tab value="planning" label="Planning" />
              </Tabs>
              <Stack direction="row" spacing={1} className="stats-chips">
                {stats.map((item) => <Chip key={item.table_name} label={`${item.table_name}: ${item.total.toLocaleString('nl-BE')}`} />)}
              </Stack>
            </Stack>
          </Toolbar>
        </AppBar>

        {appTab === 'locations' && (
          <FeatureLoadErrorBoundary
            resetKey={locationsLoadAttempt}
            onRetry={() => setLocationsLoadAttempt((attempt) => attempt + 1)}
            fallback={
              ({ error, retry }) => (
                <LocationsLoadErrorFallback
                  error={error}
                  onRetry={retry}
                  onBackToTables={() => setAppTab('tables')}
                />
              )
            }
          >
            <Suspense fallback={<LocationsLoadingFallback />}>
              <LocationsPage />
            </Suspense>
          </FeatureLoadErrorBoundary>
        )}

        {appTab === 'planning' && (
          <FeatureLoadErrorBoundary
            resetKey={planningLoadAttempt}
            onRetry={() => setPlanningLoadAttempt((attempt) => attempt + 1)}
            fallback={
              ({ error, retry }) => (
                <PlanningLoadErrorFallback
                  error={error}
                  onRetry={retry}
                  onBackToTables={() => setAppTab('tables')}
                />
              )
            }
          >
            <Suspense fallback={<PlanningLoadingFallback />}>
              <PlanningPage />
            </Suspense>
          </FeatureLoadErrorBoundary>
        )}

        {appTab === 'tables' && <Stack direction="row" spacing={2} className="workspace">
          <Paper className={controlOpen ? 'main-panel' : 'main-panel main-panel-full'} elevation={0}>
            <Stack direction="row" spacing={1.5} alignItems="center" className="query-bar">
              <FormControl size="small" sx={{ minWidth: 190 }}>
                <Select value={state.table} onChange={(event) => setState(stateForTable(schema, event.target.value))}>
                  {Object.entries(schema).map(([key, config]) => <MenuItem key={key} value={key}>{config.label}</MenuItem>)}
                </Select>
              </FormControl>
              {editableColumnCount > 0 && (
                <Chip
                  className="table-editability-chip"
                  size="small"
                  color="secondary"
                  variant="outlined"
                  label={`${editableColumnCount} bewerkbare kolommen`}
                />
              )}
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
            {tableNotice && <Alert severity={tableNotice.includes('kon niet') || tableNotice.includes('ongeldig') ? 'warning' : 'info'} onClose={() => setTableNotice('')}>{tableNotice}</Alert>}
            <Box className="ag-theme-quartz grid-box">
              <AgGridReact
                rowData={rows}
                columnDefs={columnDefs}
                rowHeight={44}
                headerHeight={48}
                suppressDragLeaveHidesColumns
                stopEditingWhenCellsLoseFocus
                singleClickEdit
                onCellValueChanged={updateConfiguredTableCell}
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
                <Tab value="builder" label="Builder" />
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

              {tab === 'builder' && (
                <SchemaBuilderPanel
                  catalog={schemaCatalog}
                  catalogError={schemaCatalogError}
                  drafts={tableViewDrafts}
                  draftsError={tableViewDraftsError}
                  activeDraft={activeTableViewDraft}
                  savingDraft={savingTableViewDraft}
                  selectedRootTable={selectedRootTable}
                  onSelectRootTable={(tableName) => {
                    setSelectedRootTable(tableName);
                    setActiveTableViewDraft(null);
                  }}
                  onUseTable={(table) => {
                    if (!schema[table]) return;
                    setState(stateForTable(schema, table));
                  }}
                  onOpenDraft={openTableViewDraft}
                  onPreviewDraft={(draft) => {
                    const previewState = stateForDraft(schema, draft);
                    if (!previewState) return;
                    setState(previewState);
                    setAppTab('tables');
                    setTab('columns');
                    setTableNotice(`Preview actief: ${draft.name || draft.rootTable}`);
                    window.setTimeout(() => setTableNotice(''), 2200);
                  }}
                  onSaveDraft={saveTableViewDraft}
                />
              )}
            </Stack>
          </Drawer>}
        </Stack>}
      </Box>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(<App />);

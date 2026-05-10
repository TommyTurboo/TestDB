import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tree } from 'react-arborist';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  InputAdornment,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography
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
import RouteIcon from '@mui/icons-material/Route';
import SearchIcon from '@mui/icons-material/Search';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import TuneIcon from '@mui/icons-material/Tune';
import {
  LOCATION_TREE_ROW_HEIGHT,
  buildBreadcrumb,
  buildOpenState,
  cloneFilterValues,
  confidenceColor,
  confidenceLabels,
  defaultLocationColumns,
  filterTreeNodes,
  isEditableLocationField,
  locationBaseColumns,
  matchesColumnValueFilters,
  matchesLocationQuery,
  shortTypeLabel,
  titleForFilterSet,
  wouldCreateLocationCycle
} from './locationDomain.js';
import { MainDataGrid, PinStateIcon, pinLabel } from './LocationsGridWorkflow.jsx';
import { useLocationsData } from './useLocationsData.js';
import './locations.css';

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
  const {
    rows,
    treeNodes,
    selectedId,
    setSelectedId,
    loading,
    error,
    moveLocation,
    updateLocationCell,
    updateLocationCells
  } = useLocationsData();
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


export default LocationsPage;

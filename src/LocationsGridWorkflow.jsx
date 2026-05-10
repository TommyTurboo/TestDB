import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import {
  buildFilterChips,
  displayFilterValue,
  filterValueKey,
  getAllowedValuesForColumn,
  getSelectableColumnValues,
  getUniqueColumnValues,
  isEditableLocationField,
  locationCellKey,
  parseClipboardTable,
  validateClipboardValue
} from './locationDomain.js';

export function PinStateIcon({ pin }) {
  if (pin === 'left') return <PushPinIcon fontSize="inherit" className="pin-left" />;
  if (pin === 'right') return <PushPinIcon fontSize="inherit" className="pin-right" />;
  return <PushPinOutlinedIcon fontSize="inherit" className="pin-none" />;
}

export function pinLabel(pin) {
  if (pin === 'left') return 'Pinned links';
  if (pin === 'right') return 'Pinned rechts';
  return 'Niet gepinned';
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

export function MainDataGrid({
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


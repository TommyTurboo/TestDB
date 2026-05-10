import React, { useEffect, useMemo, useRef, useState } from 'react';
import Gantt from 'frappe-gantt';
import { Timeline } from 'vis-timeline/standalone';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputAdornment,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import SearchIcon from '@mui/icons-material/Search';
import TableChartIcon from '@mui/icons-material/TableChart';
import TimelineIcon from '@mui/icons-material/Timeline';
import WorkIcon from '@mui/icons-material/Work';
import { usePlanningData } from './usePlanningData.js';
import './planning.css';

function statusColor(status) {
  if (status === 'complete') return 'success';
  if (status === 'in_progress') return 'primary';
  if (status === 'blocked') return 'error';
  return 'default';
}

function kindLabel(taskKind) {
  return taskKind === 'milestone' ? 'Milestone' : 'Taak';
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(`${value}T00:00:00`).toLocaleDateString('nl-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uniqueOptions(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), 'nl-BE'));
}

function taskIntersectsDateRange(task, fromDate, toDate) {
  if (!fromDate && !toDate) return true;
  const start = task.startDate ?? task.endDate;
  const end = task.endDate ?? task.startDate;
  if (fromDate && end < fromDate) return false;
  if (toDate && start > toDate) return false;
  return true;
}

function taskMatches(task, filters) {
  const {
    query,
    kind,
    status,
    discipline,
    resource,
    equipment,
    workPackage,
    fromDate,
    toDate,
    focus
  } = filters;

  if (kind !== 'all' && task.taskKind !== kind) return false;
  if (status !== 'all' && task.status !== status) return false;
  if (discipline !== 'all' && task.discipline !== discipline) return false;
  if (workPackage !== 'all' && task.workPackageCode !== workPackage) return false;
  if (resource !== 'all' && !(task.resources ?? []).some((item) => item.resourceCode === resource)) return false;
  if (equipment !== 'all' && !(task.equipment ?? []).some((item) => item.equipmentCode === equipment)) return false;
  if (focus === 'blocked' && task.status !== 'blocked') return false;
  if (focus === 'milestones' && task.taskKind !== 'milestone') return false;
  if (focus === 'active' && task.status !== 'in_progress') return false;
  if (!taskIntersectsDateRange(task, fromDate, toDate)) return false;

  const term = query.trim().toLowerCase();
  if (!term) return true;
  return [
    task.code,
    task.wbsCode,
    task.name,
    task.status,
    task.discipline,
    task.workPackageCode,
    task.locationCode,
    ...(task.resources ?? []).map((resource) => resource.resourceName),
    ...(task.equipment ?? []).map((equipment) => equipment.equipmentName)
  ].some((value) => String(value ?? '').toLowerCase().includes(term));
}

function filterGroupsWithItems(groups, items) {
  const usedGroupIds = new Set(items.map((item) => item.group));
  return groups.filter((group) => usedGroupIds.has(group.id));
}

function buildFilteredPlanningPayload(payload, filteredTasks) {
  if (!payload) return null;
  const taskIds = new Set(filteredTasks.map((task) => task.id));
  const taskCodes = new Set(filteredTasks.map((task) => task.code));
  const filterItems = (projection) => {
    const items = (projection?.items ?? []).filter((item) => taskIds.has(item.taskId));
    return {
      groups: filterGroupsWithItems(projection?.groups ?? [], items),
      items
    };
  };

  return {
    ...payload,
    tasks: filteredTasks,
    dependencies: (payload.dependencies ?? []).filter(
      (dependency) => taskIds.has(dependency.predecessorId) && taskIds.has(dependency.successorId)
    ),
    projections: {
      ...payload.projections,
      frappeGantt: {
        ...payload.projections?.frappeGantt,
        tasks: (payload.projections?.frappeGantt?.tasks ?? [])
          .filter((task) => taskCodes.has(task.id))
          .map((task) => ({
            ...task,
            dependencies: String(task.dependencies ?? '')
              .split(',')
              .map((code) => code.trim())
              .filter((code) => code && taskCodes.has(code))
              .join(',')
          })),
        dependencies: (payload.projections?.frappeGantt?.dependencies ?? []).filter(
          (dependency) => taskCodes.has(dependency.source) && taskCodes.has(dependency.target)
        )
      },
      visTimeline: {
        resource: filterItems(payload.projections?.visTimeline?.resource),
        equipment: filterItems(payload.projections?.visTimeline?.equipment),
        workPackage: filterItems(payload.projections?.visTimeline?.workPackage)
      }
    }
  };
}

function MetricCard({ icon, label, value }) {
  return (
    <Paper className="planning-metric" elevation={0}>
      <Box className="planning-metric-icon">{icon}</Box>
      <Box>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h6">{value.toLocaleString('nl-BE')}</Typography>
      </Box>
    </Paper>
  );
}

function TaskRow({ task, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`planning-task-row ${selected ? 'is-selected' : ''} kind-${task.taskKind} status-${task.status}`}
      onClick={() => onSelect(task.id)}
    >
      <span className="planning-task-date">{formatDate(task.startDate)}</span>
      <span className="planning-task-main">
        <span className="planning-task-title">{task.wbsCode} {task.name}</span>
        <span className="planning-task-meta">
          {task.code} · {task.workPackageCode ?? 'Geen WP'} · {task.discipline}
        </span>
      </span>
      <span className="planning-task-badges">
        <Chip size="small" label={kindLabel(task.taskKind)} color={task.taskKind === 'milestone' ? 'secondary' : 'default'} />
        <Chip size="small" label={task.status} color={statusColor(task.status)} variant={task.status === 'not_started' ? 'outlined' : 'filled'} />
      </span>
    </button>
  );
}

function ProjectionSummary({ payload }) {
  const frappeTasks = payload.projections?.frappeGantt?.tasks ?? [];
  const resource = payload.projections?.visTimeline?.resource ?? { groups: [], items: [] };
  const equipment = payload.projections?.visTimeline?.equipment ?? { groups: [], items: [] };
  const workPackage = payload.projections?.visTimeline?.workPackage ?? { groups: [], items: [] };

  return (
    <Paper className="planning-panel" elevation={0}>
      <Stack spacing={1.25}>
        <Typography variant="h6">Visualisatiepayload</Typography>
        <Box className="planning-projection-grid">
          <Box className="planning-projection-cell">
            <Typography variant="caption">Frappe Gantt tasks</Typography>
            <Typography>{frappeTasks.length.toLocaleString('nl-BE')}</Typography>
          </Box>
          <Box className="planning-projection-cell">
            <Typography variant="caption">Resource groups/items</Typography>
            <Typography>{resource.groups.length} / {resource.items.length}</Typography>
          </Box>
          <Box className="planning-projection-cell">
            <Typography variant="caption">Equipment groups/items</Typography>
            <Typography>{equipment.groups.length} / {equipment.items.length}</Typography>
          </Box>
          <Box className="planning-projection-cell">
            <Typography variant="caption">Werkpakket groups/items</Typography>
            <Typography>{workPackage.groups.length} / {workPackage.items.length}</Typography>
          </Box>
        </Box>
      </Stack>
    </Paper>
  );
}

function PlanningFilters({ filters, options, filteredCount, totalCount, onChange, onReset }) {
  const update = (key) => (event) => onChange({ ...filters, [key]: event.target.value });

  return (
    <Paper className="planning-panel planning-filters" elevation={0}>
      <Stack spacing={1.25}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
          <Box>
            <Typography variant="h6">Focus</Typography>
            <Typography variant="body2" color="text.secondary">
              {filteredCount.toLocaleString('nl-BE')} van {totalCount.toLocaleString('nl-BE')} planningobjecten
            </Typography>
          </Box>
          <Button size="small" variant="outlined" onClick={onReset}>Reset</Button>
        </Stack>
        <Box className="planning-filter-grid">
          <TextField
            size="small"
            value={filters.query}
            onChange={update('query')}
            placeholder="Zoek taak, resource, locatie"
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
          />
          <FormControl size="small">
            <InputLabel id="planning-focus-label">Snelfocus</InputLabel>
            <Select labelId="planning-focus-label" label="Snelfocus" value={filters.focus} onChange={update('focus')}>
              <MenuItem value="all">Alles</MenuItem>
              <MenuItem value="active">In progress</MenuItem>
              <MenuItem value="blocked">Blocked</MenuItem>
              <MenuItem value="milestones">Milestones</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="planning-kind-label">Type</InputLabel>
            <Select labelId="planning-kind-label" label="Type" value={filters.kind} onChange={update('kind')}>
              <MenuItem value="all">Alle</MenuItem>
              <MenuItem value="task">Taken</MenuItem>
              <MenuItem value="milestone">Milestones</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="planning-status-label">Status</InputLabel>
            <Select labelId="planning-status-label" label="Status" value={filters.status} onChange={update('status')}>
              <MenuItem value="all">Alle statussen</MenuItem>
              {options.statuses.map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="planning-discipline-label">Discipline</InputLabel>
            <Select labelId="planning-discipline-label" label="Discipline" value={filters.discipline} onChange={update('discipline')}>
              <MenuItem value="all">Alle disciplines</MenuItem>
              {options.disciplines.map((discipline) => <MenuItem key={discipline} value={discipline}>{discipline}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="planning-resource-label">Resource</InputLabel>
            <Select labelId="planning-resource-label" label="Resource" value={filters.resource} onChange={update('resource')}>
              <MenuItem value="all">Alle resources</MenuItem>
              {options.resources.map((resource) => <MenuItem key={resource.code} value={resource.code}>{resource.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="planning-equipment-label">Equipment</InputLabel>
            <Select labelId="planning-equipment-label" label="Equipment" value={filters.equipment} onChange={update('equipment')}>
              <MenuItem value="all">Alle equipment</MenuItem>
              {options.equipment.map((item) => <MenuItem key={item.code} value={item.code}>{item.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="planning-workpackage-label">Werkpakket</InputLabel>
            <Select labelId="planning-workpackage-label" label="Werkpakket" value={filters.workPackage} onChange={update('workPackage')}>
              <MenuItem value="all">Alle werkpakketten</MenuItem>
              {options.workPackages.map((code) => <MenuItem key={code} value={code}>{code}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField
            size="small"
            type="date"
            label="Vanaf"
            value={filters.fromDate}
            onChange={update('fromDate')}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            type="date"
            label="Tot"
            value={filters.toDate}
            onChange={update('toDate')}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
      </Stack>
    </Paper>
  );
}

function PlanningGantt({ payload, selectedTask, onSelectTask }) {
  const wrapperRef = useRef(null);
  const shellRef = useRef(null);
  const ganttRef = useRef(null);
  const [viewMode, setViewMode] = useState('Week');
  const [renderError, setRenderError] = useState('');
  const tasksByCode = useMemo(
    () => new Map((payload?.tasks ?? []).map((task) => [task.code, task])),
    [payload?.tasks]
  );
  const ganttTasks = useMemo(() => (
    (payload?.projections?.frappeGantt?.tasks ?? []).map((task) => ({
      ...task,
      progress: Number(task.progress ?? 0),
      custom_class: task.custom_class ?? 'planning-task-status-not_started'
    }))
  ), [payload?.projections?.frappeGantt?.tasks]);

  useEffect(() => {
    if (!wrapperRef.current) return undefined;
    wrapperRef.current.innerHTML = '';
    ganttRef.current = null;
    setRenderError('');

    if (ganttTasks.length === 0) return undefined;

    try {
      ganttRef.current = new Gantt(wrapperRef.current, ganttTasks, {
        view_mode: viewMode,
        view_mode_select: false,
        readonly: true,
        readonly_dates: true,
        readonly_progress: true,
        move_dependencies: false,
        popup_on: 'hover',
        language: 'nl',
        scroll_to: 'start',
        infinite_padding: false,
        today_button: false,
        container_height: 300,
        bar_height: 24,
        padding: 14,
        upper_header_height: 36,
        lower_header_height: 28,
        popup: ({ task }) => {
          const sourceTask = tasksByCode.get(task.id);
          return `
            <div class="planning-gantt-popup">
              <strong>${escapeHtml(task.name)}</strong>
              <span>${escapeHtml(sourceTask?.status ?? task.status)} · ${escapeHtml(sourceTask?.workPackageCode ?? task.workPackageCode ?? '')}</span>
              <span>${escapeHtml(sourceTask?.startDate ?? task.start)} - ${escapeHtml(sourceTask?.endDate ?? task.end)}</span>
            </div>
          `;
        },
        on_click: (task) => {
          const sourceTask = tasksByCode.get(task.id);
          if (sourceTask) onSelectTask(sourceTask.id);
        }
      });
    } catch (error) {
      setRenderError(error.message);
    }

    return () => {
      if (wrapperRef.current) wrapperRef.current.innerHTML = '';
      ganttRef.current = null;
    };
  }, [ganttTasks, onSelectTask, tasksByCode, viewMode]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    wrapper.querySelectorAll('.planning-gantt-selected').forEach((element) => {
      element.classList.remove('planning-gantt-selected');
    });
    if (!selectedTask?.code) return;

    const escapedCode = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(selectedTask.code) : selectedTask.code;
    const selectedBar = wrapper.querySelector(`.bar-wrapper[data-id="${escapedCode}"]`);
    if (!selectedBar) return;
    selectedBar.classList.add('planning-gantt-selected');
  }, [selectedTask?.code]);

  return (
    <Paper className="planning-panel planning-gantt-panel" elevation={0}>
      <Stack spacing={1.25}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
          <Box>
            <Typography variant="h6">Gantt</Typography>
            <Typography variant="body2" color="text.secondary">Frappe Gantt render uit database-projectie</Typography>
          </Box>
          <Tabs value={viewMode} onChange={(_, value) => setViewMode(value)} className="planning-view-tabs">
            <Tab value="Day" label="Dag" />
            <Tab value="Week" label="Week" />
            <Tab value="Month" label="Maand" />
          </Tabs>
        </Stack>
        {renderError && <Alert severity="warning">{renderError}</Alert>}
        <Box ref={shellRef} className="planning-gantt-shell">
          <Box ref={wrapperRef} className="planning-gantt" />
        </Box>
      </Stack>
    </Paper>
  );
}

function PlanningTimeline({ payload, selectedTask, onSelectTask }) {
  const containerRef = useRef(null);
  const timelineRef = useRef(null);
  const [view, setView] = useState('resource');
  const [scale, setScale] = useState('normal');
  const [axisMode, setAxisMode] = useState('top');
  const [focusOnSelect, setFocusOnSelect] = useState(true);
  const [renderError, setRenderError] = useState('');
  const projection = payload?.projections?.visTimeline?.[view] ?? { groups: [], items: [] };
  const itemTaskIds = useMemo(() => new Map(projection.items.map((item) => [item.id, item.taskId])), [projection.items]);
  const selectedItemIds = useMemo(
    () => projection.items.filter((item) => item.taskId === selectedTask?.id).map((item) => item.id),
    [projection.items, selectedTask?.id]
  );

  const groups = useMemo(() => projection.groups.map((group) => ({
    id: group.id,
    content: escapeHtml(group.content),
    title: escapeHtml([group.code, group.discipline ?? group.type, group.status].filter(Boolean).join(' · '))
  })), [projection.groups]);

  const items = useMemo(() => projection.items.map((item) => ({
    id: item.id,
    group: item.group,
    content: escapeHtml(item.content),
    title: escapeHtml(item.title),
    start: item.start,
    end: item.type === 'point' ? undefined : item.end,
    type: item.type,
    className: item.className ?? ''
  })), [projection.items]);
  const timelineHeight = scale === 'large' ? 480 : scale === 'dense' ? 220 : 300;
  const axisOrientation = axisMode === 'both' ? { axis: 'both', item: 'bottom' } : { axis: axisMode, item: 'bottom' };
  const visibleDates = useMemo(() => items
    .flatMap((item) => [item.start, item.end])
    .filter(Boolean)
    .map((value) => new Date(`${value}T00:00:00`))
    .filter((date) => !Number.isNaN(date.getTime())), [items]);
  const projectWindow = useMemo(() => {
    if (!visibleDates.length) return null;
    const min = new Date(Math.min(...visibleDates.map((date) => date.getTime())));
    const max = new Date(Math.max(...visibleDates.map((date) => date.getTime())));
    min.setDate(min.getDate() - 7);
    max.setDate(max.getDate() + 7);
    return { start: min, end: max };
  }, [visibleDates]);

  const setTimelineWindow = (mode) => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    if (mode === 'fit') {
      timeline.fit({ animation: { duration: 250, easingFunction: 'easeInOutQuad' } });
      return;
    }
    const anchor = selectedTask?.startDate ? new Date(`${selectedTask.startDate}T00:00:00`) : projectWindow?.start ?? new Date();
    const start = new Date(anchor);
    const end = new Date(anchor);
    if (mode === 'today') {
      const today = new Date();
      start.setTime(today.getTime());
      end.setTime(today.getTime());
      start.setDate(start.getDate() - 7);
      end.setDate(end.getDate() + 21);
    } else if (mode === '2w') {
      end.setDate(end.getDate() + 14);
    } else if (mode === '6w') {
      end.setDate(end.getDate() + 42);
    } else if (mode === '3m') {
      end.setMonth(end.getMonth() + 3);
    } else if (mode === 'project' && projectWindow) {
      timeline.setWindow(projectWindow.start, projectWindow.end, { animation: { duration: 250, easingFunction: 'easeInOutQuad' } });
      return;
    }
    timeline.setWindow(start, end, { animation: { duration: 250, easingFunction: 'easeInOutQuad' } });
  };

  useEffect(() => {
    if (!containerRef.current) return undefined;
    containerRef.current.innerHTML = '';
    timelineRef.current = null;
    setRenderError('');
    if (!items.length) return undefined;

    try {
      const timeline = new Timeline(containerRef.current, items, groups, {
        height: `${timelineHeight}px`,
        minHeight: '240px',
        stack: true,
        horizontalScroll: true,
        verticalScroll: true,
        zoomKey: 'ctrlKey',
        orientation: axisOrientation,
        margin: { item: { horizontal: 8, vertical: 6 }, axis: 8 },
        multiselect: false,
        selectable: true,
        showCurrentTime: false,
        locale: 'nl',
        groupOrder: 'content'
      });
      timeline.on('select', (properties) => {
        const itemId = properties.items?.[0];
        if (!itemId) return;
        const taskId = itemTaskIds.get(itemId);
        if (taskId) onSelectTask(taskId);
      });
      timelineRef.current = timeline;
    } catch (error) {
      setRenderError(error.message);
    }

    return () => {
      timelineRef.current?.destroy?.();
      timelineRef.current = null;
    };
  }, [axisOrientation, groups, itemTaskIds, items, onSelectTask, timelineHeight]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    try {
      timeline.setSelection(selectedItemIds, { focus: false });
      if (focusOnSelect && selectedItemIds.length) {
        timeline.focus(selectedItemIds, { animation: { duration: 250, easingFunction: 'easeInOutQuad' } });
      }
    } catch (error) {
      setRenderError(error.message);
    }
  }, [focusOnSelect, selectedItemIds]);

  return (
    <Paper className="planning-panel planning-timeline-panel" elevation={0}>
      <Stack spacing={1.25}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
          <Box>
            <Typography variant="h6">Timeline</Typography>
            <Typography variant="body2" color="text.secondary">vis-timeline render per resource, equipment of werkpakket</Typography>
          </Box>
          <Tabs value={view} onChange={(_, value) => setView(value)} className="planning-view-tabs">
            <Tab value="resource" label="Resources" />
            <Tab value="equipment" label="Equipment" />
            <Tab value="workPackage" label="Werkpakketten" />
          </Tabs>
        </Stack>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button size="small" variant="outlined" onClick={() => setTimelineWindow('fit')}>Fit</Button>
            <Button size="small" variant="outlined" onClick={() => setTimelineWindow('today')}>Vandaag</Button>
            <Button size="small" variant="outlined" onClick={() => setTimelineWindow('2w')}>2 weken</Button>
            <Button size="small" variant="outlined" onClick={() => setTimelineWindow('6w')}>6 weken</Button>
            <Button size="small" variant="outlined" onClick={() => setTimelineWindow('3m')}>3 maanden</Button>
            <Button size="small" variant="outlined" onClick={() => setTimelineWindow('project')}>Project</Button>
          </Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Tabs value={scale} onChange={(_, value) => setScale(value)} className="planning-view-tabs planning-compact-tabs">
              <Tab value="dense" label="Compact" />
              <Tab value="normal" label="Normaal" />
              <Tab value="large" label="Groot" />
            </Tabs>
            <Tabs value={axisMode} onChange={(_, value) => setAxisMode(value)} className="planning-view-tabs planning-compact-tabs">
              <Tab value="top" label="Top" />
              <Tab value="both" label="Beide" />
              <Tab value="bottom" label="Onder" />
            </Tabs>
            <Button size="small" variant={focusOnSelect ? 'contained' : 'outlined'} onClick={() => setFocusOnSelect((value) => !value)}>
              Focus {focusOnSelect ? 'aan' : 'uit'}
            </Button>
          </Stack>
        </Stack>
        {renderError && <Alert severity="warning">{renderError}</Alert>}
        <Box className={`planning-timeline-shell planning-timeline-${scale}`}>
          <Box ref={containerRef} className="planning-timeline" />
        </Box>
      </Stack>
    </Paper>
  );
}

const editableTaskFields = {
  status: 'status',
  progress: 'progress',
  startDate: 'start_date',
  endDate: 'end_date',
  constraintType: 'constraint_type',
  constraintDate: 'constraint_date',
  notes: 'notes'
};

function buildTaskDraft(task) {
  return {
    status: task?.status ?? 'not_started',
    progress: String(task?.progress ?? 0),
    startDate: task?.startDate ?? '',
    endDate: task?.endDate ?? '',
    constraintType: task?.constraintType ?? 'none',
    constraintDate: task?.constraintDate ?? '',
    notes: task?.notes ?? ''
  };
}

function normalizeTaskDraft(draft) {
  return {
    status: draft.status,
    progress: Number(draft.progress),
    startDate: draft.startDate,
    endDate: draft.endDate,
    constraintType: draft.constraintType,
    constraintDate: draft.constraintDate || null,
    notes: draft.notes
  };
}

function TaskDetail({ task, onUpdateTaskFields, saving }) {
  const [draft, setDraft] = useState(() => buildTaskDraft(task));

  useEffect(() => {
    setDraft(buildTaskDraft(task));
  }, [task?.id]);

  if (!task) {
    return (
      <Paper className="planning-panel planning-detail" elevation={0}>
        <Typography color="text.secondary">Selecteer een planningobject.</Typography>
      </Paper>
    );
  }

  const updateDraft = (field) => (event) => {
    setDraft((current) => ({ ...current, [field]: event.target.value }));
  };
  const normalizedDraft = normalizeTaskDraft(draft);
  const currentValues = normalizeTaskDraft(buildTaskDraft(task));
  const changedFields = Object.entries(normalizedDraft).filter(([field, value]) => value !== currentValues[field]);
  const hasChanges = changedFields.length > 0;
  const saveChanges = () => onUpdateTaskFields({
    id: task.id,
    changes: Object.fromEntries(changedFields.map(([field, value]) => [editableTaskFields[field], value]))
  });

  return (
    <Paper className="planning-panel planning-detail" elevation={0}>
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="caption" color="text.secondary">{kindLabel(task.taskKind)}</Typography>
          <Typography variant="h6">{task.wbsCode} {task.name}</Typography>
          <Typography color="text.secondary">{task.code}</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={task.status} color={statusColor(task.status)} />
          <Chip label={`${task.progress}%`} variant="outlined" />
          <Chip label={task.workPackageCode ?? 'Geen werkpakket'} variant="outlined" />
          {task.locationCode && <Chip label={task.locationCode} variant="outlined" />}
        </Stack>
        <Box className="planning-edit-grid">
          <FormControl size="small">
            <InputLabel id="planning-detail-status-label">Status</InputLabel>
            <Select
              labelId="planning-detail-status-label"
              label="Status"
              value={draft.status}
              onChange={updateDraft('status')}
              disabled={saving}
            >
              <MenuItem value="not_started">not_started</MenuItem>
              <MenuItem value="in_progress">in_progress</MenuItem>
              <MenuItem value="complete">complete</MenuItem>
              <MenuItem value="blocked">blocked</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            type="number"
            label="Progress"
            value={draft.progress}
            inputProps={{ min: 0, max: 100, step: 5 }}
            onChange={updateDraft('progress')}
            disabled={saving}
          />
          <TextField
            size="small"
            type="date"
            label="Start"
            value={draft.startDate}
            onChange={updateDraft('startDate')}
            InputLabelProps={{ shrink: true }}
            disabled={saving}
          />
          <TextField
            size="small"
            type="date"
            label="Einde"
            value={draft.endDate}
            onChange={updateDraft('endDate')}
            InputLabelProps={{ shrink: true }}
            disabled={saving}
          />
          <FormControl size="small">
            <InputLabel id="planning-detail-constraint-label">Constraint</InputLabel>
            <Select
              labelId="planning-detail-constraint-label"
              label="Constraint"
              value={draft.constraintType}
              onChange={updateDraft('constraintType')}
              disabled={saving}
            >
              <MenuItem value="none">none</MenuItem>
              <MenuItem value="start_no_earlier_than">start_no_earlier_than</MenuItem>
              <MenuItem value="finish_no_later_than">finish_no_later_than</MenuItem>
              <MenuItem value="must_start_on">must_start_on</MenuItem>
              <MenuItem value="must_finish_on">must_finish_on</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            type="date"
            label="Constraint datum"
            value={draft.constraintDate}
            onChange={updateDraft('constraintDate')}
            InputLabelProps={{ shrink: true }}
            disabled={saving}
          />
        </Box>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" variant="outlined" disabled={saving || !hasChanges} onClick={() => setDraft(buildTaskDraft(task))}>
            Ongedaan maken
          </Button>
          <Button size="small" variant="contained" disabled={saving || !hasChanges} onClick={saveChanges}>
            Wijzigingen opslaan
          </Button>
        </Stack>
        <Box className="planning-detail-facts">
          <Box><Typography variant="caption">Start</Typography><Typography>{formatDate(task.startDate)}</Typography></Box>
          <Box><Typography variant="caption">Einde</Typography><Typography>{formatDate(task.endDate)}</Typography></Box>
          <Box><Typography variant="caption">Constraint</Typography><Typography>{task.constraintType}</Typography></Box>
          <Box><Typography variant="caption">Discipline</Typography><Typography>{task.discipline}</Typography></Box>
        </Box>
        <Divider />
        <Box>
          <Typography variant="subtitle2">Predecessors</Typography>
          <Typography color="text.secondary">
            {task.predecessors?.length ? task.predecessors.map((item) => `${item.predecessorCode} (${item.dependencyType})`).join(', ') : 'Geen'}
          </Typography>
        </Box>
        <Box>
          <Typography variant="subtitle2">Successors</Typography>
          <Typography color="text.secondary">
            {task.successors?.length ? task.successors.map((item) => `${item.successorCode} (${item.dependencyType})`).join(', ') : 'Geen'}
          </Typography>
        </Box>
        <Box>
          <Typography variant="subtitle2">Resources</Typography>
          <Typography color="text.secondary">
            {task.resources?.length ? task.resources.map((item) => `${item.resourceName} ${item.allocationPercent}%`).join(', ') : 'Geen'}
          </Typography>
        </Box>
        <Box>
          <Typography variant="subtitle2">Equipment</Typography>
          <Typography color="text.secondary">
            {task.equipment?.length ? task.equipment.map((item) => item.equipmentName).join(', ') : 'Geen'}
          </Typography>
        </Box>
        <Box>
          <Typography variant="subtitle2">Documenten</Typography>
          <Stack spacing={0.75} className="planning-doc-list">
            {task.documents?.length ? task.documents.map((document) => (
              <Box key={document.documentId} className="planning-doc-row">
                <Typography>{document.documentTitle}</Typography>
                <Typography variant="caption" color="text.secondary">{document.docType} · {document.linkType}</Typography>
              </Box>
            )) : <Typography color="text.secondary">Geen</Typography>}
          </Stack>
        </Box>
        <Box>
          <Typography variant="subtitle2">Notities</Typography>
          <TextField
            size="small"
            multiline
            minRows={3}
            value={draft.notes}
            onChange={updateDraft('notes')}
            disabled={saving}
          />
        </Box>
      </Stack>
    </Paper>
  );
}

function PlanningPage() {
  const { payload, selectedId, setSelectedId, loading, saving, error, reload, updatePlanningTaskFields } = usePlanningData();
  const defaultFilters = {
    query: '',
    focus: 'all',
    kind: 'all',
    status: 'all',
    discipline: 'all',
    resource: 'all',
    equipment: 'all',
    workPackage: 'all',
    fromDate: '',
    toDate: ''
  };
  const [filters, setFilters] = useState(defaultFilters);

  const tasks = payload?.tasks ?? [];
  const filterOptions = useMemo(() => ({
    statuses: uniqueOptions(tasks.map((task) => task.status)),
    disciplines: uniqueOptions(tasks.map((task) => task.discipline)),
    resources: (payload?.resources ?? []).map((resource) => ({ code: resource.code, name: `${resource.code} ${resource.name}` })),
    equipment: (payload?.equipment ?? []).map((item) => ({ code: item.code, name: `${item.code} ${item.name}` })),
    workPackages: uniqueOptions(tasks.map((task) => task.workPackageCode))
  }), [payload?.equipment, payload?.resources, tasks]);
  const filteredTasks = useMemo(
    () => tasks.filter((task) => taskMatches(task, filters)),
    [tasks, filters]
  );
  const filteredPayload = useMemo(
    () => buildFilteredPlanningPayload(payload, filteredTasks),
    [payload, filteredTasks]
  );
  const selectedTask = filteredTasks.find((task) => task.id === selectedId) ?? filteredTasks[0] ?? null;
  const milestones = tasks.filter((task) => task.taskKind === 'milestone');
  const activeTasks = tasks.filter((task) => task.status === 'in_progress');

  return (
    <Stack spacing={2} className="planning-page">
      <Paper className="planning-toolbar" elevation={0}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <TimelineIcon color="primary" />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6">Planning</Typography>
              <Typography variant="body2" color="text.secondary">Database-first planning workbench</Typography>
            </Box>
            {payload && <Chip size="small" label={`${tasks.length.toLocaleString('nl-BE')} objecten`} variant="outlined" />}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip size="small" color="primary" label={`${filteredTasks.length.toLocaleString('nl-BE')} zichtbaar`} />
            <Chip size="small" label={`${activeTasks.length.toLocaleString('nl-BE')} actief`} variant="outlined" />
            <Button size="small" variant="outlined" onClick={reload}>Refresh</Button>
          </Stack>
        </Stack>
      </Paper>

      {loading && <LinearProgress />}
      {error && <Alert severity="warning">{error}</Alert>}
      {!loading && !error && payload && tasks.length === 0 && (
        <Alert severity="info">Geen planningdata gevonden. Draai `npm run seed` om demo-planning te vullen.</Alert>
      )}

      {payload && tasks.length > 0 && (
        <>
          <Box className="planning-metrics">
            <MetricCard icon={<TableChartIcon />} label="Planningobjecten" value={tasks.length} />
            <MetricCard icon={<EventIcon />} label="Milestones" value={milestones.length} />
            <MetricCard icon={<WorkIcon />} label="Resources" value={payload.resources?.length ?? 0} />
            <MetricCard icon={<PrecisionManufacturingIcon />} label="Equipment" value={payload.equipment?.length ?? 0} />
          </Box>

          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} className="planning-workspace">
            <Stack spacing={2} className="planning-main">
              <PlanningFilters
                filters={filters}
                options={filterOptions}
                filteredCount={filteredTasks.length}
                totalCount={tasks.length}
                onChange={setFilters}
                onReset={() => setFilters(defaultFilters)}
              />
              <PlanningGantt payload={filteredPayload} selectedTask={selectedTask} onSelectTask={setSelectedId} />
              <PlanningTimeline payload={filteredPayload} selectedTask={selectedTask} onSelectTask={setSelectedId} />
              <Paper className="planning-panel planning-list" elevation={0}>
                <Stack spacing={1.25}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6">Objecten</Typography>
                    <Chip size="small" label={`${filteredTasks.length.toLocaleString('nl-BE')} gefilterd`} />
                  </Stack>
                  <Box className="planning-task-list">
                    {filteredTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        selected={selectedTask?.id === task.id}
                        onSelect={setSelectedId}
                      />
                    ))}
                    {filteredTasks.length === 0 && (
                      <Typography color="text.secondary" className="planning-empty">Geen planningobjecten voor deze filter.</Typography>
                    )}
                  </Box>
                </Stack>
              </Paper>
            </Stack>

            <Stack spacing={2} className="planning-side">
              <ProjectionSummary payload={filteredPayload} />
              <TaskDetail task={selectedTask} onUpdateTaskFields={updatePlanningTaskFields} saving={saving} />
            </Stack>
          </Stack>
        </>
      )}
    </Stack>
  );
}

export default PlanningPage;

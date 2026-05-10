import { useCallback, useEffect, useState } from 'react';
import {
  buildNextLocationRow,
  isEditableLocationField,
  locationCellKey,
  validateLocationCellValue,
  wouldCreateLocationCycle
} from './locationDomain.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function useLocationsData({ apiBase = API_BASE } = {}) {
  const [rows, setRows] = useState([]);
  const [treeNodes, setTreeNodes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cellStatus, setCellStatus] = useState({});

  const loadLocations = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      fetch(`${apiBase}/api/locations`).then((response) => response.json()),
      fetch(`${apiBase}/api/locations/tree`).then((response) => response.json())
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
  }, [apiBase]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const moveLocation = useCallback(async ({ dragIds, parentId }) => {
    const id = dragIds[0];
    const row = rows.find((item) => item.id === id);
    if (!row) return;
    if (wouldCreateLocationCycle(rows, id, parentId)) {
      setError('Deze verplaatsing zou een cyclische locatieboom maken en is geblokkeerd.');
      return;
    }
    setError('');
    const response = await fetch(`${apiBase}/api/locations/${id}`, {
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
  }, [apiBase, loadLocations, rows]);

  const updateLocationCell = useCallback(async (row, field, valueKey) => {
    if (!isEditableLocationField(field)) return;
    const validation = validateLocationCellValue(field, valueKey);
    const statusKey = locationCellKey(row.id, field);
    if (!validation.valid) {
      setCellStatus((current) => ({ ...current, [statusKey]: { state: 'error', message: validation.message } }));
      setError(validation.message);
      return;
    }
    const nextRow = buildNextLocationRow(row, { [field]: valueKey }, rows);
    setError('');
    const previousRows = rows;
    setCellStatus((current) => ({ ...current, [statusKey]: { state: 'saving', message: 'Opslaan...' } }));
    setRows((current) => current.map((item) => item.id === row.id ? nextRow : item));

    const response = await fetch(`${apiBase}/api/locations/${row.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(nextRow)
    });
    const payload = await response.json();
    if (!response.ok) {
      setRows(previousRows);
      const message = payload.fieldErrors?.[field] ?? payload.error ?? 'Celwaarde kon niet worden bijgewerkt';
      setCellStatus((current) => ({ ...current, [statusKey]: { state: 'error', message } }));
      setError(message);
      return;
    }
    setCellStatus((current) => ({ ...current, [statusKey]: { state: 'success', message: 'Opgeslagen' } }));
    window.setTimeout(() => {
      setCellStatus((current) => {
        if (current[statusKey]?.state !== 'success') return current;
        const next = { ...current };
        delete next[statusKey];
        return next;
      });
    }, 1600);
    loadLocations();
  }, [apiBase, loadLocations, rows]);

  const updateLocationCells = useCallback(async (changes) => {
    if (!changes.length) return;
    setError('');
    const previousRows = rows;
    const fieldErrors = [];
    changes.forEach((change) => {
      Object.entries(change.values).forEach(([field, value]) => {
        const validation = validateLocationCellValue(field, value);
        if (!validation.valid) fieldErrors.push({ row: change.row, field, message: validation.message });
      });
    });
    if (fieldErrors.length) {
      setCellStatus((current) => ({
        ...current,
        ...Object.fromEntries(fieldErrors.map((item) => [
          locationCellKey(item.row.id, item.field),
          { state: 'error', message: item.message }
        ]))
      }));
      setError(`${fieldErrors.length} geplakte waarden zijn ongeldig.`);
      return;
    }
    const nextRowsById = new Map(changes.map((change) => [change.row.id, buildNextLocationRow(change.row, change.values, rows)]));
    setRows((current) => current.map((item) => nextRowsById.get(item.id) ?? item));
    setCellStatus((current) => ({
      ...current,
      ...Object.fromEntries(changes.flatMap((change) => Object.keys(change.values).map((field) => [
        locationCellKey(change.row.id, field),
        { state: 'saving', message: 'Opslaan...' }
      ])))
    }));

    const responses = await Promise.all([...nextRowsById.values()].map(async (nextRow) => {
      const response = await fetch(`${apiBase}/api/locations/${nextRow.id}`, {
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
      const message = failed.payload.error ?? 'Geplakte waarden konden niet worden bijgewerkt';
      setCellStatus((current) => ({
        ...current,
        ...Object.fromEntries(changes.flatMap((change) => Object.keys(change.values).map((field) => [
          locationCellKey(change.row.id, field),
          { state: 'error', message: failed.payload.fieldErrors?.[field] ?? message }
        ])))
      }));
      setError(message);
      return;
    }
    setCellStatus((current) => ({
      ...current,
      ...Object.fromEntries(changes.flatMap((change) => Object.keys(change.values).map((field) => [
        locationCellKey(change.row.id, field),
        { state: 'success', message: 'Opgeslagen' }
      ])))
    }));
    window.setTimeout(() => {
      setCellStatus((current) => {
        const next = { ...current };
        changes.forEach((change) => Object.keys(change.values).forEach((field) => {
          const key = locationCellKey(change.row.id, field);
          if (next[key]?.state === 'success') delete next[key];
        }));
        return next;
      });
    }, 1600);
    loadLocations();
  }, [apiBase, loadLocations, rows]);

  return {
    rows,
    treeNodes,
    selectedId,
    setSelectedId,
    loading,
    error,
    cellStatus,
    loadLocations,
    moveLocation,
    updateLocationCell,
    updateLocationCells
  };
}

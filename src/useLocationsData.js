import { useCallback, useEffect, useState } from 'react';
import {
  buildNextLocationRow,
  isEditableLocationField,
  wouldCreateLocationCycle
} from './locationDomain.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function useLocationsData({ apiBase = API_BASE } = {}) {
  const [rows, setRows] = useState([]);
  const [treeNodes, setTreeNodes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    const nextRow = buildNextLocationRow(row, { [field]: valueKey }, rows);
    setError('');
    const previousRows = rows;
    setRows((current) => current.map((item) => item.id === row.id ? nextRow : item));

    const response = await fetch(`${apiBase}/api/locations/${row.id}`, {
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
  }, [apiBase, loadLocations, rows]);

  const updateLocationCells = useCallback(async (changes) => {
    if (!changes.length) return;
    setError('');
    const previousRows = rows;
    const nextRowsById = new Map(changes.map((change) => [change.row.id, buildNextLocationRow(change.row, change.values, rows)]));
    setRows((current) => current.map((item) => nextRowsById.get(item.id) ?? item));

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
      setError(failed.payload.error ?? 'Geplakte waarden konden niet worden bijgewerkt');
      return;
    }
    loadLocations();
  }, [apiBase, loadLocations, rows]);

  return {
    rows,
    treeNodes,
    selectedId,
    setSelectedId,
    loading,
    error,
    loadLocations,
    moveLocation,
    updateLocationCell,
    updateLocationCells
  };
}

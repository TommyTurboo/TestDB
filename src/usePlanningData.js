import { useCallback, useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function usePlanningData({ apiBase = API_BASE } = {}) {
  const [payload, setPayload] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchPlanning = useCallback(async (signal) => {
    const response = await fetch(`${apiBase}/api/planning/workbench`, { signal });
    const nextPayload = await response.json();
    if (!response.ok || nextPayload.error) {
      throw new Error(nextPayload.error ?? 'Planning kon niet worden geladen');
    }
    return nextPayload;
  }, [apiBase]);

  const applyPayload = useCallback((nextPayload) => {
    const tasks = nextPayload.tasks ?? [];
    setPayload(nextPayload);
    setSelectedId((current) => current ?? tasks[0]?.id ?? null);
  }, []);

  const loadPlanning = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    fetchPlanning(controller.signal)
      .then(applyPayload)
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [applyPayload, fetchPlanning]);

  const updatePlanningTaskFields = useCallback(async ({ id, changes }) => {
    setSaving(true);
    setError('');
    try {
      for (const [field, value] of Object.entries(changes)) {
        const response = await fetch(`${apiBase}/api/rows/cell`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            table: 'planning_tasks',
            id,
            field,
            value
          })
        });
        const result = await response.json();
        if (!response.ok || result.error) {
          const fieldMessage = result.fieldErrors?.[field];
          throw new Error(fieldMessage ?? result.error ?? 'Planningobject kon niet worden bijgewerkt');
        }
      }
      const nextPayload = await fetchPlanning();
      applyPayload(nextPayload);
    } catch (saveError) {
      setError(saveError.message);
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, [apiBase, applyPayload, fetchPlanning]);

  const updatePlanningTaskField = useCallback(({ id, field, value }) => (
    updatePlanningTaskFields({ id, changes: { [field]: value } })
  ), [updatePlanningTaskFields]);

  useEffect(() => loadPlanning(), [loadPlanning]);

  return {
    payload,
    selectedId,
    setSelectedId,
    loading,
    saving,
    error,
    reload: loadPlanning,
    updatePlanningTaskField,
    updatePlanningTaskFields
  };
}

import React, { useMemo, useState } from 'react';
import { Search, Shield } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { EmptyState, Input, PageHeader, Select } from '../components/ui/Primitives';
import { formatDateTime } from '../lib/utils';

export function ActivityLogPage() {
  const { workspace } = useWorkspace();
  const [query, setQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState('ALL');

  const entityTypes = useMemo(() => {
    if (!workspace) return [];
    return Array.from(new Set(workspace.activityLogs.map((l) => l.entityType))).sort();
  }, [workspace]);

  const filteredLogs = useMemo(() => {
    if (!workspace) return [];
    const q = query.trim().toLowerCase();
    return workspace.activityLogs
      .filter((log) => {
        if (entityFilter !== 'ALL' && log.entityType !== entityFilter) return false;
        if (!q) return true;
        return (
          log.summary.toLowerCase().includes(q) ||
          log.actorName.toLowerCase().includes(q) ||
          log.action.toLowerCase().includes(q) ||
          log.entityId.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [workspace, entityFilter, query]);

  if (!workspace) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity & Audit Log"
        description="Chronological, append-only audit trail of all IT asset changes, assignments, stock transactions, maintenance actions, and configuration updates."
      />

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by actor, action, asset tag, or summary..."
              aria-label="Search audit log"
              className="pl-9"
            />
          </div>
          <Select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            aria-label="Filter audit log by entity type"
            className="sm:w-48"
          >
            <option value="ALL">All Entities</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 shrink-0">
          <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Immutable records ({filteredLogs.length})</span>
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <EmptyState
          title="No matching audit entries"
          description="Try clearing your search filter to view all recorded workspace activity."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Summary</th>
                <th className="py-3 px-4">Change Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {log.actorName}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-sky-700 dark:text-sky-400 whitespace-nowrap">
                    {log.action}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    <span className="font-medium">{log.entityType}</span>
                    <span className="text-slate-400 ml-1 font-mono">({log.entityId})</span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{log.summary}</td>
                  <td className="py-3 px-4 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {log.previousValue || log.newValue ? (
                      <span>
                        {log.previousValue ?? '—'} → {log.newValue ?? '—'}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import React, { useMemo, useState, useCallback } from 'react';
import { Search, Shield, Download, Filter, ChevronDown, ChevronUp, Calendar, X, AlertTriangle, Info } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { EmptyState, Input, PageHeader, Select, Toast, ToastContainer, type ToastMessage } from '../components/ui/Primitives';
import { formatDateTime, todayIsoDate } from '../lib/utils';
import { toCsv } from '../core/logic/operations';

export function ActivityLogPage() {
  const { workspace } = useWorkspace();
  const [query, setQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [actorFilter, setActorFilter] = useState('ALL');
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastMessage['type'], message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const entityTypes = useMemo(() => {
    if (!workspace) return [];
    return Array.from(new Set(workspace.activityLogs.map((l) => l.entityType))).sort();
  }, [workspace]);

  const actionTypes = useMemo(() => {
    if (!workspace) return [];
    return Array.from(new Set(workspace.activityLogs.map((l) => l.action))).sort();
  }, [workspace]);

  const actorNames = useMemo(() => {
    if (!workspace) return [];
    return Array.from(new Set(workspace.activityLogs.map((l) => l.actorName))).sort();
  }, [workspace]);

  const filteredLogs = useMemo(() => {
    if (!workspace) return [];
    const q = query.trim().toLowerCase();
    return workspace.activityLogs
      .filter((log) => {
        if (entityFilter !== 'ALL' && log.entityType !== entityFilter) return false;
        if (actionFilter !== 'ALL' && log.action !== actionFilter) return false;
        if (actorFilter !== 'ALL' && log.actorName !== actorFilter) return false;
        if (dateRange.from && log.createdAt < dateRange.from) return false;
        if (dateRange.to && log.createdAt > dateRange.to) return false;
        if (!q) return true;
        return (
          log.summary.toLowerCase().includes(q) ||
          log.actorName.toLowerCase().includes(q) ||
          log.action.toLowerCase().includes(q) ||
          log.entityId.toLowerCase().includes(q) ||
          log.entityType.toLowerCase().includes(q) ||
          (log.previousValue && log.previousValue.toLowerCase().includes(q)) ||
          (log.newValue && log.newValue.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const diff = b.createdAt.localeCompare(a.createdAt);
        return sortDir === 'asc' ? -diff : diff;
      });
  }, [workspace, entityFilter, actionFilter, actorFilter, dateRange, query, sortDir]);

  const stats = useMemo(() => {
    if (!workspace) return { total: 0, today: 0, thisWeek: 0, uniqueActors: 0 };
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    return {
      total: workspace.activityLogs.length,
      today: workspace.activityLogs.filter((l) => l.createdAt >= todayStart).length,
      thisWeek: workspace.activityLogs.filter((l) => l.createdAt >= weekStart).length,
      uniqueActors: new Set(workspace.activityLogs.map((l) => l.actorName)).size,
    };
  }, [workspace]);

  const handleExportCsv = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['Timestamp', 'Actor', 'Action', 'Entity Type', 'Entity ID', 'Summary', 'Previous Value', 'New Value'];
    const rows = filteredLogs.map((log) => [
      formatDateTime(log.createdAt),
      log.actorName,
      log.action,
      log.entityType,
      log.entityId,
      log.summary,
      log.previousValue ?? '',
      log.newValue ?? '',
    ]);
    const csv = toCsv(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fixdesk-activity-log-${todayIsoDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Activity log exported to CSV');
  };

  const clearFilters = () => {
    setEntityFilter('ALL');
    setActionFilter('ALL');
    setActorFilter('ALL');
    setDateRange({ from: '', to: '' });
    setQuery('');
  };

  const hasActiveFilters = entityFilter !== 'ALL' || actionFilter !== 'ALL' || actorFilter !== 'ALL' || dateRange.from || dateRange.to || query;

  if (!workspace) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity & Audit Log"
        description="Chronological, append-only audit trail of all IT asset changes, assignments, stock transactions, maintenance actions, and configuration updates."
        actions={
          <div className="flex items-center gap-2 no-print">
            <Button variant="secondary" onClick={handleExportCsv} disabled={filteredLogs.length === 0}>
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              aria-label={`Sort ${sortDir === 'asc' ? 'ascending' : 'descending'} by time`}
            >
              {sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 no-print">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Entries</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-1 tabular-nums">{stats.total.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Today</p>
          <p className="text-xl font-bold text-sky-600 dark:text-sky-400 mt-1 tabular-nums">{stats.today}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">This Week</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">{stats.thisWeek}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Unique Actors</p>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">{stats.uniqueActors}</p>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 no-print">
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className="w-full px-5 py-3 flex items-center justify-between gap-3"
          aria-expanded={showFilters}
        >
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            <span className="font-medium text-slate-900 dark:text-slate-100">Advanced Filters</span>
            {hasActiveFilters && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400">
                Active
              </span>
            )}
          </div>
          {showFilters ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>
        {showFilters && (
          <div className="px-5 pb-4 border-t border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by actor, action, asset tag, summary, or values..."
                  aria-label="Search audit log"
                  className="pl-9"
                />
              </div>
              <Select
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                aria-label="Filter by entity type"
                className="w-full"
              >
                <option value="ALL">All Entities</option>
                {entityTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
              <Select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                aria-label="Filter by action"
                className="w-full"
              >
                <option value="ALL">All Actions</option>
                {actionTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
              <Select
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                aria-label="Filter by actor"
                className="w-full"
              >
                <option value="ALL">All Actors</option>
                {actorNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
              <div className="flex gap-2">
                <Field label="From" htmlFor="log-date-from" className="flex-1">
                  <Input
                    id="log-date-from"
                    type="date"
                    value={dateRange.from}
                    onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
                    className="h-10"
                  />
                </Field>
                <Field label="To" htmlFor="log-date-to" className="flex-1">
                  <Input
                    id="log-date-to"
                    type="date"
                    value={dateRange.to}
                    onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
                    className="h-10"
                  />
                </Field>
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="self-end">
                  <X className="w-3.5 h-3.5 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Log Table */}
      {filteredLogs.length === 0 ? (
        <EmptyState
          title="No matching audit entries"
          description="Try clearing your search filter or adjusting the date range to view all recorded workspace activity."
          action={
            hasActiveFilters ? (
              <Button variant="secondary" onClick={clearFilters}>
                <X className="w-4 h-4" />
                Clear Filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
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
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 max-w-md truncate" title={log.summary}>
                      {log.summary}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {log.previousValue || log.newValue ? (
                        <span className="flex items-center gap-1">
                          {log.previousValue ? (
                            <>
                              <span className="text-red-600 dark:text-red-400">−</span>
                              <span>{log.previousValue}</span>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                          <span className="text-slate-400 mx-1">→</span>
                          {log.newValue ? (
                            <>
                              <span className="text-emerald-600 dark:text-emerald-400">+</span>
                              <span>{log.newValue}</span>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
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
          {/* Summary footer */}
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Showing {filteredLogs.length} of {workspace.activityLogs.length} entries</span>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Immutable audit trail</span>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowLeftRight,
  BarChart3,
  Laptop,
  Package,
  Plus,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  buildAssetDistribution,
  computeDashboardMetrics,
  getStockStatus,
  getWarrantyStatus,
  isMaintenanceOverdue,
  isWithinDateRange,
  type DateRangeFilter,
} from '../core/logic/operations';
import { Button, PageHeader, StatusText } from '../components/ui/Primitives';
import { cn, formatCurrency, formatDate, formatDateTime } from '../lib/utils';

const RANGE_OPTIONS: { key: DateRangeFilter; label: string }[] = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
  { key: 'custom', label: 'Custom' },
];

export function DashboardPage() {
  const { workspace, can } = useWorkspace();
  const navigate = useNavigate();

  const [range, setRange] = useState<DateRangeFilter>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const filteredData = useMemo(() => {
    if (!workspace) return null;
    const assets = workspace.assets.filter((a) =>
      isWithinDateRange(a.createdAt, range, customStart, customEnd)
    );
    const assignments = workspace.assignments.filter((a) =>
      isWithinDateRange(a.assignedDate, range, customStart, customEnd)
    );
    const maintenance = workspace.maintenance.filter((m) =>
      isWithinDateRange(m.scheduledDate, range, customStart, customEnd)
    );
    const activityLogs = workspace.activityLogs.filter((l) =>
      isWithinDateRange(l.createdAt, range, customStart, customEnd)
    );
    return { assets, assignments, maintenance, activityLogs };
  }, [workspace, range, customStart, customEnd]);

  const metrics = useMemo(() => {
    if (!workspace || !filteredData) return null;
    return computeDashboardMetrics({
      assets: filteredData.assets,
      employees: workspace.employees,
      departments: workspace.departments,
      inventory: workspace.inventory,
      maintenance: filteredData.maintenance,
      warrantyAlertDays: workspace.organization.warrantyAlertDays,
    });
  }, [workspace, filteredData]);

  const distributions = useMemo(() => {
    if (!workspace || !filteredData) return null;
    return buildAssetDistribution(filteredData.assets, workspace.departments, workspace.locations);
  }, [workspace, filteredData]);

  if (!workspace || !filteredData || !metrics || !distributions) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const currency = workspace.organization.currency;

  const summaryCards = [
    { label: 'Total IT Assets', value: metrics.totalAssets, sub: formatCurrency(metrics.totalAssetValue, currency), tone: 'default' },
    { label: 'Assigned Assets', value: metrics.assignedAssets, sub: `${Math.round((metrics.assignedAssets / Math.max(1, metrics.totalAssets)) * 100)}% deployed`, tone: 'info' },
    { label: 'Available Assets', value: metrics.availableAssets, sub: 'Ready for assignment', tone: 'success' },
    { label: 'Under Repair / Maint.', value: metrics.assetsUnderRepair, sub: 'Active service queue', tone: metrics.assetsUnderRepair > 0 ? 'warning' : 'default' },
    { label: 'Retired / Disposed', value: metrics.retiredAssets, sub: 'End-of-life assets', tone: 'default' },
    { label: 'Active Employees', value: metrics.totalEmployees, sub: `${workspace.employees.length} total directory records`, tone: 'default' },
    { label: 'Active Departments', value: metrics.activeDepartments, sub: `${workspace.locations.length} office locations`, tone: 'default' },
    { label: 'Inventory SKUs', value: metrics.totalInventoryItems, sub: formatCurrency(metrics.totalInventoryValue, currency), tone: 'default' },
    { label: 'Low / Out of Stock', value: metrics.lowStockItems, sub: 'Below minimum threshold', tone: metrics.lowStockItems > 0 ? 'danger' : 'success' },
    { label: 'Upcoming Maintenance', value: metrics.upcomingMaintenance, sub: 'Scheduled preventive tasks', tone: 'info' },
    { label: 'Overdue Maintenance', value: metrics.overdueMaintenance, sub: 'Requires immediate action', tone: metrics.overdueMaintenance > 0 ? 'danger' : 'success' },
    { label: 'Warranty Alerts', value: metrics.warrantyAlerts, sub: `Expired or < ${workspace.organization.warrantyAlertDays}d`, tone: metrics.warrantyAlerts > 0 ? 'warning' : 'success' },
  ];

  const stockChartData = workspace.inventory.slice(0, 8).map((item) => ({
    name: item.sku,
    qty: item.quantity,
    min: item.minStock,
  }));

  const warrantyAlertsList = workspace.assets
    .map((a) => ({
      asset: a,
      warranty: getWarrantyStatus(a.warrantyEnd, workspace.organization.warrantyAlertDays),
    }))
    .filter((x) => x.warranty.status === 'EXPIRED' || x.warranty.status === 'EXPIRING_SOON')
    .sort((a, b) => (a.warranty.daysRemaining ?? 0) - (b.warranty.daysRemaining ?? 0));

  const lowStockList = workspace.inventory.filter((i) => {
    const s = getStockStatus(i);
    return s === 'OUT_OF_STOCK' || s === 'LOW_STOCK';
  });

  const activeMaintList = workspace.maintenance
    .filter((m) => m.status !== 'COMPLETED' && m.status !== 'CANCELLED')
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const assetMap = new Map(workspace.assets.map((a) => [a.id, a]));
  const empMap = new Map(workspace.employees.map((e) => [e.id, e]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="IT Operations Dashboard"
        description={`Live infrastructure overview for ${workspace.organization.name}. Every metric is computed directly from persisted operational records.`}
        actions={
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 max-w-full">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setRange(opt.key)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
                  range === opt.key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      />

      {range === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs">
          <span className="font-medium text-slate-600 dark:text-slate-300">Custom Range:</span>
          <input
            type="date"
            aria-label="Start date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="h-8 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-slate-900 dark:text-slate-100"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            aria-label="End date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="h-8 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-slate-900 dark:text-slate-100"
          />
        </div>
      )}

      {/* Quick Actions */}
      <section
        aria-label="Quick actions"
        className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2"
      >
        {can('assets:create') && (
          <Button size="sm" className="col-span-2 sm:col-span-1" onClick={() => navigate('/assets?action=register')}>
            <Plus className="w-3.5 h-3.5" />
            Register Asset
          </Button>
        )}
        {can('assignments:manage') && (
          <>
            <Button size="sm" variant="secondary" onClick={() => navigate('/assignments?action=assign')}>
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Assign Asset
            </Button>
            <Button size="sm" variant="secondary" onClick={() => navigate('/assignments?action=return')}>
              <Laptop className="w-3.5 h-3.5" />
              Return Asset
            </Button>
          </>
        )}
        {can('employees:manage') && (
          <Button size="sm" variant="secondary" onClick={() => navigate('/employees?action=new')}>
            <UserPlus className="w-3.5 h-3.5" />
            Add Employee
          </Button>
        )}
        {can('inventory:manage') && (
          <Button size="sm" variant="secondary" onClick={() => navigate('/inventory?action=new')}>
            <Package className="w-3.5 h-3.5" />
            Add Inventory
          </Button>
        )}
        {can('maintenance:manage') && (
          <Button size="sm" variant="secondary" onClick={() => navigate('/maintenance?action=new')}>
            <Wrench className="w-3.5 h-3.5" />
            Schedule Maintenance
          </Button>
        )}
        {can('reports:view') && (
          <Button size="sm" variant="secondary" onClick={() => navigate('/reports')}>
            <BarChart3 className="w-3.5 h-3.5" />
            Generate Report
          </Button>
        )}
      </section>

      {/* 12 Summary KPI Cards */}
      <section
        aria-label="Key IT operations metrics"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3"
      >
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
              {card.label}
            </p>
            <p
              className={cn(
                'text-2xl font-bold tracking-tight tabular-nums mt-2',
                card.tone === 'danger' && 'text-red-600 dark:text-red-400',
                card.tone === 'warning' && 'text-amber-600 dark:text-amber-400',
                card.tone === 'success' && 'text-emerald-700 dark:text-emerald-400',
                card.tone === 'info' && 'text-sky-700 dark:text-sky-400',
                card.tone === 'default' && 'text-slate-900 dark:text-slate-50'
              )}
            >
              {card.value}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate tabular-nums">
              {card.sub}
            </p>
          </div>
        ))}
      </section>

      {/* Charts Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Assets by Category
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hardware distribution across active classes
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {filteredData.assets.length} total
            </span>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributions.byCategory.slice(0, 8)} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" name="Assets" fill="#0284c7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Assets by Department
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Equipment allocation across organizational units
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {workspace.departments.length} depts
            </span>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={distributions.byDepartment}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={142}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  interval={0}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" name="Assets" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Assets by Lifecycle Status
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Operational availability and service breakdown
              </p>
            </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributions.byStatus} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" name="Units" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Inventory Stock Levels vs. Minimum Threshold
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Current on-hand quantity compared against reorder minimum
              </p>
            </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="qty" name="On Hand" fill="#0284c7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="min" name="Min Stock" fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Operational Widgets */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Maintenance Queue */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Maintenance Schedule
            </h2>
            <button
              type="button"
              onClick={() => navigate('/maintenance')}
              className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline"
            >
              View all
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-1 flex-1">
            {activeMaintList.length === 0 ? (
              <p className="py-6 text-xs text-slate-500">No upcoming or overdue maintenance tasks.</p>
            ) : (
              activeMaintList.slice(0, 5).map((m) => {
                const asset = assetMap.get(m.assetId);
                const overdue = isMaintenanceOverdue(m);
                return (
                  <div key={m.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {asset ? `${asset.assetTag} · ${asset.name}` : m.assetId}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {m.maintenanceType} · {m.technicianName}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <StatusText
                        tone={overdue ? 'danger' : 'info'}
                        label={overdue ? 'Overdue' : formatDate(m.scheduledDate)}
                      />
                      <p className="text-[11px] text-slate-400 mt-0.5">{m.status.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Warranty & Low Stock Alerts */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Warranty &amp; Stock Alerts
            </h2>
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline"
            >
              Inventory
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-1 flex-1">
            {lowStockList.slice(0, 3).map((item) => {
              const out = item.quantity === 0;
              return (
                <div key={item.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {item.sku} · Min {item.minStock} {item.unit}
                    </p>
                  </div>
                  <StatusText
                    tone={out ? 'danger' : 'warning'}
                    label={out ? 'Out of stock' : `${item.quantity} left`}
                  />
                </div>
              );
            })}
            {warrantyAlertsList.slice(0, 3).map(({ asset, warranty }) => (
              <div key={asset.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {asset.assetTag} · {asset.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Warranty ends {formatDate(asset.warrantyEnd)}
                  </p>
                </div>
                <StatusText
                  tone={warranty.status === 'EXPIRED' ? 'danger' : 'warning'}
                  label={
                    warranty.status === 'EXPIRED'
                      ? 'Expired'
                      : `${warranty.daysRemaining}d left`
                  }
                />
              </div>
            ))}
            {lowStockList.length === 0 && warrantyAlertsList.length === 0 && (
              <p className="py-6 text-xs text-slate-500">All warranties and stock levels are nominal.</p>
            )}
          </div>
        </div>

        {/* Recent Activity & Handovers */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recent Operational Activity
            </h2>
            <button
              type="button"
              onClick={() => navigate('/activity-log')}
              className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline"
            >
              Audit log
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-1 flex-1">
            {filteredData.activityLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="py-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {log.actorName}
                  </span>
                  <span className="text-slate-400 tabular-nums">{formatDateTime(log.createdAt)}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {log.summary}
                </p>
              </div>
            ))}
            {filteredData.activityLogs.length === 0 && (
              <p className="py-6 text-xs text-slate-500">No recorded activity in the selected timeframe.</p>
            )}
          </div>
        </div>
      </section>

      {/* Recent Assignments Table */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recent Equipment Assignments &amp; Returns
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Latest staff equipment handovers and returns
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/assignments')}
            className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline"
          >
            Manage assignments
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-4 font-medium">Asset</th>
                <th className="py-2.5 px-4 font-medium">Employee</th>
                <th className="py-2.5 px-4 font-medium">Action</th>
                <th className="py-2.5 px-4 font-medium">Date</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium">Processed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredData.assignments.slice(0, 6).map((asg) => {
                const asset = assetMap.get(asg.assetId);
                const emp = empMap.get(asg.employeeId);
                return (
                  <tr key={asg.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {asset ? `${asset.assetTag} — ${asset.name}` : asg.assetId}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {emp?.fullName ?? asg.employeeId}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                      {asg.actionType}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {formatDate(asg.returnDate || asg.assignedDate)}
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusText
                        tone={asg.status === 'ACTIVE' ? 'info' : asg.status === 'RETURNED' ? 'success' : 'neutral'}
                        label={asg.status}
                      />
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {asg.performedBy}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

import React, { useMemo, useState, useCallback } from 'react';
import { Download, Printer, Filter, ChevronDown, ChevronUp, Calendar, BarChart2, PieChart, TrendingUp, FileText, Package } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  computeDashboardMetrics,
  getStockStatus,
  getWarrantyStatus,
  isMaintenanceOverdue,
  toCsv,
} from '../core/logic/operations';
import {
  Button,
  KPICard,
  PageHeader,
  Select,
  StatusText,
  Toast,
  ToastContainer,
  type ToastMessage,
} from '../components/ui/Primitives';
import { formatCurrency, formatDate, todayIsoDate } from '../lib/utils';
import {
  BarChart,
  Bar,
  Cell,
  PieChart as RechartsPieChart,
  Pie,
  ResponsiveContainer,
  Tooltip,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

type ReportTab = 'assets' | 'inventory' | 'maintenance' | 'employees' | 'monthly';

function downloadCsvFile(filename: string, headers: string[], rows: unknown[][]) {
  const csv = toCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function AssetStatusChart({ data }: { data: Array<{ status: string; count: number }> }) {
  const colors = {
    AVAILABLE: '#10b981',
    ASSIGNED: '#3b82f6',
    IN_REPAIR: '#f59e0b',
    UNDER_MAINTENANCE: '#8b5cf6',
    RETIRED: '#6b7280',
    DAMAGED: '#ef4444',
  };

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="status"
            width={100}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            formatter={(value: number) => [value, 'Assets']}
            contentStyle={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
          />
          <Legend />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[entry.status as keyof typeof colors] || '#888'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StockHealthChart({ data }: { data: Array<{ status: string; count: number }> }) {
  const colors = {
    IN_STOCK: '#10b981',
    LOW_STOCK: '#f59e0b',
    OUT_OF_STOCK: '#ef4444',
    OVERSTOCK: '#3b82f6',
  };

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            fill="#8884d0"
            dataKey="count"
            nameKey="status"
            label={({ status, count }) => `${status}: ${count}`}
            labelLine={false}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[entry.status as keyof typeof colors] || '#888'} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [value, 'SKUs']}
            contentStyle={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
          />
          <Legend />
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}

function MaintenanceStatusChart({ data }: { data: Array<{ status: string; count: number }> }) {
  const colors = {
    SCHEDULED: '#3b82f6',
    IN_PROGRESS: '#f59e0b',
    COMPLETED: '#10b981',
    OVERDUE: '#ef4444',
    CANCELLED: '#6b7280',
  };

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="status" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: number) => [value, 'Tasks']}
            contentStyle={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
          />
          <Legend />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[entry.status as keyof typeof colors] || '#888'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function WarrantyStatusChart({ data }: { data: Array<{ status: string; count: number }> }) {
  const colors = {
    ACTIVE: '#10b981',
    EXPIRING_SOON: '#f59e0b',
    EXPIRED: '#ef4444',
    NO_WARRANTY: '#6b7280',
  };

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            fill="#8884d0"
            dataKey="count"
            nameKey="status"
            label={({ status, count }) => `${status}: ${count}`}
            labelLine={false}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[entry.status as keyof typeof colors] || '#888'} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [value, 'Assets']}
            contentStyle={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
          />
          <Legend />
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ReportsPage() {
  const { workspace, can } = useWorkspace();
  const [activeTab, setActiveTab] = useState<ReportTab>('assets');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: '',
    to: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastMessage['type'], message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const canExport = can('reports:export');

  const deptMap = useMemo(
    () => new Map((workspace?.departments ?? []).map((d) => [d.id, d.name])),
    [workspace?.departments]
  );
  const locMap = useMemo(
    () => new Map((workspace?.locations ?? []).map((l) => [l.id, l.name])),
    [workspace?.locations]
  );
  const empMap = useMemo(
    () => new Map((workspace?.employees ?? []).map((e) => [e.id, e.fullName])),
    [workspace?.employees]
  );
  const assetMap = useMemo(
    () => new Map((workspace?.assets ?? []).map((a) => [a.id, a])),
    [workspace?.assets]
  );

  const metrics = useMemo(() => {
    if (!workspace) return null;
    return computeDashboardMetrics({
      assets: workspace.assets,
      employees: workspace.employees,
      departments: workspace.departments,
      inventory: workspace.inventory,
      maintenance: workspace.maintenance,
      warrantyAlertDays: workspace.organization.warrantyAlertDays,
    });
  }, [workspace]);

  const filteredAssets = useMemo(() => {
    if (!workspace) return [];
    return workspace.assets.filter((a) => {
      if (deptFilter !== 'ALL' && a.departmentId !== deptFilter) return false;
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      if (dateRange.from && a.purchaseDate && a.purchaseDate < dateRange.from) return false;
      if (dateRange.to && a.purchaseDate && a.purchaseDate > dateRange.to) return false;
      return true;
    });
  }, [workspace, deptFilter, statusFilter, dateRange]);

  if (!workspace || !metrics) return null;

  const currency = workspace.organization.currency || 'USD';

  const handleExportCurrentCsv = () => {
    const stamp = todayIsoDate();
    if (activeTab === 'assets') {
      downloadCsvFile(
        `fixdesk-assets-report-${stamp}.csv`,
        [
          'Asset Tag',
          'Name',
          'Category',
          'Manufacturer',
          'Model',
          'Serial Number',
          'Status',
          'Condition',
          'Department',
          'Location',
          'Assigned To',
          'Purchase Price',
          'Warranty End',
          'Warranty Status',
        ],
        filteredAssets.map((a) => {
          const w = getWarrantyStatus(a.warrantyEnd, workspace.organization.warrantyAlertDays);
          return [
            a.assetTag,
            a.name,
            a.category,
            a.manufacturer,
            a.model,
            a.serialNumber,
            a.status,
            a.condition,
            deptMap.get(a.departmentId) ?? '',
            locMap.get(a.locationId) ?? '',
            empMap.get(a.assignedEmployeeId) ?? 'Unassigned',
            a.purchasePrice,
            a.warrantyEnd || '',
            w.status,
          ];
        })
      );
    } else if (activeTab === 'inventory') {
      downloadCsvFile(
        `fixdesk-inventory-report-${stamp}.csv`,
        ['SKU', 'Name', 'Category', 'Location', 'Quantity', 'Unit', 'Min Stock', 'Max Stock', 'Status', 'Unit Price', 'Valuation', 'Supplier'],
        workspace.inventory.map((i) => [
          i.sku,
          i.name,
          i.category,
          locMap.get(i.locationId) ?? '',
          i.quantity,
          i.unit,
          i.minStock,
          i.maxStock,
          getStockStatus(i),
          i.unitPrice,
          (i.quantity * i.unitPrice).toFixed(2),
          i.supplier,
        ])
      );
    } else if (activeTab === 'maintenance') {
      downloadCsvFile(
        `fixdesk-maintenance-report-${stamp}.csv`,
        ['Asset Tag', 'Asset Name', 'Type', 'Technician', 'Scheduled Date', 'Completed Date', 'Recurrence', 'Status', 'Overdue', 'Cost'],
        workspace.maintenance.map((m) => {
          const a = assetMap.get(m.assetId);
          return [
            a?.assetTag ?? m.assetId,
            a?.name ?? '',
            m.maintenanceType,
            m.technicianName,
            m.scheduledDate,
            m.completionDate ?? '',
            m.recurrence,
            m.status,
            isMaintenanceOverdue(m) ? 'YES' : 'NO',
            m.cost,
          ];
        })
      );
    } else if (activeTab === 'employees') {
      downloadCsvFile(
        `fixdesk-employee-equipment-${stamp}.csv`,
        ['Employee Code', 'Full Name', 'Department', 'Location', 'Status', 'Assigned Asset Count', 'Assigned Asset Tags'],
        workspace.employees.map((emp) => {
          const held = workspace.assets.filter((a) => a.assignedEmployeeId === emp.id);
          return [
            emp.employeeCode,
            emp.fullName,
            deptMap.get(emp.departmentId) ?? '',
            locMap.get(emp.locationId) ?? '',
            emp.status,
            held.length,
            held.map((h) => h.assetTag).join('; '),
          ];
        })
      );
    } else {
      downloadCsvFile(
        `fixdesk-monthly-summary-${stamp}.csv`,
        ['Metric', 'Value'],
        [
          ['Organization', workspace.organization.name],
          ['Report Date', stamp],
          ['Total IT Assets', metrics.totalAssets],
          ['Assigned Assets', metrics.assignedAssets],
          ['Available Assets', metrics.availableAssets],
          ['Assets Under Repair / Maintenance', metrics.assetsUnderRepair],
          ['Retired / Disposed Assets', metrics.retiredAssets],
          ['Total Asset Valuation', metrics.totalAssetValue.toFixed(2)],
          ['Active Employees', metrics.totalEmployees],
          ['Active Departments', metrics.activeDepartments],
          ['Inventory SKUs', metrics.totalInventoryItems],
          ['Low / Out of Stock Items', metrics.lowStockItems],
          ['Inventory Valuation', metrics.totalInventoryValue.toFixed(2)],
          ['Upcoming Maintenance Tasks', metrics.upcomingMaintenance],
          ['Overdue Maintenance Tasks', metrics.overdueMaintenance],
          ['Cumulative Maintenance Cost', metrics.totalMaintenanceCost.toFixed(2)],
          ['Warranty Expiring / Expired Alerts', metrics.warrantyAlerts],
        ]
      );
    }
    showToast('success', 'Report exported to CSV');
  };

  const tabs: { id: ReportTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'assets', label: 'Asset Register & Warranty', icon: BarChart2 },
    { id: 'inventory', label: 'Inventory & Valuation', icon: PieChart },
    { id: 'maintenance', label: 'Maintenance & Costs', icon: TrendingUp },
    { id: 'employees', label: 'Employee Equipment', icon: FileText },
    { id: 'monthly', label: 'Monthly IT Operational Summary', icon: BarChart2 },
  ];

  const expiringOrExpiredAssets = workspace.assets.filter((a) => {
    const w = getWarrantyStatus(a.warrantyEnd, workspace.organization.warrantyAlertDays);
    return w.status === 'EXPIRING_SOON' || w.status === 'EXPIRED';
  });

  const lowStockList = workspace.inventory.filter((i) => {
    const st = getStockStatus(i);
    return st === 'LOW_STOCK' || st === 'OUT_OF_STOCK';
  });

  const overdueMaint = workspace.maintenance.filter((m) => isMaintenanceOverdue(m));

  // Chart data
  const assetStatusData = useMemo(() => {
    const counts = new Map<string, number>();
    workspace.assets.forEach((a) => counts.set(a.status, (counts.get(a.status) || 0) + 1));
    return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
  }, [workspace?.assets]);

  const stockHealthData = useMemo(() => {
    const counts = new Map<string, number>();
    workspace.inventory.forEach((i) => {
      const st = getStockStatus(i);
      counts.set(st, (counts.get(st) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
  }, [workspace?.inventory]);

  const maintenanceStatusData = useMemo(() => {
    const counts = new Map<string, number>();
    workspace.maintenance.forEach((m) => {
      const status = isMaintenanceOverdue(m) ? 'OVERDUE' : m.status;
      counts.set(status, (counts.get(status) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
  }, [workspace?.maintenance]);

  const warrantyStatusData = useMemo(() => {
    const counts = new Map<string, number>();
    workspace.assets.forEach((a) => {
      const w = getWarrantyStatus(a.warrantyEnd, workspace.organization.warrantyAlertDays);
      counts.set(w.status, (counts.get(w.status) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
  }, [workspace?.assets, workspace?.organization.warrantyAlertDays]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Operational Analytics"
        description="Real-time operational reports generated directly from organization asset, inventory, maintenance, and assignment records."
        actions={
          <div className="flex items-center gap-2 no-print">
            {canExport && (
              <Button variant="secondary" onClick={handleExportCurrentCsv}>
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            )}
            <Button onClick={() => window.print()}>
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </Button>
          </div>
        }
      />

      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Report categories"
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 no-print"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                active
                  ? 'border-slate-900 text-slate-900 dark:border-sky-500 dark:text-sky-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
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
            <span className="font-medium text-slate-900 dark:text-slate-100">Filters</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {(deptFilter !== 'ALL' || statusFilter !== 'ALL' || dateRange.from || dateRange.to) ? 'Active' : 'None'}
            </span>
          </div>
          {showFilters ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>
        {showFilters && (
          <div className="px-5 pb-4 border-t border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
              <Select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                aria-label="Filter by department"
                className="w-full"
              >
                <option value="ALL">All Departments</option>
                {workspace.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
                className="w-full"
              >
                <option value="ALL">All Statuses</option>
                {activeTab === 'assets' && (
                  <>
                    <option value="AVAILABLE">Available</option>
                    <option value="ASSIGNED">Assigned</option>
                    <option value="IN_REPAIR">In Repair</option>
                    <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                    <option value="RETIRED">Retired</option>
                    <option value="DAMAGED">Damaged</option>
                  </>
                )}
                {activeTab === 'inventory' && (
                  <>
                    <option value="IN_STOCK">In Stock</option>
                    <option value="LOW_STOCK">Low Stock</option>
                    <option value="OUT_OF_STOCK">Out of Stock</option>
                    <option value="OVERSTOCK">Overstock</option>
                  </>
                )}
                {activeTab === 'maintenance' && (
                  <>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="OVERDUE">Overdue</option>
                    <option value="CANCELLED">Cancelled</option>
                  </>
                )}
              </Select>
              <div className="flex gap-2">
                <Field label="From Date" htmlFor="date-from" className="flex-1">
                  <Input
                    id="date-from"
                    type="date"
                    value={dateRange.from}
                    onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
                    className="h-10"
                  />
                </Field>
                <Field label="To Date" htmlFor="date-to" className="flex-1">
                  <Input
                    id="date-to"
                    type="date"
                    value={dateRange.to}
                    onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
                    className="h-10"
                  />
                </Field>
              </div>
              {((deptFilter !== 'ALL') || (statusFilter !== 'ALL') || dateRange.from || dateRange.to) && (
                <Button variant="ghost" size="sm" onClick={() => { setDeptFilter('ALL'); setStatusFilter('ALL'); setDateRange({ from: '', to: '' }); }}>
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ASSET REPORT */}
      {activeTab === 'assets' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              label="Total Assets"
              value={filteredAssets.length}
              sub={formatCurrency(filteredAssets.reduce((sum, a) => sum + Number(a.purchasePrice || 0), 0), currency)}
              tone="default"
              icon={BarChart2}
            />
            <KPICard
              label="Assigned"
              value={filteredAssets.filter((a) => a.status === 'ASSIGNED').length}
              sub="Active assignments"
              tone="info"
              icon={BarChart2}
            />
            <KPICard
              label="Available"
              value={filteredAssets.filter((a) => a.status === 'AVAILABLE').length}
              sub="Ready for deployment"
              tone="success"
              icon={BarChart2}
            />
            <KPICard
              label="Warranty Alerts"
              value={expiringOrExpiredAssets.length}
              sub="Expiring or expired"
              tone={expiringOrExpiredAssets.length > 0 ? 'danger' : 'success'}
              icon={BarChart2}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Asset Status Distribution</h3>
              <AssetStatusChart data={assetStatusData} />
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Warranty Status Overview</h3>
              <WarrantyStatusChart data={warrantyStatusData} />
            </div>
          </div>

          {/* Data Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Tag</th>
                  <th className="py-3 px-4">Asset</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Custodian</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Warranty</th>
                  <th className="py-3 px-4 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAssets.map((a) => {
                  const w = getWarrantyStatus(a.warrantyEnd, workspace.organization.warrantyAlertDays);
                  return (
                    <tr key={a.id}>
                      <td className="py-2.5 px-4 font-mono text-xs font-semibold">{a.assetTag}</td>
                      <td className="py-2.5 px-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{a.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{a.serialNumber}</p>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{a.category}</td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                        {deptMap.get(a.departmentId) ?? '—'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                        {empMap.get(a.assignedEmployeeId) ?? 'Unassigned'}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusText
                          tone={
                            a.status === 'AVAILABLE'
                              ? 'success'
                              : a.status === 'ASSIGNED'
                              ? 'info'
                              : a.status === 'IN_REPAIR' || a.status === 'UNDER_MAINTENANCE'
                              ? 'warning'
                              : 'danger'
                          }
                          label={a.status.replace(/_/g, ' ')}
                        />
                      </td>
                      <td className="py-2.5 px-4 text-xs">
                        <span className="block tabular-nums">{formatDate(a.warrantyEnd)}</span>
                        <StatusText
                          tone={
                            w.status === 'EXPIRED'
                              ? 'danger'
                              : w.status === 'EXPIRING_SOON'
                              ? 'warning'
                              : w.status === 'ACTIVE'
                              ? 'success'
                              : 'neutral'
                          }
                          label={w.status.replace(/_/g, ' ')}
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">
                        {formatCurrency(a.purchasePrice, a.currency || currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INVENTORY REPORT */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Stock Valuation</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-1 tabular-nums">
                {formatCurrency(metrics.totalInventoryValue, currency)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Low / Out-of-Stock SKUs</p>
              <p className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-1 tabular-nums">
                {metrics.lowStockItems}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Logged Stock Movements</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-1 tabular-nums">
                {workspace.inventoryTransactions.length}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Stock Health Distribution</h3>
              <StockHealthChart data={stockHealthData} />
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Top Valued Items</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {workspace.inventory
                  .sort((a, b) => b.quantity * b.unitPrice - a.quantity * a.unitPrice)
                  .slice(0, 10)
                  .map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                          <Package className="w-4 h-4 text-slate-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-xs">{item.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{item.sku}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {formatCurrency(item.quantity * item.unitPrice, item.currency || currency)}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{item.quantity} {item.unit}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Item</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4 text-right">Qty</th>
                  <th className="py-3 px-4 text-right">Min / Max</th>
                  <th className="py-3 px-4">Stock Health</th>
                  <th className="py-3 px-4 text-right">Valuation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {workspace.inventory.map((item) => {
                  const st = getStockStatus(item);
                  return (
                    <tr key={item.id}>
                      <td className="py-2.5 px-4 font-mono text-xs font-semibold">{item.sku}</td>
                      <td className="py-2.5 px-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{item.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{item.category}</p>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                        {locMap.get(item.locationId) ?? '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-500 tabular-nums">
                        {item.minStock} / {item.maxStock}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusText
                          tone={
                            st === 'OUT_OF_STOCK'
                              ? 'danger'
                              : st === 'LOW_STOCK'
                              ? 'warning'
                              : st === 'OVERSTOCK'
                              ? 'info'
                              : 'success'
                          }
                          label={st.replace(/_/g, ' ')}
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">
                        {formatCurrency(item.quantity * item.unitPrice, item.currency || currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MAINTENANCE REPORT */}
      {activeTab === 'maintenance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Cumulative Maintenance Spend</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-1 tabular-nums">
                {formatCurrency(metrics.totalMaintenanceCost, currency)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Overdue Tasks</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-1 tabular-nums">
                {metrics.overdueMaintenance}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Completed Records</p>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
                {workspace.maintenance.filter((m) => m.status === 'COMPLETED').length}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Maintenance Status Distribution</h3>
              <MaintenanceStatusChart data={maintenanceStatusData} />
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cost by Maintenance Type</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {Object.entries(
                  workspace.maintenance.reduce((acc, m) => {
                    acc[m.maintenanceType] = (acc[m.maintenanceType] || 0) + m.cost;
                    return acc;
                  }, {} as Record<string, number>)
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, cost]) => (
                    <div key={type} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span className="text-slate-700 dark:text-slate-300">{type}</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatCurrency(cost, currency)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Asset</th>
                  <th className="py-3 px-4">Maintenance Type</th>
                  <th className="py-3 px-4">Technician</th>
                  <th className="py-3 px-4">Scheduled</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {workspace.maintenance.map((m) => {
                  const asset = assetMap.get(m.assetId);
                  const overdue = isMaintenanceOverdue(m);
                  return (
                    <tr key={m.id}>
                      <td className="py-2.5 px-4">
                        <p className="font-mono text-xs font-semibold">{asset?.assetTag ?? m.assetId}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{asset?.name ?? ''}</p>
                      </td>
                      <td className="py-2.5 px-4 text-slate-800 dark:text-slate-200">{m.maintenanceType}</td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{m.technicianName}</td>
                      <td className="py-2.5 px-4 text-xs tabular-nums">
                        {formatDate(m.scheduledDate)}
                        {overdue && (
                          <span className="ml-2 text-red-600 dark:text-red-400 font-semibold">Overdue</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusText
                          tone={
                            m.status === 'COMPLETED'
                              ? 'success'
                              : overdue
                              ? 'danger'
                              : m.status === 'IN_PROGRESS'
                              ? 'info'
                              : 'warning'
                          }
                          label={m.status.replace(/_/g, ' ')}
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">
                        {formatCurrency(m.cost, m.currency || currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EMPLOYEE EQUIPMENT REPORT */}
      {activeTab === 'employees' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Assigned Count</th>
                <th className="py-3 px-4">Assigned Equipment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {workspace.employees.map((emp) => {
                const held = workspace.assets.filter((a) => a.assignedEmployeeId === emp.id);
                return (
                  <tr key={emp.id}>
                    <td className="py-2.5 px-4 font-mono text-xs">{emp.employeeCode}</td>
                    <td className="py-2.5 px-4">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{emp.fullName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{emp.position}</p>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                      {deptMap.get(emp.departmentId) ?? '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusText
                        tone={emp.status === 'ACTIVE' ? 'success' : 'neutral'}
                        label={emp.status}
                      />
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">{held.length}</td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                      {held.length === 0
                        ? 'No equipment assigned'
                        : held.map((a) => `${a.assetTag} (${a.name})`).join(', ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MONTHLY IT OPERATIONAL REPORT */}
      {activeTab === 'monthly' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
                Executive IT Operations Report
              </p>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">
                {workspace.organization.name} — Monthly IT Operational Summary
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Generated {formatDate(todayIsoDate())}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Managed Assets</p>
              <p className="text-xl font-bold tabular-nums mt-1">{metrics.totalAssets}</p>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {formatCurrency(metrics.totalAssetValue, currency)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Active Assignments</p>
              <p className="text-xl font-bold tabular-nums mt-1">{metrics.assignedAssets}</p>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {metrics.availableAssets} available in pool
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Maintenance Spend</p>
              <p className="text-xl font-bold tabular-nums mt-1">
                {formatCurrency(metrics.totalMaintenanceCost, currency)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {metrics.overdueMaintenance} overdue · {metrics.upcomingMaintenance} scheduled
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Stock Valuation</p>
              <p className="text-xl font-bold tabular-nums mt-1">
                {formatCurrency(metrics.totalInventoryValue, currency)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {metrics.lowStockItems} SKUs need reorder
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Asset Status Overview</h3>
              <AssetStatusChart data={assetStatusData} />
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Warranty Status Overview</h3>
              <WarrantyStatusChart data={warrantyStatusData} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Key Operational Risks & Action Items
              </h3>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                <li>
                  <strong>Warranty Exposure:</strong> {expiringOrExpiredAssets.length} asset(s) have expired or
                  soon-expiring warranties within the {workspace.organization.warrantyAlertDays}-day threshold.
                </li>
                <li>
                  <strong>Spare Parts Replenishment:</strong> {lowStockList.length} inventory item(s) are at or below
                  minimum threshold ({lowStockList.slice(0, 3).map((i) => i.name).join(', ') || 'none'}).
                </li>
                <li>
                  <strong>Preventive Maintenance Compliance:</strong> {overdueMaint.length} maintenance task(s) are past
                  their scheduled date and require immediate technician follow-up.
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Recommendations for Next Cycle
              </h3>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                <li>Schedule warranty renewal or hardware refresh quotes for aging workstations and server infrastructure.</li>
                <li>Issue purchase orders for low-stock consumables and network spare parts to maintain buffer capacity.</li>
                <li>Verify equipment return sign-offs for any transitioning or inactive staff accounts in the Employee directory.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
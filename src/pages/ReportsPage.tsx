import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  computeDashboardMetrics,
  getStockStatus,
  getWarrantyStatus,
  isMaintenanceOverdue,
  toCsv,
} from '../core/logic/operations';
import { Button, PageHeader, Select, StatusText } from '../components/ui/Primitives';
import { formatCurrency, formatDate, todayIsoDate } from '../lib/utils';

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

export function ReportsPage() {
  const { workspace, can } = useWorkspace();
  const [activeTab, setActiveTab] = useState<ReportTab>('assets');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

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
      return true;
    });
  }, [workspace, deptFilter, statusFilter]);

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
  };

  const tabs: { id: ReportTab; label: string }[] = [
    { id: 'assets', label: 'Asset Register & Warranty' },
    { id: 'inventory', label: 'Inventory & Valuation' },
    { id: 'maintenance', label: 'Maintenance & Costs' },
    { id: 'employees', label: 'Employee Equipment' },
    { id: 'monthly', label: 'Monthly IT Operational Summary' },
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
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-slate-900 text-slate-900 dark:border-sky-500 dark:text-sky-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ASSET REPORT */}
      {activeTab === 'assets' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 no-print">
            <div className="flex flex-wrap gap-3">
              <Select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                aria-label="Filter report by department"
                className="w-48"
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
                aria-label="Filter report by asset status"
                className="w-48"
              >
                <option value="ALL">All Statuses</option>
                <option value="AVAILABLE">Available</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="IN_REPAIR">In Repair</option>
                <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                <option value="RETIRED">Retired</option>
                <option value="DAMAGED">Damaged</option>
              </Select>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Showing {filteredAssets.length} assets · Total book value:{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(
                  filteredAssets.reduce((sum, a) => sum + Number(a.purchasePrice || 0), 0),
                  currency
                )}
              </span>
            </p>
          </div>

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
        <div className="space-y-4">
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
        <div className="space-y-4">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Key Operational Risks &amp; Action Items
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
    </div>
  );
}

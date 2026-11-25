import type {
  AppNotification,
  Asset,
  AssetAssignment,
  Department,
  Employee,
  InventoryItem,
  InventoryTransactionType,
  Location,
  MaintenanceRecurrence,
  MaintenanceRecord,
  Organization,
  StockStatus,
  WorkspaceSnapshot,
} from '../types/domain';

export type WarrantyStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'NONE';

export function getWarrantyStatus(
  warrantyEnd?: string,
  alertDays = 60,
  referenceDate: Date = new Date()
): { status: WarrantyStatus; daysRemaining: number | null } {
  if (!warrantyEnd) {
    return { status: 'NONE', daysRemaining: null };
  }
  const end = new Date(warrantyEnd);
  if (Number.isNaN(end.getTime())) {
    return { status: 'NONE', daysRemaining: null };
  }
  const startOfRef = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const startOfEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diffMs = startOfEnd.getTime() - startOfRef.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    return { status: 'EXPIRED', daysRemaining };
  }
  if (daysRemaining <= alertDays) {
    return { status: 'EXPIRING_SOON', daysRemaining };
  }
  return { status: 'ACTIVE', daysRemaining };
}

export function getStockStatus(item: Pick<InventoryItem, 'quantity' | 'minStock' | 'maxStock'>): StockStatus {
  if (item.quantity <= 0) return 'OUT_OF_STOCK';
  if (item.quantity <= item.minStock) return 'LOW_STOCK';
  if (item.quantity > item.maxStock) return 'OVERSTOCK';
  return 'IN_STOCK';
}

export function calculateInventoryDelta(
  currentQuantity: number,
  type: InventoryTransactionType,
  inputQuantity: number,
  allowAuthorizedNegativeOverride = false
): { ok: true; delta: number; nextQuantity: number } | { ok: false; error: string } {
  if (!Number.isFinite(inputQuantity) || !Number.isInteger(inputQuantity) || inputQuantity === 0) {
    return { ok: false, error: 'Quantity must be a non-zero whole number.' };
  }

  let delta = 0;
  switch (type) {
    case 'ADD':
    case 'RETURN':
      if (inputQuantity < 0) return { ok: false, error: 'Enter a positive quantity to add or return stock.' };
      delta = inputQuantity;
      break;
    case 'ISSUE':
    case 'TRANSFER':
      if (inputQuantity < 0) return { ok: false, error: 'Enter a positive quantity to issue or transfer stock.' };
      delta = -inputQuantity;
      break;
    case 'ADJUST':
      delta = inputQuantity;
      break;
  }

  const nextQuantity = currentQuantity + delta;
  if (nextQuantity < 0 && !allowAuthorizedNegativeOverride) {
    return {
      ok: false,
      error: `Insufficient stock. Available quantity is ${currentQuantity}; cannot reduce by ${Math.abs(delta)}.`,
    };
  }

  return { ok: true, delta, nextQuantity: Math.max(0, nextQuantity) };
}

export function isMaintenanceOverdue(
  record: Pick<MaintenanceRecord, 'status' | 'scheduledDate'>,
  referenceDate: Date = new Date()
): boolean {
  if (record.status === 'COMPLETED' || record.status === 'CANCELLED') return false;
  const scheduled = new Date(record.scheduledDate);
  if (Number.isNaN(scheduled.getTime())) return false;
  const startOfRef = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const startOfSched = new Date(scheduled.getFullYear(), scheduled.getMonth(), scheduled.getDate());
  return startOfSched.getTime() < startOfRef.getTime();
}

export function computeNextMaintenanceDate(
  baseIsoDate: string,
  recurrence: MaintenanceRecurrence,
  customIntervalDays?: number
): string | null {
  if (recurrence === 'NONE') return null;
  const base = new Date(baseIsoDate);
  if (Number.isNaN(base.getTime())) return null;

  const next = new Date(base.getTime());
  if (recurrence === 'MONTHLY') {
    next.setMonth(next.getMonth() + 1);
  } else if (recurrence === 'QUARTERLY') {
    next.setMonth(next.getMonth() + 3);
  } else if (recurrence === 'ANNUAL') {
    next.setFullYear(next.getFullYear() + 1);
  } else if (recurrence === 'CUSTOM') {
    const days = customIntervalDays && customIntervalDays > 0 ? customIntervalDays : 30;
    next.setDate(next.getDate() + days);
  }
  return next.toISOString().slice(0, 10);
}

export type DateRangeFilter = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';

export function isWithinDateRange(
  isoDate: string | undefined,
  range: DateRangeFilter,
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date()
): boolean {
  if (range === 'all' || !isoDate) return true;
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return true;

  const refStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  if (range === 'today') {
    return target >= refStart;
  }
  if (range === 'week') {
    const weekAgo = new Date(refStart);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return target >= weekAgo;
  }
  if (range === 'month') {
    const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    return target >= monthStart;
  }
  if (range === 'year') {
    const yearStart = new Date(referenceDate.getFullYear(), 0, 1);
    return target >= yearStart;
  }
  if (range === 'custom') {
    if (customStart) {
      const start = new Date(customStart);
      if (!Number.isNaN(start.getTime()) && target < start) return false;
    }
    if (customEnd) {
      const end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
      if (!Number.isNaN(end.getTime()) && target > end) return false;
    }
    return true;
  }
  return true;
}

export interface DashboardMetrics {
  totalAssets: number;
  assignedAssets: number;
  availableAssets: number;
  assetsUnderRepair: number;
  retiredAssets: number;
  totalEmployees: number;
  activeDepartments: number;
  totalInventoryItems: number;
  lowStockItems: number;
  upcomingMaintenance: number;
  overdueMaintenance: number;
  warrantyAlerts: number;
  totalAssetValue: number;
  totalInventoryValue: number;
  totalMaintenanceCost: number;
}

export function computeDashboardMetrics(params: {
  assets: Asset[];
  employees: Employee[];
  departments: Department[];
  inventory: InventoryItem[];
  maintenance: MaintenanceRecord[];
  warrantyAlertDays: number;
  referenceDate?: Date;
}): DashboardMetrics {
  const ref = params.referenceDate ?? new Date();
  let assignedAssets = 0;
  let availableAssets = 0;
  let assetsUnderRepair = 0;
  let retiredAssets = 0;
  let warrantyAlerts = 0;
  let totalAssetValue = 0;

  for (const a of params.assets) {
    totalAssetValue += Number(a.purchasePrice || 0);
    if (a.status === 'ASSIGNED') assignedAssets++;
    else if (a.status === 'AVAILABLE') availableAssets++;
    else if (a.status === 'IN_REPAIR' || a.status === 'UNDER_MAINTENANCE') assetsUnderRepair++;
    else if (a.status === 'RETIRED' || a.status === 'DISPOSED') retiredAssets++;

    const w = getWarrantyStatus(a.warrantyEnd, params.warrantyAlertDays, ref);
    if (w.status === 'EXPIRING_SOON' || w.status === 'EXPIRED') {
      warrantyAlerts++;
    }
  }

  let lowStockItems = 0;
  let totalInventoryValue = 0;
  for (const item of params.inventory) {
    totalInventoryValue += item.quantity * item.unitPrice;
    const st = getStockStatus(item);
    if (st === 'LOW_STOCK' || st === 'OUT_OF_STOCK') {
      lowStockItems++;
    }
  }

  let upcomingMaintenance = 0;
  let overdueMaintenance = 0;
  let totalMaintenanceCost = 0;
  for (const m of params.maintenance) {
    totalMaintenanceCost += Number(m.cost || 0);
    if (m.status !== 'COMPLETED' && m.status !== 'CANCELLED') {
      if (isMaintenanceOverdue(m, ref)) {
        overdueMaintenance++;
      } else {
        upcomingMaintenance++;
      }
    }
  }

  return {
    totalAssets: params.assets.length,
    assignedAssets,
    availableAssets,
    assetsUnderRepair,
    retiredAssets,
    totalEmployees: params.employees.filter((e) => e.status === 'ACTIVE').length,
    activeDepartments: params.departments.filter((d) => d.status === 'ACTIVE').length,
    totalInventoryItems: params.inventory.length,
    lowStockItems,
    upcomingMaintenance,
    overdueMaintenance,
    warrantyAlerts,
    totalAssetValue,
    totalInventoryValue,
    totalMaintenanceCost,
  };
}

export function buildOperationalNotifications(params: {
  assets: Asset[];
  inventory: InventoryItem[];
  maintenance: MaintenanceRecord[];
  assignments: AssetAssignment[];
  warrantyAlertDays: number;
  readIds: Set<string>;
  referenceDate?: Date;
}): AppNotification[] {
  const ref = params.referenceDate ?? new Date();
  const list: AppNotification[] = [];

  for (const m of params.maintenance) {
    if (m.status !== 'COMPLETED' && m.status !== 'CANCELLED') {
      const overdue = isMaintenanceOverdue(m, ref);
      const id = `maint-${m.id}`;
      list.push({
        id,
        severity: overdue ? 'critical' : 'warning',
        category: 'MAINTENANCE',
        title: overdue ? 'Overdue maintenance task' : 'Upcoming maintenance scheduled',
        message: `${m.maintenanceType} (${m.scheduledDate}) assigned to ${m.technicianName}.`,
        entityPath: '/maintenance',
        timestamp: m.updatedAt,
        read: params.readIds.has(id),
      });
    }
  }

  for (const item of params.inventory) {
    const status = getStockStatus(item);
    if (status === 'OUT_OF_STOCK' || status === 'LOW_STOCK') {
      const id = `inv-${item.id}`;
      list.push({
        id,
        severity: status === 'OUT_OF_STOCK' ? 'critical' : 'warning',
        category: 'INVENTORY',
        title: status === 'OUT_OF_STOCK' ? `Out of stock: ${item.name}` : `Low stock: ${item.name}`,
        message: `${item.quantity} ${item.unit} remaining (minimum threshold: ${item.minStock}).`,
        entityPath: '/inventory',
        timestamp: item.updatedAt,
        read: params.readIds.has(id),
      });
    }
  }

  for (const a of params.assets) {
    const w = getWarrantyStatus(a.warrantyEnd, params.warrantyAlertDays, ref);
    if (w.status === 'EXPIRING_SOON' || w.status === 'EXPIRED') {
      const id = `war-${a.id}`;
      list.push({
        id,
        severity: w.status === 'EXPIRED' ? 'critical' : 'warning',
        category: 'WARRANTY',
        title:
          w.status === 'EXPIRED'
            ? `Warranty expired: ${a.assetTag}`
            : `Warranty expiring soon: ${a.assetTag}`,
        message: `${a.name} warranty end date is ${a.warrantyEnd}.`,
        entityPath: `/assets`,
        timestamp: a.updatedAt,
        read: params.readIds.has(id),
      });
    }
  }

  for (const asg of params.assignments.slice(0, 3)) {
    const id = `asg-${asg.id}`;
    list.push({
      id,
      severity: 'info',
      category: 'ASSIGNMENT',
      title: `Asset ${asg.actionType.toLowerCase()} recorded`,
      message: `Performed by ${asg.performedBy} on ${asg.assignedDate}.`,
      entityPath: '/assignments',
      timestamp: asg.updatedAt,
      read: params.readIds.has(id),
    });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  return list.sort((a, b) => order[a.severity] - order[b.severity]);
}

function escapeCsvCell(raw: unknown): string {
  const str = raw == null ? '' : String(raw);
  // Neutralize spreadsheet formula injection (=, +, -, @, tab, CR)
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const bodyLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [headerLine, ...bodyLines].join('\r\n');
}

export function validateBackupSnapshot(raw: unknown): { ok: true; data: WorkspaceSnapshot } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Backup file must be a valid JSON object.' };
  }
  const obj = raw as Partial<WorkspaceSnapshot>;
  if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion < 1) {
    return { ok: false, error: 'Missing or invalid FixDesk schemaVersion.' };
  }
  if (!obj.organization || typeof obj.organization.name !== 'string' || !obj.organization.id) {
    return { ok: false, error: 'Backup file is missing organization metadata.' };
  }
  const requiredArrays: (keyof WorkspaceSnapshot)[] = [
    'departments',
    'locations',
    'employees',
    'assets',
    'assignments',
    'inventory',
    'inventoryTransactions',
    'maintenance',
    'knowledgeArticles',
    'activityLogs',
  ];
  for (const key of requiredArrays) {
    if (!Array.isArray(obj[key])) {
      return { ok: false, error: `Backup file is missing required collection "${key}".` };
    }
  }
  return { ok: true, data: obj as WorkspaceSnapshot };
}

export function buildAssetDistribution(
  assets: Asset[],
  departments: Department[],
  locations: Location[]
) {
  const byCategoryMap = new Map<string, number>();
  const byStatusMap = new Map<string, number>();
  const byDeptMap = new Map<string, number>();
  const byLocMap = new Map<string, number>();
  const byCondMap = new Map<string, number>();

  const deptNames = new Map(departments.map((d) => [d.id, d.name]));
  const locNames = new Map(locations.map((l) => [l.id, l.name]));

  for (const a of assets) {
    byCategoryMap.set(a.category, (byCategoryMap.get(a.category) ?? 0) + 1);
    byStatusMap.set(a.status, (byStatusMap.get(a.status) ?? 0) + 1);
    const dName = deptNames.get(a.departmentId) ?? 'Unassigned';
    byDeptMap.set(dName, (byDeptMap.get(dName) ?? 0) + 1);
    const lName = locNames.get(a.locationId) ?? 'Unassigned';
    byLocMap.set(lName, (byLocMap.get(lName) ?? 0) + 1);
    byCondMap.set(a.condition, (byCondMap.get(a.condition) ?? 0) + 1);
  }

  return {
    byCategory: Array.from(byCategoryMap, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    byStatus: Array.from(byStatusMap, ([name, count]) => ({ name: name.replace(/_/g, ' '), raw: name, count })),
    byDepartment: Array.from(byDeptMap, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    byLocation: Array.from(byLocMap, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    byCondition: Array.from(byCondMap, ([name, count]) => ({ name, count })),
  };
}

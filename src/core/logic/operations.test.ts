import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateInventoryDelta,
  computeDashboardMetrics,
  computeNextMaintenanceDate,
  getStockStatus,
  getWarrantyStatus,
  isMaintenanceOverdue,
  toCsv,
  validateBackupSnapshot,
} from './operations';
import { calculateSubnet } from './subnet';
import { canAccessKnowledgeArticle, hasPermission } from '../permissions/rbac';
import { assetSchema, inventoryItemSchema } from '../validation/schemas';

test('IPv4 subnet calculator computes /26 network accurately', () => {
  const res = calculateSubnet('192.168.10.45', 26);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.subnetMask, '255.255.255.192');
    assert.equal(res.data.wildcardMask, '0.0.0.63');
    assert.equal(res.data.networkAddress, '192.168.10.0');
    assert.equal(res.data.broadcastAddress, '192.168.10.63');
    assert.equal(res.data.firstUsableHost, '192.168.10.1');
    assert.equal(res.data.lastUsableHost, '192.168.10.62');
    assert.equal(res.data.usableHosts, 62);
    assert.equal(res.data.scope, 'Private (RFC 1918)');
  }
});

test('IPv4 subnet calculator handles /32, /31, and invalid inputs', () => {
  const host = calculateSubnet('10.20.30.40', 32);
  assert.equal(host.ok, true);
  if (host.ok) {
    assert.equal(host.data.usableHosts, 1);
    assert.equal(host.data.firstUsableHost, '10.20.30.40');
  }

  const p2p = calculateSubnet('10.20.30.0', 31);
  assert.equal(p2p.ok, true);
  if (p2p.ok) {
    assert.equal(p2p.data.usableHosts, 2);
  }

  const badIp = calculateSubnet('999.168.1.1', 24);
  assert.equal(badIp.ok, false);

  const badCidr = calculateSubnet('10.0.0.1', 33);
  assert.equal(badCidr.ok, false);
});

test('Inventory negative stock guard blocks issuing more than available', () => {
  const denied = calculateInventoryDelta(5, 'ISSUE', 8);
  assert.equal(denied.ok, false);

  const allowed = calculateInventoryDelta(5, 'ISSUE', 3);
  assert.equal(allowed.ok, true);
  if (allowed.ok) {
    assert.equal(allowed.delta, -3);
    assert.equal(allowed.nextQuantity, 2);
  }

  const added = calculateInventoryDelta(2, 'ADD', 10);
  assert.equal(added.ok, true);
  if (added.ok) {
    assert.equal(added.nextQuantity, 12);
  }
});

test('Stock status thresholds classify out-of-stock, low, in-stock, and overstock', () => {
  assert.equal(getStockStatus({ quantity: 0, minStock: 5, maxStock: 20 }), 'OUT_OF_STOCK');
  assert.equal(getStockStatus({ quantity: 5, minStock: 5, maxStock: 20 }), 'LOW_STOCK');
  assert.equal(getStockStatus({ quantity: 12, minStock: 5, maxStock: 20 }), 'IN_STOCK');
  assert.equal(getStockStatus({ quantity: 25, minStock: 5, maxStock: 20 }), 'OVERSTOCK');
});

test('Warranty status detects expired, expiring soon, and active warranties', () => {
  const ref = new Date('2026-11-24T12:00:00Z');
  assert.equal(getWarrantyStatus('2026-11-01', 60, ref).status, 'EXPIRED');
  assert.equal(getWarrantyStatus('2026-12-20', 60, ref).status, 'EXPIRING_SOON');
  assert.equal(getWarrantyStatus('2028-06-01', 60, ref).status, 'ACTIVE');
  assert.equal(getWarrantyStatus('', 60, ref).status, 'NONE');
});

test('Maintenance recurrence and overdue calculations work accurately', () => {
  const ref = new Date('2026-11-24T12:00:00Z');
  assert.equal(isMaintenanceOverdue({ status: 'SCHEDULED', scheduledDate: '2026-11-10' }, ref), true);
  assert.equal(isMaintenanceOverdue({ status: 'COMPLETED', scheduledDate: '2026-11-10' }, ref), false);
  assert.equal(computeNextMaintenanceDate('2026-01-15', 'MONTHLY'), '2026-02-15');
  assert.equal(computeNextMaintenanceDate('2026-01-15', 'QUARTERLY'), '2026-04-15');
  assert.equal(computeNextMaintenanceDate('2026-01-15', 'ANNUAL'), '2027-01-15');
  assert.equal(computeNextMaintenanceDate('2026-01-15', 'CUSTOM', 10), '2026-01-25');
});

test('RBAC permissions enforce least privilege across roles', () => {
  assert.equal(hasPermission('ORG_ADMIN', 'settings:users'), true);
  assert.equal(hasPermission('IT_TECHNICIAN', 'settings:users'), false);
  assert.equal(hasPermission('IT_TECHNICIAN', 'network:use'), true);
  assert.equal(hasPermission('INVENTORY_MANAGER', 'inventory:adjust'), true);
  assert.equal(hasPermission('EMPLOYEE', 'assets:create'), false);
  assert.equal(canAccessKnowledgeArticle('EMPLOYEE', 'EMPLOYEE_ACCESSIBLE'), true);
  assert.equal(canAccessKnowledgeArticle('EMPLOYEE', 'IT_ONLY'), false);
  assert.equal(canAccessKnowledgeArticle('IT_TECHNICIAN', 'IT_ONLY'), true);
});

test('Zod validation rejects invalid IPv4/MAC and maxStock < minStock', () => {
  const badAsset = assetSchema.safeParse({
    assetTag: 'FX-01',
    name: 'Dell Latitude',
    category: 'Laptop',
    manufacturer: 'Dell',
    model: '5440',
    serialNumber: 'SN12345',
    processor: '',
    ram: '',
    storage: '',
    operatingSystem: '',
    osVersion: '',
    macAddress: 'not-a-mac',
    ipAddress: '192.168.1.999',
    hostname: '',
    purchaseDate: '',
    purchasePrice: 1200,
    currency: 'USD',
    vendor: '',
    warrantyStart: '',
    warrantyEnd: '',
    condition: 'GOOD',
    status: 'AVAILABLE',
    locationId: 'loc-hq',
    departmentId: 'dept-it',
    assignedEmployeeId: '',
    assignedTechnicianName: '',
    notes: '',
  });
  assert.equal(badAsset.success, false);

  const badInv = inventoryItemSchema.safeParse({
    sku: 'SKU-1',
    name: 'Cat6 Patch Cable',
    category: 'Cables',
    manufacturer: 'Ubiquiti',
    description: '',
    quantity: 10,
    minStock: 20,
    maxStock: 10,
    unit: 'pcs',
    locationId: 'loc-hq',
    unitPrice: 4.5,
    currency: 'USD',
    supplier: 'CDW',
  });
  assert.equal(badInv.success, false);
});

test('CSV export neutralizes formula injection and escapes quotes', () => {
  const csv = toCsv(['Tag', 'Notes'], [['=CMD()', 'Includes "quotes", commas']]);
  assert.ok(csv.includes("'=CMD()"));
  assert.ok(csv.includes('"Includes ""quotes"", commas"'));
});

test('Backup snapshot validation rejects malformed payloads and computes metrics', () => {
  assert.equal(validateBackupSnapshot(null).ok, false);
  assert.equal(validateBackupSnapshot({ schemaVersion: 1 }).ok, false);

  const metrics = computeDashboardMetrics({
    assets: [],
    employees: [],
    departments: [],
    inventory: [],
    maintenance: [],
    warrantyAlertDays: 60,
  });
  assert.equal(metrics.totalAssets, 0);
  assert.equal(metrics.lowStockItems, 0);
});

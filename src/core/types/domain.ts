export type UserRole =
  | 'SUPER_ADMIN'
  | 'ORG_ADMIN'
  | 'IT_MANAGER'
  | 'IT_TECHNICIAN'
  | 'INVENTORY_MANAGER'
  | 'EMPLOYEE';

export type AssetStatus =
  | 'AVAILABLE'
  | 'ASSIGNED'
  | 'IN_REPAIR'
  | 'UNDER_MAINTENANCE'
  | 'RETIRED'
  | 'LOST'
  | 'DAMAGED'
  | 'DISPOSED';

export type AssetCondition = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED';

export type AssignmentActionType = 'ASSIGN' | 'RETURN' | 'TRANSFER';
export type AssignmentStatus = 'ACTIVE' | 'RETURNED' | 'TRANSFERRED';

export type InventoryTransactionType = 'ADD' | 'ISSUE' | 'RETURN' | 'TRANSFER' | 'ADJUST';
export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'OVERSTOCK';

export type MaintenanceStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'PENDING_PARTS'
  | 'COMPLETED'
  | 'CANCELLED';

export type MaintenanceRecurrence = 'NONE' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'CUSTOM';

export type KnowledgeAccessLevel = 'IT_ONLY' | 'EMPLOYEE_ACCESSIBLE' | 'RESTRICTED';
export type KnowledgeStatus = 'DRAFT' | 'PUBLISHED';

export type LocationType =
  | 'HEADQUARTERS'
  | 'BRANCH_OFFICE'
  | 'BUILDING'
  | 'SERVER_ROOM'
  | 'WAREHOUSE'
  | 'FIELD_SITE';

export type ThemePreference = 'light' | 'dark' | 'system';

export type WorkspaceMode = 'cloud' | 'local';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerUid: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  timezone: string;
  currency: string;
  dateFormat: string;
  warrantyAlertDays: number;
  maintenanceReminderDays: number;
  assetCategories: string[];
  inventoryCategories: string[];
  maintenanceTypes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OrgUser {
  uid: string;
  orgId: string;
  displayName: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED';
  avatarInitials?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  orgId: string;
  ownerUid: string;
  name: string;
  code: string;
  headName: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  orgId: string;
  ownerUid: string;
  name: string;
  code: string;
  type: LocationType;
  address: string;
  city: string;
  country: string;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string;
  orgId: string;
  ownerUid: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  departmentId: string;
  locationId: string;
  position: string;
  managerName: string;
  status: 'ACTIVE' | 'INACTIVE';
  startDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  orgId: string;
  ownerUid: string;
  assetTag: string;
  name: string;
  category: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  processor: string;
  ram: string;
  storage: string;
  operatingSystem: string;
  osVersion: string;
  macAddress: string;
  ipAddress: string;
  hostname: string;
  purchaseDate: string;
  purchasePrice: number;
  currency: string;
  vendor: string;
  warrantyStart: string;
  warrantyEnd: string;
  condition: AssetCondition;
  status: AssetStatus;
  locationId: string;
  departmentId: string;
  assignedEmployeeId: string;
  assignedTechnicianName: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetAssignment {
  id: string;
  orgId: string;
  ownerUid: string;
  assetId: string;
  employeeId: string;
  departmentId: string;
  locationId: string;
  actionType: AssignmentActionType;
  status: AssignmentStatus;
  conditionAtHandover: AssetCondition;
  conditionAtReturn?: AssetCondition;
  accessories: string;
  missingAccessories?: string;
  assignedDate: string;
  returnDate?: string;
  notes: string;
  acknowledged: boolean;
  performedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  orgId: string;
  ownerUid: string;
  sku: string;
  name: string;
  category: string;
  manufacturer: string;
  description: string;
  quantity: number;
  minStock: number;
  maxStock: number;
  unit: string;
  locationId: string;
  unitPrice: number;
  currency: string;
  supplier: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryTransaction {
  id: string;
  orgId: string;
  ownerUid: string;
  itemId: string;
  type: InventoryTransactionType;
  quantityDelta: number;
  resultingQuantity: number;
  reference: string;
  notes: string;
  performedBy: string;
  createdAt: string;
}

export interface MaintenanceRecord {
  id: string;
  orgId: string;
  ownerUid: string;
  assetId: string;
  maintenanceType: string;
  technicianName: string;
  scheduledDate: string;
  completionDate?: string;
  recurrence: MaintenanceRecurrence;
  customIntervalDays?: number;
  status: MaintenanceStatus;
  description: string;
  issue: string;
  workPerformed: string;
  partsUsed: string;
  cost: number;
  currency: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeArticle {
  id: string;
  orgId: string;
  ownerUid: string;
  title: string;
  category: string;
  accessLevel: KnowledgeAccessLevel;
  status: KnowledgeStatus;
  summary: string;
  content: string;
  tags: string[];
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLog {
  id: string;
  orgId: string;
  ownerUid: string;
  actorUid: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  previousValue?: string;
  newValue?: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'WARRANTY' | 'MAINTENANCE' | 'INVENTORY' | 'ASSIGNMENT';
  title: string;
  message: string;
  entityPath: string;
  timestamp: string;
  read: boolean;
}

export interface WorkspaceSnapshot {
  schemaVersion: number;
  exportedAt: string;
  organization: Organization;
  users: OrgUser[];
  departments: Department[];
  locations: Location[];
  employees: Employee[];
  assets: Asset[];
  assignments: AssetAssignment[];
  inventory: InventoryItem[];
  inventoryTransactions: InventoryTransaction[];
  maintenance: MaintenanceRecord[];
  knowledgeArticles: KnowledgeArticle[];
  activityLogs: ActivityLog[];
}

export const DEFAULT_ASSET_CATEGORIES = [
  'Laptop',
  'Desktop',
  'Monitor',
  'Printer',
  'Scanner',
  'Router',
  'Switch',
  'Access Point',
  'Server',
  'UPS',
  'Projector',
  'Mobile Phone',
  'Tablet',
  'Keyboard',
  'Mouse',
  'Headset',
  'Accessories',
  'Other',
];

export const DEFAULT_INVENTORY_CATEGORIES = [
  'Cables',
  'Adapters',
  'RAM',
  'SSDs',
  'HDDs',
  'Chargers',
  'Keyboards',
  'Mice',
  'Toner',
  'Printer Cartridges',
  'Network Components',
  'Tools',
  'Other Spare Parts',
];

export const DEFAULT_MAINTENANCE_TYPES = [
  'Preventive Maintenance',
  'Corrective Maintenance',
  'Hardware Repair',
  'Software Maintenance',
  'Network Maintenance',
  'Inspection',
  'Cleaning',
  'Upgrade',
  'Other',
];

export const KNOWLEDGE_CATEGORIES = [
  'Windows',
  'Networking',
  'Hardware',
  'Software',
  'Cybersecurity',
  'Printers',
  'Email',
  'Microsoft Office',
  'Troubleshooting',
  'Procedures',
  'IT Policies',
];

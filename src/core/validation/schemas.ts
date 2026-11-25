import { z } from 'zod';

const idRegex = /^[a-zA-Z0-9_-]+$/;
const ipv4OptionalRegex = /^$|^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const macOptionalRegex = /^$|^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

export const organizationSchema = z.object({
  name: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(120),
  email: z.string().trim().email('Valid email address required').max(160).or(z.literal('')),
  phone: z.string().trim().max(40),
  website: z.string().trim().max(200),
  address: z.string().trim().max(300),
  timezone: z.string().trim().min(2).max(64),
  currency: z.string().trim().min(3).max(8),
  dateFormat: z.string().trim().min(4).max(32),
  warrantyAlertDays: z.coerce.number().int().min(1).max(365),
  maintenanceReminderDays: z.coerce.number().int().min(1).max(180),
});

export const departmentSchema = z.object({
  name: z.string().trim().min(2, 'Department name is required').max(100),
  code: z.string().trim().min(1, 'Department code is required').max(24),
  headName: z.string().trim().max(120),
  description: z.string().trim().max(400),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const locationSchema = z.object({
  name: z.string().trim().min(2, 'Location name is required').max(120),
  code: z.string().trim().min(1, 'Location code is required').max(24),
  type: z.enum(['HEADQUARTERS', 'BRANCH_OFFICE', 'BUILDING', 'SERVER_ROOM', 'WAREHOUSE', 'FIELD_SITE']),
  address: z.string().trim().max(300),
  city: z.string().trim().max(80),
  country: z.string().trim().max(80),
});

export const employeeSchema = z.object({
  employeeCode: z.string().trim().min(2, 'Employee ID is required').max(40),
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  email: z.string().trim().email('Valid work email is required').max(160),
  phone: z.string().trim().max(40),
  departmentId: z.string().trim().min(1, 'Department is required').regex(idRegex, 'Invalid department ID'),
  locationId: z.string().trim().min(1, 'Office location is required').regex(idRegex, 'Invalid location ID'),
  position: z.string().trim().min(2, 'Position is required').max(100),
  managerName: z.string().trim().max(120),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  startDate: z.string().trim().max(32),
  notes: z.string().trim().max(1000),
});

export const assetSchema = z.object({
  assetTag: z.string().trim().min(2, 'Asset tag is required').max(64),
  name: z.string().trim().min(2, 'Asset name is required').max(140),
  category: z.string().trim().min(2, 'Category is required').max(64),
  manufacturer: z.string().trim().min(1, 'Manufacturer is required').max(80),
  model: z.string().trim().min(1, 'Model is required').max(100),
  serialNumber: z.string().trim().min(2, 'Serial number is required').max(100),
  processor: z.string().trim().max(100),
  ram: z.string().trim().max(40),
  storage: z.string().trim().max(60),
  operatingSystem: z.string().trim().max(80),
  osVersion: z.string().trim().max(60),
  macAddress: z.string().trim().regex(macOptionalRegex, 'Use format AA:BB:CC:DD:EE:FF'),
  ipAddress: z.string().trim().regex(ipv4OptionalRegex, 'Enter a valid IPv4 address'),
  hostname: z.string().trim().max(100),
  purchaseDate: z.string().trim().max(32),
  purchasePrice: z.coerce.number().min(0, 'Price cannot be negative'),
  currency: z.string().trim().min(3).max(8),
  vendor: z.string().trim().max(120),
  warrantyStart: z.string().trim().max(32),
  warrantyEnd: z.string().trim().max(32),
  condition: z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED']),
  status: z.enum(['AVAILABLE', 'ASSIGNED', 'IN_REPAIR', 'UNDER_MAINTENANCE', 'RETIRED', 'LOST', 'DAMAGED', 'DISPOSED']),
  locationId: z.string().trim().min(1, 'Location is required').regex(idRegex, 'Invalid location ID'),
  departmentId: z.string().trim().min(1, 'Department is required').regex(idRegex, 'Invalid department ID'),
  assignedEmployeeId: z.string().trim().max(128),
  assignedTechnicianName: z.string().trim().max(120),
  notes: z.string().trim().max(1500),
});

export const assignAssetSchema = z.object({
  assetId: z.string().trim().min(1, 'Select an available asset'),
  employeeId: z.string().trim().min(1, 'Select an employee'),
  departmentId: z.string().trim().min(1, 'Department is required'),
  locationId: z.string().trim().min(1, 'Location is required'),
  conditionAtHandover: z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED']),
  accessories: z.string().trim().max(400),
  assignedDate: z.string().trim().min(8, 'Assignment date is required').max(32),
  notes: z.string().trim().max(1000),
  acknowledged: z.boolean(),
});

export const returnAssetSchema = z.object({
  assignmentId: z.string().trim().min(1),
  returnDate: z.string().trim().min(8, 'Return date is required').max(32),
  conditionAtReturn: z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED']),
  missingAccessories: z.string().trim().max(400),
  resultingStatus: z.enum(['AVAILABLE', 'IN_REPAIR', 'DAMAGED', 'RETIRED']),
  notes: z.string().trim().max(1000),
});

export const inventoryItemSchema = z.object({
  sku: z.string().trim().min(2, 'SKU / Item ID is required').max(64),
  name: z.string().trim().min(2, 'Item name is required').max(140),
  category: z.string().trim().min(2, 'Category is required').max(64),
  manufacturer: z.string().trim().max(80),
  description: z.string().trim().max(600),
  quantity: z.coerce.number().int().min(0, 'Quantity cannot be negative'),
  minStock: z.coerce.number().int().min(0, 'Minimum stock cannot be negative'),
  maxStock: z.coerce.number().int().min(1, 'Maximum stock must be at least 1'),
  unit: z.string().trim().min(1, 'Unit is required').max(32),
  locationId: z.string().trim().min(1, 'Location is required'),
  unitPrice: z.coerce.number().min(0, 'Unit price cannot be negative'),
  currency: z.string().trim().min(3).max(8),
  supplier: z.string().trim().max(120),
}).refine((val) => val.maxStock >= val.minStock, {
  message: 'Maximum stock must be greater than or equal to minimum stock',
  path: ['maxStock'],
});

export const stockOperationSchema = z.object({
  itemId: z.string().trim().min(1),
  type: z.enum(['ADD', 'ISSUE', 'RETURN', 'TRANSFER', 'ADJUST']),
  quantity: z.coerce.number().int().refine((n) => n !== 0, 'Quantity must be non-zero'),
  reference: z.string().trim().max(160),
  notes: z.string().trim().max(500),
});

export const maintenanceSchema = z.object({
  assetId: z.string().trim().min(1, 'Select an IT asset'),
  maintenanceType: z.string().trim().min(2, 'Maintenance type is required').max(64),
  technicianName: z.string().trim().min(2, 'Technician name is required').max(120),
  scheduledDate: z.string().trim().min(8, 'Scheduled date is required').max(32),
  completionDate: z.string().trim().max(32).optional(),
  recurrence: z.enum(['NONE', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM']),
  customIntervalDays: z.coerce.number().int().min(1).max(1095).optional(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'PENDING_PARTS', 'COMPLETED', 'CANCELLED']),
  description: z.string().trim().min(3, 'Description is required').max(800),
  issue: z.string().trim().max(800),
  workPerformed: z.string().trim().max(1500),
  partsUsed: z.string().trim().max(400),
  cost: z.coerce.number().min(0, 'Cost cannot be negative'),
  currency: z.string().trim().min(3).max(8),
  notes: z.string().trim().max(1000),
});

export const knowledgeArticleSchema = z.object({
  title: z.string().trim().min(3, 'Article title is required').max(160),
  category: z.string().trim().min(2, 'Category is required').max(64),
  accessLevel: z.enum(['IT_ONLY', 'EMPLOYEE_ACCESSIBLE', 'RESTRICTED']),
  status: z.enum(['DRAFT', 'PUBLISHED']),
  summary: z.string().trim().max(400),
  content: z.string().trim().min(10, 'Article content must be at least 10 characters').max(20000),
  tags: z.array(z.string().trim().min(1).max(32)).max(10, 'Maximum 10 tags allowed'),
});

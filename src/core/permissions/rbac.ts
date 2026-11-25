import type { UserRole } from '../types/domain';

export type Permission =
  | 'dashboard:view'
  | 'assets:view'
  | 'assets:create'
  | 'assets:edit'
  | 'assets:delete'
  | 'assignments:view'
  | 'assignments:manage'
  | 'inventory:view'
  | 'inventory:manage'
  | 'inventory:adjust'
  | 'employees:view'
  | 'employees:manage'
  | 'departments:view'
  | 'departments:manage'
  | 'locations:view'
  | 'locations:manage'
  | 'maintenance:view'
  | 'maintenance:manage'
  | 'knowledge:view_all'
  | 'knowledge:view_employee'
  | 'knowledge:manage'
  | 'network:use'
  | 'reports:view'
  | 'reports:export'
  | 'audit:view'
  | 'settings:org'
  | 'settings:users'
  | 'settings:backup';

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Administrator',
  ORG_ADMIN: 'Organization Administrator',
  IT_MANAGER: 'IT Manager',
  IT_TECHNICIAN: 'IT Technician',
  INVENTORY_MANAGER: 'Inventory Manager',
  EMPLOYEE: 'Employee',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Full platform governance across organizations, global configuration, and system settings.',
  ORG_ADMIN: 'Manage users, departments, locations, assets, inventory, maintenance, reports, and org settings.',
  IT_MANAGER: 'Oversee IT assets, equipment assignments, inventory, preventive maintenance, technicians, and reports.',
  IT_TECHNICIAN: 'Update asset records, perform maintenance, manage assignments, access KB, and run network tools.',
  INVENTORY_MANAGER: 'Manage spare parts catalog, stock transactions, reorder thresholds, suppliers, and stock reports.',
  EMPLOYEE: 'View assigned IT equipment and read employee-accessible IT documentation.',
};

const ALL_PERMISSIONS: Permission[] = [
  'dashboard:view',
  'assets:view',
  'assets:create',
  'assets:edit',
  'assets:delete',
  'assignments:view',
  'assignments:manage',
  'inventory:view',
  'inventory:manage',
  'inventory:adjust',
  'employees:view',
  'employees:manage',
  'departments:view',
  'departments:manage',
  'locations:view',
  'locations:manage',
  'maintenance:view',
  'maintenance:manage',
  'knowledge:view_all',
  'knowledge:view_employee',
  'knowledge:manage',
  'network:use',
  'reports:view',
  'reports:export',
  'audit:view',
  'settings:org',
  'settings:users',
  'settings:backup',
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ORG_ADMIN: ALL_PERMISSIONS,
  IT_MANAGER: [
    'dashboard:view',
    'assets:view',
    'assets:create',
    'assets:edit',
    'assignments:view',
    'assignments:manage',
    'inventory:view',
    'inventory:manage',
    'inventory:adjust',
    'employees:view',
    'employees:manage',
    'departments:view',
    'locations:view',
    'maintenance:view',
    'maintenance:manage',
    'knowledge:view_all',
    'knowledge:view_employee',
    'knowledge:manage',
    'network:use',
    'reports:view',
    'reports:export',
    'audit:view',
    'settings:backup',
  ],
  IT_TECHNICIAN: [
    'dashboard:view',
    'assets:view',
    'assets:create',
    'assets:edit',
    'assignments:view',
    'assignments:manage',
    'inventory:view',
    'employees:view',
    'departments:view',
    'locations:view',
    'maintenance:view',
    'maintenance:manage',
    'knowledge:view_all',
    'knowledge:view_employee',
    'knowledge:manage',
    'network:use',
    'reports:view',
    'audit:view',
  ],
  INVENTORY_MANAGER: [
    'dashboard:view',
    'assets:view',
    'inventory:view',
    'inventory:manage',
    'inventory:adjust',
    'departments:view',
    'locations:view',
    'knowledge:view_employee',
    'reports:view',
    'reports:export',
    'audit:view',
  ],
  EMPLOYEE: [
    'dashboard:view',
    'assets:view',
    'assignments:view',
    'knowledge:view_employee',
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canAccessKnowledgeArticle(role: UserRole, accessLevel: string): boolean {
  if (accessLevel === 'EMPLOYEE_ACCESSIBLE') return true;
  if (accessLevel === 'IT_ONLY') {
    return hasPermission(role, 'knowledge:view_all');
  }
  return role === 'SUPER_ADMIN' || role === 'ORG_ADMIN' || role === 'IT_MANAGER';
}

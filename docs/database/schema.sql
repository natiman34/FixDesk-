-- =============================================================================
-- FixDesk — Relational Database Schema (PostgreSQL / SQLite Compatible Blueprint)
-- Scope: IT Asset Management, IT Operations, Inventory & Preventive Maintenance
-- Explicit Exclusion: Zero ticketing / helpdesk tables.
-- =============================================================================

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_uid TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  currency TEXT NOT NULL DEFAULT 'USD',
  date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
  warranty_alert_days INTEGER NOT NULL DEFAULT 60 CHECK (warranty_alert_days BETWEEN 1 AND 365),
  maintenance_reminder_days INTEGER NOT NULL DEFAULT 14 CHECK (maintenance_reminder_days BETWEEN 1 AND 180),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  uid TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN (
    'SUPER_ADMIN', 'ORG_ADMIN', 'IT_MANAGER', 'IT_TECHNICIAN', 'INVENTORY_MANAGER', 'EMPLOYEE'
  )),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  head_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, code)
);

CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'HEADQUARTERS', 'BRANCH_OFFICE', 'BUILDING', 'SERVER_ROOM', 'WAREHOUSE', 'FIELD_SITE'
  )),
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, code)
);

CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  position TEXT NOT NULL,
  manager_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  start_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, employee_code)
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_tag TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  processor TEXT NOT NULL DEFAULT '',
  ram TEXT NOT NULL DEFAULT '',
  storage TEXT NOT NULL DEFAULT '',
  operating_system TEXT NOT NULL DEFAULT '',
  os_version TEXT NOT NULL DEFAULT '',
  mac_address TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  hostname TEXT NOT NULL DEFAULT '',
  purchase_date TEXT NOT NULL DEFAULT '',
  purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  vendor TEXT NOT NULL DEFAULT '',
  warranty_start TEXT NOT NULL DEFAULT '',
  warranty_end TEXT NOT NULL DEFAULT '',
  condition TEXT NOT NULL CHECK (condition IN ('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED')),
  status TEXT NOT NULL CHECK (status IN (
    'AVAILABLE', 'ASSIGNED', 'IN_REPAIR', 'UNDER_MAINTENANCE', 'RETIRED', 'LOST', 'DAMAGED', 'DISPOSED'
  )),
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  assigned_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  assigned_technician_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, asset_tag),
  UNIQUE (org_id, serial_number)
);

CREATE TABLE asset_assignments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  action_type TEXT NOT NULL CHECK (action_type IN ('ASSIGN', 'RETURN', 'TRANSFER')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'RETURNED', 'TRANSFERRED')),
  condition_at_handover TEXT NOT NULL,
  condition_at_return TEXT,
  accessories TEXT NOT NULL DEFAULT '',
  missing_accessories TEXT NOT NULL DEFAULT '',
  assigned_date TEXT NOT NULL,
  return_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  acknowledged INTEGER NOT NULL DEFAULT 0,
  performed_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  manufacturer TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  max_stock INTEGER NOT NULL DEFAULT 100 CHECK (max_stock >= min_stock),
  unit TEXT NOT NULL DEFAULT 'pcs',
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  supplier TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, sku)
);

CREATE TABLE inventory_transactions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('ADD', 'ISSUE', 'RETURN', 'TRANSFER', 'ADJUST')),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  resulting_quantity INTEGER NOT NULL CHECK (resulting_quantity >= 0),
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  performed_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE maintenance_records (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL,
  technician_name TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  completion_date TEXT,
  recurrence TEXT NOT NULL DEFAULT 'NONE' CHECK (recurrence IN ('NONE', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM')),
  custom_interval_days INTEGER,
  status TEXT NOT NULL CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'PENDING_PARTS', 'COMPLETED', 'CANCELLED')),
  description TEXT NOT NULL,
  issue TEXT NOT NULL DEFAULT '',
  work_performed TEXT NOT NULL DEFAULT '',
  parts_used TEXT NOT NULL DEFAULT '',
  cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE knowledge_articles (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  access_level TEXT NOT NULL CHECK (access_level IN ('IT_ONLY', 'EMPLOYEE_ACCESSIBLE', 'RESTRICTED')),
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED')),
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  author_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Append-only immutable audit log
CREATE TABLE activity_logs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_uid TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL
);

-- Operational indexes
CREATE INDEX idx_assets_org_status ON assets (org_id, status);
CREATE INDEX idx_assets_org_dept ON assets (org_id, department_id);
CREATE INDEX idx_assets_org_warranty ON assets (org_id, warranty_end);
CREATE INDEX idx_assignments_asset ON asset_assignments (asset_id, status);
CREATE INDEX idx_assignments_employee ON asset_assignments (employee_id, status);
CREATE INDEX idx_inventory_org_stock ON inventory_items (org_id, quantity, min_stock);
CREATE INDEX idx_inv_tx_item ON inventory_transactions (item_id, created_at);
CREATE INDEX idx_maintenance_org_sched ON maintenance_records (org_id, status, scheduled_date);
CREATE INDEX idx_kb_org_cat ON knowledge_articles (org_id, category, status);
CREATE INDEX idx_audit_org_time ON activity_logs (org_id, created_at);

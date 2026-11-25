# FixDesk — System Architecture & Implementation Guide

## 1. Platform Scope & Architectural Boundaries
**FixDesk** is an IT Asset Management, IT Operations, and Preventive Maintenance platform built for NGOs, schools, SMBs, internal IT departments, and IT technicians.

- **Core Operational Modules (13)**: Dashboard, Assets, Asset Assignments, Inventory & Spare Parts, Employees, Departments, Locations, Maintenance & Repair, Internal IT Knowledge Base, Network Tools & Diagnostics, Reports & Analytics, Activity & Audit Log, and Settings.
- **Explicit Exclusion**: FixDesk intentionally contains **no ticketing or helpdesk subsystem**—no ticket creation, queues, statuses, comments, or related tables.

---

## 2. Shared Modular Architecture (Web + Windows Desktop)

FixDesk decouples pure business logic, validation, RBAC, and persistence behind clean TypeScript contracts so the same frontend and domain core can run on the Web and inside a native Windows Desktop wrapper (Tauri 2):

```
src/
├── core/
│   ├── types/domain.ts           # Canonical data entities & enums
│   ├── permissions/rbac.ts       # 6-role RBAC permission matrix
│   ├── validation/schemas.ts     # Zod schemas shared across forms & repositories
│   ├── logic/
│   │   ├── operations.ts         # KPIs, stock guard, warranty, maintenance recurrence, CSV export
│   │   ├── operations.test.ts    # node:test deterministic unit tests
│   │   └── subnet.ts             # Pure IPv4 CIDR subnet calculator
│   ├── seed/demoData.ts          # Deterministic seed workspace (Meridian Relief Foundation)
│   └── repository/
│       ├── types.ts              # IDataRepository persistence interface
│       ├── firestoreRepository.ts# Multi-tenant Cloud Firestore adapter
│       └── localRepository.ts    # Offline-first browser storage adapter
├── context/WorkspaceContext.tsx  # Unified state, auth, audit logging & operational actions
├── components/
│   ├── layout/AppShell.tsx       # Collapsible 13-route sidebar, search, notifications, theme
│   └── ui/Primitives.tsx         # Accessible modal, confirm dialog, form & table primitives
└── pages/                        # All 13 operational modules + LoginPage
```

---

## 3. Storage & Persistence Strategy

### Active in Current Build
1. **Cloud Workspace (`FirestoreRepository`)**:
   - Uses Firebase Authentication (Google Sign-In) and Cloud Firestore.
   - Multi-tenant isolation enforced via `ownerUid` document fields and deployed `firestore.rules` (all reads, list queries, writes, and immutable `activityLogs` verified with `@firebase/eslint-plugin-security-rules`).
2. **Local Offline Workspace (`LocalOfflineRepository`)**:
   - Works fully offline with zero cloud credentials required, backed by browser `localStorage` and deterministic seed data.
   - Supports validated full-workspace JSON export and restore with explicit overwrite confirmation.

### Windows Desktop & Sync Architecture (Planned Phase 11)
- **Tauri 2 Desktop Shell**: Reuses the identical React/TypeScript UI bundle with a native `SqliteRepository` implementing `IDataRepository` via `tauri-plugin-sql` against the relational DDL in `docs/database/schema.sql`.
- **Native OS Network Utilities**: Because web browsers block raw ICMP sockets and local NIC inspection, live ICMP Ping, Traceroute, DNS lookup, Port Check, and Local NIC enumeration will run through signed Tauri Rust commands on Windows Desktop. The Web edition strictly avoids faking these outputs and provides real IPv4 CIDR calculations, diagnostic checklists, and copyable Windows CLI runbooks.
- **Bidirectional Cloud Sync**: Planned for Phase 11 using a local `sync_queue` table, `updated_at` timestamps, UUID primary keys, and explicit conflict resolution UI (not yet active in Phase 1).

---

## 4. Security & Access Control
- **6-Role RBAC**: `SUPER_ADMIN`, `ORG_ADMIN`, `IT_MANAGER`, `IT_TECHNICIAN`, `INVENTORY_MANAGER`, and `EMPLOYEE`.
- **Input Validation**: All forms validate with strict Zod schemas before persistence.
- **Negative Stock Protection**: Inventory issue/transfer/adjust operations pass through `calculateInventoryDelta()`, blocking negative stock quantities by default.
- **Spreadsheet Formula Injection Protection**: CSV exports escape leading `=`, `+`, `-`, `@`, `\t`, and `\r` characters.
- **Immutable Audit Trail**: Every operational mutation appends an immutable record to `activityLogs` (update and delete rules are denied at the database security rule level).

---

## 5. Multi-Phase Delivery Roadmap
- **Phase 1 (Delivered)**: Core architecture, dual Cloud Firestore + Local Offline persistence, deployed security rules, relational DDL blueprint (`docs/database/schema.sql`), RBAC engine, and full end-to-end operational workflows across all 13 modules with unit tests.
- **Phase 2–10 (Iterative Hardening)**: Bulk CSV import wizard for legacy spreadsheets, multi-org workspace switching, attachment storage for purchase invoices/photos, custom print templates, and automated email/webhook reminders.
- **Phase 11 (Windows Desktop & Sync)**: Tauri 2 installer packaging, local SQLite adapter (`SqliteRepository`), native Rust network utilities (ICMP/ARP/DNS/Port), and bidirectional offline-to-cloud sync engine.
- **Phase 12 (Enterprise Polish)**: SSO/SAML, scheduled cloud backups, and compliance export packs.

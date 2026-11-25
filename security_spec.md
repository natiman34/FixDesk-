# FixDesk Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Multi-Tenant Organization Isolation**: Every subcollection record under `/organizations/{orgId}/...` belongs strictly to `{orgId}` (`data.orgId == orgId`) and is accessible ONLY to verified active members of `/organizations/{orgId}/members/{request.auth.uid}` (or the bootstrapped super admin).
2. **RBAC Privilege Integrity**: Users cannot self-assign or escalate their own role in `/organizations/{orgId}/members/{uid}`. Only `SUPER_ADMIN` or `ORG_ADMIN` can mutate member roles (except initial org creation where `ownerUid == request.auth.uid`).
3. **Immutable Audit & Stock Ledgers**: `/organizations/{orgId}/activityLogs/{logId}` and `/organizations/{orgId}/inventoryTransactions/{txId}` are strictly append-only; updates and deletes are permanently denied.
4. **PII Isolation**: `/users/{userId}` is strictly restricted to `request.auth.uid == userId` or verified super admin. No blanket reads across users.
5. **No Negative Stock / Schema & Size Enforcement**: Every string field enforces strict `.size()` bounds, arrays enforce `.size() <= 10`, document IDs enforce `^[a-zA-Z0-9_\-]+$`, and all creates/updates pass `isValid[Entity]()` validation helpers with `hasAll`/`hasOnly` and `affectedKeys().hasOnly()`.
6. **Temporal & Ownership Immutability**: `orgId`, `id`, `ownerUid`, and `createdAt` cannot be modified after creation.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Cross-Tenant Asset Read**: Member of `org-a` reads `/organizations/org-b/assets/asset-1`.
2. **Unverified Email Write**: Authenticated user with `email_verified: false` creates an asset.
3. **Role Self-Escalation**: `IT_TECHNICIAN` updates own `/organizations/org-a/members/{uid}` to set `role: "ORG_ADMIN"`.
4. **Shadow Field Injection**: `ORG_ADMIN` creates an asset with an unlisted ghost field `isSystemVerified: true`.
5. **Audit Log Tampering**: `ORG_ADMIN` attempts `update` or `delete` on `/organizations/org-a/activityLogs/log-1`.
6. **Inventory Transaction Deletion**: `INVENTORY_MANAGER` attempts to delete `/organizations/org-a/inventoryTransactions/tx-1`.
7. **Negative Stock Creation**: `INVENTORY_MANAGER` creates an inventory item with `quantity: -5`.
8. **ID Poisoning**: Attacker writes document with 200-character invalid ID containing spaces/symbols.
9. **Employee Unauthorized Write**: User with `EMPLOYEE` role attempts to create or update an asset or department.
10. **PII Cross-User Scrape**: Authenticated user `uid-1` attempts to read `/users/uid-2`.
11. **Terminal Maintenance Tampering**: `IT_TECHNICIAN` attempts to overwrite a `COMPLETED` maintenance record back to `SCHEDULED`.
12. **Unbounded Tag Array Overflow**: Author submits Knowledge Article with 25 tags (> max 10) or oversized content (> 20,000 chars).

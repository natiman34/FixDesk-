import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth, googleAuthProvider, testFirestoreConnection } from '../lib/firebase';
import { LocalOfflineRepository } from '../core/repository/localRepository';
import { FirestoreRepository } from '../core/repository/firestoreRepository';
import type { IDataRepository } from '../core/repository/types';
import {
  buildOperationalNotifications,
  calculateInventoryDelta,
  computeNextMaintenanceDate,
} from '../core/logic/operations';
import { hasPermission, type Permission } from '../core/permissions/rbac';
import { generateId, todayIsoDate } from '../lib/utils';
import type {
  ActivityLog,
  AppNotification,
  Asset,
  AssetAssignment,
  AssetCondition,
  AssetStatus,
  Department,
  Employee,
  InventoryItem,
  InventoryTransaction,
  InventoryTransactionType,
  KnowledgeArticle,
  Location,
  MaintenanceRecord,
  Organization,
  OrgUser,
  ThemePreference,
  UserRole,
  WorkspaceMode,
  WorkspaceSnapshot,
} from '../core/types/domain';

const THEME_KEY = 'fixdesk.theme.v1';
const LOCAL_SESSION_KEY = 'fixdesk.local.session.v1';
const READ_NOTIF_KEY = 'fixdesk.read.notifications.v1';

export interface ActiveSession {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  mode: WorkspaceMode;
}

interface WorkspaceContextValue {
  session: ActiveSession | null;
  authReady: boolean;
  loading: boolean;
  error: string | null;
  workspace: WorkspaceSnapshot | null;
  notifications: AppNotification[];
  unreadCount: number;
  theme: ThemePreference;
  setTheme: (pref: ThemePreference) => void;
  signInWithGoogle: () => Promise<void>;
  enterLocalOfflineMode: () => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
  setActiveRolePreview: (role: UserRole) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearError: () => void;

  // Domain operations
  saveOrganization: (org: Organization) => Promise<void>;
  saveUser: (user: OrgUser) => Promise<void>;
  saveDepartment: (dept: Omit<Department, 'id' | 'orgId' | 'ownerUid' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteDepartment: (id: string) => Promise<void>;
  saveLocation: (loc: Omit<Location, 'id' | 'orgId' | 'ownerUid' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
  saveEmployee: (emp: Omit<Employee, 'id' | 'orgId' | 'ownerUid' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  saveAsset: (asset: Omit<Asset, 'id' | 'orgId' | 'ownerUid' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<Asset>;
  deleteAsset: (id: string) => Promise<void>;
  assignAsset: (params: {
    assetId: string;
    employeeId: string;
    departmentId: string;
    locationId: string;
    conditionAtHandover: AssetCondition;
    accessories: string;
    assignedDate: string;
    notes: string;
    acknowledged: boolean;
  }) => Promise<AssetAssignment>;
  returnAsset: (params: {
    assignmentId: string;
    returnDate: string;
    conditionAtReturn: AssetCondition;
    missingAccessories: string;
    resultingStatus: AssetStatus;
    notes: string;
  }) => Promise<void>;
  transferAsset: (params: {
    assetId: string;
    toEmployeeId: string;
    toDepartmentId: string;
    toLocationId: string;
    notes: string;
  }) => Promise<void>;
  saveInventoryItem: (item: Omit<InventoryItem, 'id' | 'orgId' | 'ownerUid' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  performStockOperation: (params: {
    itemId: string;
    type: InventoryTransactionType;
    quantity: number;
    reference: string;
    notes: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  saveMaintenance: (record: Omit<MaintenanceRecord, 'id' | 'orgId' | 'ownerUid' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteMaintenance: (id: string) => Promise<void>;
  saveKnowledgeArticle: (article: Omit<KnowledgeArticle, 'id' | 'orgId' | 'ownerUid' | 'authorName' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteKnowledgeArticle: (id: string) => Promise<void>;
  restoreBackup: (snapshot: WorkspaceSnapshot) => Promise<void>;
  resetLocalDemoData: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    try {
      const saved = window.localStorage.getItem(THEME_KEY) as ThemePreference | null;
      return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
    } catch {
      return 'system';
    }
  });
  const [readNotifIds, setReadNotifIds] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem(READ_NOTIF_KEY);
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<string>();
    }
  });

  const repoRef = useRef<IDataRepository | null>(null);

  // Apply theme to <html>
  useEffect(() => {
    const root = document.documentElement;
    const apply = (pref: ThemePreference) => {
      const isDark =
        pref === 'dark' ||
        (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('dark', isDark);
      // Update meta theme-color for mobile browsers
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', isDark ? '#020617' : '#f8fafc');
      }
    };
    apply(theme);
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore storage failure
    }
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => apply('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  const setTheme = useCallback((pref: ThemePreference) => {
    setThemeState(pref);
  }, []);

  const loadFromRepo = useCallback(async (repo: IDataRepository, activeSession: ActiveSession) => {
    setLoading(true);
    setError(null);
    try {
      repoRef.current = repo;
      const data = await repo.loadWorkspace();
      setWorkspace(data);
      const matchedUser = data.users.find((u) => u.uid === activeSession.uid);
      setSession({
        ...activeSession,
        role: matchedUser?.role ?? activeSession.role,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load workspace data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const enterLocalOfflineMode = useCallback(async () => {
    const repo = new LocalOfflineRepository();
    const localSession: ActiveSession = {
      uid: 'local-admin-01',
      displayName: 'Nati Mengistu',
      email: 'admin@meridianrelief.org',
      role: 'ORG_ADMIN',
      mode: 'local',
    };
    try {
      window.localStorage.setItem(LOCAL_SESSION_KEY, '1');
    } catch {
      // ignore
    }
    await loadFromRepo(repo, localSession);
  }, [loadFromRepo]);

  // Boot: test Firestore connection & watch auth state / autostart
  useEffect(() => {
    void testFirestoreConnection();

    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart') === '1';
    const hasSavedLocal = window.localStorage.getItem(LOCAL_SESSION_KEY) === '1';

    const unsub = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      if (fbUser && fbUser.email) {
        const repo = new FirestoreRepository({
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName || fbUser.email.split('@')[0],
        });
        await loadFromRepo(repo, {
          uid: fbUser.uid,
          displayName: fbUser.displayName || fbUser.email.split('@')[0],
          email: fbUser.email,
          role: 'ORG_ADMIN',
          mode: 'cloud',
        });
        setAuthReady(true);
        return;
      }

      if (autostart || hasSavedLocal) {
        await enterLocalOfflineMode();
      }
      setAuthReady(true);
    });

    return () => unsub();
  }, [enterLocalOfflineMode, loadFromRepo]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      window.localStorage.removeItem(LOCAL_SESSION_KEY);
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setError(msg);
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      window.localStorage.removeItem(LOCAL_SESSION_KEY);
    } catch {
      // ignore
    }
    if (session?.mode === 'cloud') {
      await signOut(auth);
    }
    repoRef.current = null;
    setSession(null);
    setWorkspace(null);
  }, [session?.mode]);

  const can = useCallback(
    (permission: Permission) => {
      if (!session) return false;
      return hasPermission(session.role, permission);
    },
    [session]
  );

  const setActiveRolePreview = useCallback((role: UserRole) => {
    setSession((prev) => (prev ? { ...prev, role } : null));
  }, []);

  const recordLog = useCallback(
    async (entry: {
      action: string;
      entityType: string;
      entityId: string;
      summary: string;
      previousValue?: string;
      newValue?: string;
    }) => {
      if (!repoRef.current || !workspace || !session) return;
      const log: ActivityLog = {
        id: generateId('log'),
        orgId: workspace.organization.id,
        ownerUid: workspace.organization.ownerUid,
        actorUid: session.uid,
        actorName: session.displayName,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        summary: entry.summary,
        previousValue: entry.previousValue,
        newValue: entry.newValue,
        createdAt: new Date().toISOString(),
      };
      await repoRef.current.appendActivityLog(log);
      setWorkspace((prev) => (prev ? { ...prev, activityLogs: [log, ...prev.activityLogs] } : prev));
    },
    [session, workspace]
  );

  const saveOrganization = useCallback(
    async (org: Organization) => {
      if (!repoRef.current) return;
      const updated = { ...org, updatedAt: new Date().toISOString() };
      await repoRef.current.saveOrganization(updated);
      setWorkspace((prev) => (prev ? { ...prev, organization: updated } : prev));
      await recordLog({
        action: 'ORGANIZATION_UPDATED',
        entityType: 'Organization',
        entityId: updated.id,
        summary: `Updated organization configuration for ${updated.name}`,
      });
    },
    [recordLog]
  );

  const saveUser = useCallback(
    async (user: OrgUser) => {
      if (!repoRef.current || !workspace) return;
      const now = new Date().toISOString();
      const next: OrgUser = { ...user, orgId: workspace.organization.id, updatedAt: now };
      await repoRef.current.saveUser(next);
      setWorkspace((prev) => {
        if (!prev) return prev;
        const exists = prev.users.some((u) => u.uid === next.uid);
        return {
          ...prev,
          users: exists ? prev.users.map((u) => (u.uid === next.uid ? next : u)) : [next, ...prev.users],
        };
      });
      await recordLog({
        action: 'USER_ROLE_UPDATED',
        entityType: 'User',
        entityId: next.uid,
        summary: `Updated account ${next.displayName} (${next.role}, ${next.status})`,
      });
    },
    [recordLog, workspace]
  );

  const saveDepartment = useCallback(
    async (input: Omit<Department, 'id' | 'orgId' | 'ownerUid' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      if (!repoRef.current || !workspace) return;
      const now = new Date().toISOString();
      const existing = input.id ? workspace.departments.find((d) => d.id === input.id) : undefined;
      const dept: Department = {
        ...input,
        id: existing?.id ?? generateId('dept'),
        orgId: workspace.organization.id,
        ownerUid: workspace.organization.ownerUid,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await repoRef.current.saveDepartment(dept);
      setWorkspace((prev) => {
        if (!prev) return prev;
        const list = existing
          ? prev.departments.map((d) => (d.id === dept.id ? dept : d))
          : [dept, ...prev.departments];
        return { ...prev, departments: list };
      });
      await recordLog({
        action: existing ? 'DEPARTMENT_UPDATED' : 'DEPARTMENT_CREATED',
        entityType: 'Department',
        entityId: dept.id,
        summary: `${existing ? 'Updated' : 'Created'} department ${dept.name} (${dept.code})`,
      });
    },
    [recordLog, workspace]
  );

  const deleteDepartment = useCallback(
    async (id: string) => {
      if (!repoRef.current || !workspace) return;
      const existing = workspace.departments.find((d) => d.id === id);
      await repoRef.current.deleteDepartment(id);
      setWorkspace((prev) => (prev ? { ...prev, departments: prev.departments.filter((d) => d.id !== id) } : prev));
      await recordLog({
        action: 'DEPARTMENT_DELETED',
        entityType: 'Department',
        entityId: id,
        summary: `Removed department ${existing?.name ?? id}`,
      });
    },
    [recordLog, workspace]
  );

  const saveLocation = useCallback(
    async (input: Omit<Location, 'id' | 'orgId' | 'ownerUid' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      if (!repoRef.current || !workspace) return;
      const now = new Date().toISOString();
      const existing = input.id ? workspace.locations.find((l) => l.id === input.id) : undefined;
      const loc: Location = {
        ...input,
        id: existing?.id ?? generateId('loc'),
        orgId: workspace.organization.id,
        ownerUid: workspace.organization.ownerUid,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await repoRef.current.saveLocation(loc);
      setWorkspace((prev) => {
        if (!prev) return prev;
        const list = existing ? prev.locations.map((l) => (l.id === loc.id ? loc : l)) : [loc, ...prev.locations];
        return { ...prev, locations: list };
      });
      await recordLog({
        action: existing ? 'LOCATION_UPDATED' : 'LOCATION_CREATED',
        entityType: 'Location',
        entityId: loc.id,
        summary: `${existing ? 'Updated' : 'Added'} location ${loc.name} (${loc.code})`,
      });
    },
    [recordLog, workspace]
  );

  const deleteLocation = useCallback(
    async (id: string) => {
      if (!repoRef.current || !workspace) return;
      const existing = workspace.locations.find((l) => l.id === id);
      await repoRef.current.deleteLocation(id);
      setWorkspace((prev) => (prev ? { ...prev, locations: prev.locations.filter((l) => l.id !== id) } : prev));
      await recordLog({
        action: 'LOCATION_DELETED',
        entityType: 'Location',
        entityId: id,
        summary: `Removed location ${existing?.name ?? id}`,
      });
    },
    [recordLog, workspace]
  );

  const saveEmployee = useCallback(
    async (input: Omit<Employee, 'id' | 'orgId' | 'ownerUid' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      if (!repoRef.current || !workspace) return;
      const now = new Date().toISOString();
      const existing = input.id ? workspace.employees.find((e) => e.id === input.id) : undefined;
      const emp: Employee = {
        ...input,
        id: existing?.id ?? generateId('emp'),
        orgId: workspace.organization.id,
        ownerUid: workspace.organization.ownerUid,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await repoRef.current.saveEmployee(emp);
      setWorkspace((prev) => {
        if (!prev) return prev;
        const list = existing ? prev.employees.map((e) => (e.id === emp.id ? emp : e)) : [emp, ...prev.employees];
        return { ...prev, employees: list };
      });
      await recordLog({
        action: existing ? 'EMPLOYEE_UPDATED' : 'EMPLOYEE_CREATED',
        entityType: 'Employee',
        entityId: emp.id,
        summary: `${existing ? 'Updated' : 'Added'} employee ${emp.fullName} (${emp.employeeCode})`,
        previousValue: existing ? existing.status : undefined,
        newValue: emp.status,
      });
    },
    [recordLog, workspace]
  );

  const saveAsset = useCallback(
    async (input: Omit<Asset, 'id' | 'orgId' | 'ownerUid' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      if (!repoRef.current || !workspace) {
        throw new Error('Workspace is not initialized');
      }
      const now = new Date().toISOString();
      const existing = input.id ? workspace.assets.find((a) => a.id === input.id) : undefined;
      const asset: Asset = {
        ...input,
        id: existing?.id ?? generateId('ast'),
        orgId: workspace.organization.id,
        ownerUid: workspace.organization.ownerUid,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await repoRef.current.saveAsset(asset);
      setWorkspace((prev) => {
        if (!prev) return prev;
        const list = existing ? prev.assets.map((a) => (a.id === asset.id ? asset : a)) : [asset, ...prev.assets];
        return { ...prev, assets: list };
      });
      await recordLog({
        action: existing ? 'ASSET_UPDATED' : 'ASSET_REGISTERED',
        entityType: 'Asset',
        entityId: asset.id,
        summary: `${existing ? 'Updated' : 'Registered'} asset ${asset.assetTag} — ${asset.name}`,
        previousValue: existing ? existing.status : undefined,
        newValue: asset.status,
      });
      return asset;
    },
    [recordLog, workspace]
  );

  const deleteAsset = useCallback(
    async (id: string) => {
      if (!repoRef.current || !workspace) return;
      const existing = workspace.assets.find((a) => a.id === id);
      await repoRef.current.deleteAsset(id);
      setWorkspace((prev) => (prev ? { ...prev, assets: prev.assets.filter((a) => a.id !== id) } : prev));
      await recordLog({
        action: 'ASSET_DELETED',
        entityType: 'Asset',
        entityId: id,
        summary: `Deleted asset record ${existing?.assetTag ?? id}`,
      });
    },
    [recordLog, workspace]
  );

  const assignAsset = useCallback(
    async (params: {
      assetId: string;
      employeeId: string;
      departmentId: string;
      locationId: string;
      conditionAtHandover: AssetCondition;
      accessories: string;
      assignedDate: string;
      notes: string;
      acknowledged: boolean;
    }) => {
      if (!repoRef.current || !workspace || !session) throw new Error('Workspace not ready');
      const asset = workspace.assets.find((a) => a.id === params.assetId);
      const emp = workspace.employees.find((e) => e.id === params.employeeId);
      if (!asset || !emp) throw new Error('Selected asset or employee not found');

      const now = new Date().toISOString();
      const assignment: AssetAssignment = {
        id: generateId('asg'),
        orgId: workspace.organization.id,
        ownerUid: workspace.organization.ownerUid,
        assetId: asset.id,
        employeeId: emp.id,
        departmentId: params.departmentId,
        locationId: params.locationId,
        actionType: 'ASSIGN',
        status: 'ACTIVE',
        conditionAtHandover: params.conditionAtHandover,
        accessories: params.accessories,
        assignedDate: params.assignedDate,
        notes: params.notes,
        acknowledged: params.acknowledged,
        performedBy: session.displayName,
        createdAt: now,
        updatedAt: now,
      };

      const updatedAsset: Asset = {
        ...asset,
        status: 'ASSIGNED',
        condition: params.conditionAtHandover,
        assignedEmployeeId: emp.id,
        departmentId: params.departmentId,
        locationId: params.locationId,
        updatedAt: now,
      };

      await Promise.all([
        repoRef.current.saveAssignment(assignment),
        repoRef.current.saveAsset(updatedAsset),
      ]);

      setWorkspace((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          assets: prev.assets.map((a) => (a.id === updatedAsset.id ? updatedAsset : a)),
          assignments: [assignment, ...prev.assignments],
        };
      });

      await recordLog({
        action: 'ASSET_ASSIGNED',
        entityType: 'Asset',
        entityId: asset.id,
        summary: `Assigned ${asset.assetTag} (${asset.name}) to ${emp.fullName}`,
        previousValue: asset.status,
        newValue: `ASSIGNED (${emp.fullName})`,
      });
      return assignment;
    },
    [recordLog, session, workspace]
  );

  const returnAsset = useCallback(
    async (params: {
      assignmentId: string;
      returnDate: string;
      conditionAtReturn: AssetCondition;
      missingAccessories: string;
      resultingStatus: AssetStatus;
      notes: string;
    }) => {
      if (!repoRef.current || !workspace) return;
      const existing = workspace.assignments.find((a) => a.id === params.assignmentId);
      if (!existing) return;
      const asset = workspace.assets.find((a) => a.id === existing.assetId);
      const emp = workspace.employees.find((e) => e.id === existing.employeeId);
      if (!asset) return;

      const now = new Date().toISOString();
      const updatedAssignment: AssetAssignment = {
        ...existing,
        status: 'RETURNED',
        returnDate: params.returnDate,
        conditionAtReturn: params.conditionAtReturn,
        missingAccessories: params.missingAccessories,
        notes: params.notes || existing.notes,
        updatedAt: now,
      };

      const updatedAsset: Asset = {
        ...asset,
        status: params.resultingStatus,
        condition: params.conditionAtReturn,
        assignedEmployeeId: '',
        updatedAt: now,
      };

      await Promise.all([
        repoRef.current.saveAssignment(updatedAssignment),
        repoRef.current.saveAsset(updatedAsset),
      ]);

      setWorkspace((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          assets: prev.assets.map((a) => (a.id === updatedAsset.id ? updatedAsset : a)),
          assignments: prev.assignments.map((x) => (x.id === updatedAssignment.id ? updatedAssignment : x)),
        };
      });

      await recordLog({
        action: 'ASSET_RETURNED',
        entityType: 'Asset',
        entityId: asset.id,
        summary: `Returned ${asset.assetTag} from ${emp?.fullName ?? 'employee'} -> ${params.resultingStatus}`,
        previousValue: 'ASSIGNED',
        newValue: params.resultingStatus,
      });
    },
    [recordLog, workspace]
  );

  const transferAsset = useCallback(
    async (params: {
      assetId: string;
      toEmployeeId: string;
      toDepartmentId: string;
      toLocationId: string;
      notes: string;
    }) => {
      if (!repoRef.current || !workspace || !session) return;
      const asset = workspace.assets.find((a) => a.id === params.assetId);
      const targetEmp = workspace.employees.find((e) => e.id === params.toEmployeeId);
      if (!asset || !targetEmp) return;

      const now = new Date().toISOString();
      const activePrev = workspace.assignments.find((x) => x.assetId === asset.id && x.status === 'ACTIVE');
      const updates: Promise<void>[] = [];

      let nextAssignments = [...workspace.assignments];
      if (activePrev) {
        const closedPrev: AssetAssignment = {
          ...activePrev,
          status: 'TRANSFERRED',
          returnDate: todayIsoDate(),
          updatedAt: now,
        };
        updates.push(repoRef.current.saveAssignment(closedPrev));
        nextAssignments = nextAssignments.map((x) => (x.id === closedPrev.id ? closedPrev : x));
      }

      const transferRecord: AssetAssignment = {
        id: generateId('asg'),
        orgId: workspace.organization.id,
        ownerUid: workspace.organization.ownerUid,
        assetId: asset.id,
        employeeId: targetEmp.id,
        departmentId: params.toDepartmentId,
        locationId: params.toLocationId,
        actionType: 'TRANSFER',
        status: 'ACTIVE',
        conditionAtHandover: asset.condition,
        accessories: activePrev?.accessories ?? '',
        assignedDate: todayIsoDate(),
        notes: params.notes || 'Equipment transferred to new custodian.',
        acknowledged: false,
        performedBy: session.displayName,
        createdAt: now,
        updatedAt: now,
      };
      updates.push(repoRef.current.saveAssignment(transferRecord));

      const updatedAsset: Asset = {
        ...asset,
        status: 'ASSIGNED',
        assignedEmployeeId: targetEmp.id,
        departmentId: params.toDepartmentId,
        locationId: params.toLocationId,
        updatedAt: now,
      };
      updates.push(repoRef.current.saveAsset(updatedAsset));

      await Promise.all(updates);

      setWorkspace((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          assets: prev.assets.map((a) => (a.id === updatedAsset.id ? updatedAsset : a)),
          assignments: [transferRecord, ...nextAssignments],
        };
      });

      await recordLog({
        action: 'ASSET_TRANSFERRED',
        entityType: 'Asset',
        entityId: asset.id,
        summary: `Transferred ${asset.assetTag} to ${targetEmp.fullName}`,
        previousValue: asset.assignedEmployeeId || 'Unassigned',
        newValue: targetEmp.fullName,
      });
    },
    [recordLog, session, workspace]
  );

  const saveInventoryItem = useCallback(
    async (input: Omit<InventoryItem, 'id' | 'orgId' | 'ownerUid' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      if (!repoRef.current || !workspace) return;
      const now = new Date().toISOString();
      const existing = input.id ? workspace.inventory.find((i) => i.id === input.id) : undefined;
      const item: InventoryItem = {
        ...input,
        id: existing?.id ?? generateId('inv'),
        orgId: workspace.organization.id,
        ownerUid: workspace.organization.ownerUid,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await repoRef.current.saveInventoryItem(item);
      setWorkspace((prev) => {
        if (!prev) return prev;
        const list = existing ? prev.inventory.map((i) => (i.id === item.id ? item : i)) : [item, ...prev.inventory];
        return { ...prev, inventory: list };
      });
      await recordLog({
        action: existing ? 'INVENTORY_UPDATED' : 'INVENTORY_CREATED',
        entityType: 'InventoryItem',
        entityId: item.id,
        summary: `${existing ? 'Updated' : 'Added'} inventory item ${item.sku} — ${item.name} (${item.quantity} ${item.unit})`,
      });
    },
    [recordLog, workspace]
  );

  const deleteInventoryItem = useCallback(
    async (id: string) => {
      if (!repoRef.current || !workspace) return;
      const existing = workspace.inventory.find((i) => i.id === id);
      await repoRef.current.deleteInventoryItem(id);
      setWorkspace((prev) => (prev ? { ...prev, inventory: prev.inventory.filter((i) => i.id !== id) } : prev));
      await recordLog({
        action: 'INVENTORY_DELETED',
        entityType: 'InventoryItem',
        entityId: id,
        summary: `Deleted inventory SKU ${existing?.sku ?? id}`,
      });
    },
    [recordLog, workspace]
  );

  const performStockOperation = useCallback(
    async (params: {
      itemId: string;
      type: InventoryTransactionType;
      quantity: number;
      reference: string;
      notes: string;
    }): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!repoRef.current || !workspace || !session) return { ok: false, error: 'Workspace unavailable' };
      const item = workspace.inventory.find((i) => i.id === params.itemId);
      if (!item) return { ok: false, error: 'Inventory item not found' };

      const calc = calculateInventoryDelta(item.quantity, params.type, params.quantity, false);
      if (!calc.ok) return calc;

      const now = new Date().toISOString();
      const updatedItem: InventoryItem = {
        ...item,
        quantity: calc.nextQuantity,
        updatedAt: now,
      };
      const tx: InventoryTransaction = {
        id: generateId('tx'),
        orgId: workspace.organization.id,
        ownerUid: workspace.organization.ownerUid,
        itemId: item.id,
        type: params.type,
        quantityDelta: calc.delta,
        resultingQuantity: calc.nextQuantity,
        reference: params.reference,
        notes: params.notes,
        performedBy: session.displayName,
        createdAt: now,
      };

      await Promise.all([
        repoRef.current.saveInventoryItem(updatedItem),
        repoRef.current.addInventoryTransaction(tx),
      ]);

      setWorkspace((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          inventory: prev.inventory.map((i) => (i.id === updatedItem.id ? updatedItem : i)),
          inventoryTransactions: [tx, ...prev.inventoryTransactions],
        };
      });

      await recordLog({
        action: `INVENTORY_${params.type}`,
        entityType: 'InventoryItem',
        entityId: item.id,
        summary: `${params.type} ${Math.abs(calc.delta)} ${item.unit} of ${item.name} (${item.quantity} → ${calc.nextQuantity})`,
        previousValue: `qty: ${item.quantity}`,
        newValue: `qty: ${calc.nextQuantity}`,
      });
      return { ok: true };
    },
    [recordLog, session, workspace]
  );

  const saveMaintenance = useCallback(
    async (input: Omit<MaintenanceRecord, 'id' | 'orgId' | 'ownerUid' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      if (!repoRef.current || !workspace) return;
      const now = new Date().toISOString();
      const existing = input.id ? workspace.maintenance.find((m) => m.id === input.id) : undefined;
      const record: MaintenanceRecord = {
        ...input,
        id: existing?.id ?? generateId('mnt'),
        orgId: workspace.organization.id,
        ownerUid: workspace.organization.ownerUid,
        completionDate: input.status === 'COMPLETED' ? input.completionDate || todayIsoDate() : input.completionDate,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      const promises: Promise<void>[] = [repoRef.current.saveMaintenance(record)];
      let autoNextRecord: MaintenanceRecord | null = null;

      // Auto-schedule next occurrence when a recurring maintenance task is completed
      if (
        record.status === 'COMPLETED' &&
        existing?.status !== 'COMPLETED' &&
        record.recurrence !== 'NONE'
      ) {
        const nextDate = computeNextMaintenanceDate(
          record.completionDate || record.scheduledDate,
          record.recurrence,
          record.customIntervalDays
        );
        if (nextDate) {
          autoNextRecord = {
            ...record,
            id: generateId('mnt'),
            scheduledDate: nextDate,
            completionDate: undefined,
            status: 'SCHEDULED',
            issue: '',
            workPerformed: '',
            partsUsed: '',
            cost: 0,
            notes: `Auto-scheduled recurring ${record.recurrence.toLowerCase()} maintenance.`,
            createdAt: now,
            updatedAt: now,
          };
          promises.push(repoRef.current.saveMaintenance(autoNextRecord));
        }
      }

      await Promise.all(promises);

      setWorkspace((prev) => {
        if (!prev) return prev;
        let list = existing
          ? prev.maintenance.map((m) => (m.id === record.id ? record : m))
          : [record, ...prev.maintenance];
        if (autoNextRecord) {
          list = [autoNextRecord, ...list];
        }
        return { ...prev, maintenance: list };
      });

      const asset = workspace.assets.find((a) => a.id === record.assetId);
      await recordLog({
        action: existing ? 'MAINTENANCE_UPDATED' : 'MAINTENANCE_SCHEDULED',
        entityType: 'MaintenanceRecord',
        entityId: record.id,
        summary: `${existing ? 'Updated' : 'Scheduled'} ${record.maintenanceType} for ${asset?.assetTag ?? record.assetId} (${record.status})`,
        previousValue: existing?.status,
        newValue: record.status,
      });
    },
    [recordLog, workspace]
  );

  const deleteMaintenance = useCallback(
    async (id: string) => {
      if (!repoRef.current) return;
      await repoRef.current.deleteMaintenance(id);
      setWorkspace((prev) => (prev ? { ...prev, maintenance: prev.maintenance.filter((m) => m.id !== id) } : prev));
      await recordLog({
        action: 'MAINTENANCE_DELETED',
        entityType: 'MaintenanceRecord',
        entityId: id,
        summary: `Deleted maintenance record ${id}`,
      });
    },
    [recordLog]
  );

  const saveKnowledgeArticle = useCallback(
    async (
      input: Omit<KnowledgeArticle, 'id' | 'orgId' | 'ownerUid' | 'authorName' | 'createdAt' | 'updatedAt'> & { id?: string }
    ) => {
      if (!repoRef.current || !workspace || !session) return;
      const now = new Date().toISOString();
      const existing = input.id ? workspace.knowledgeArticles.find((k) => k.id === input.id) : undefined;
      const article: KnowledgeArticle = {
        ...input,
        id: existing?.id ?? generateId('kb'),
        orgId: workspace.organization.id,
        ownerUid: workspace.organization.ownerUid,
        authorName: existing?.authorName ?? session.displayName,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await repoRef.current.saveKnowledgeArticle(article);
      setWorkspace((prev) => {
        if (!prev) return prev;
        const list = existing
          ? prev.knowledgeArticles.map((k) => (k.id === article.id ? article : k))
          : [article, ...prev.knowledgeArticles];
        return { ...prev, knowledgeArticles: list };
      });
      await recordLog({
        action: existing ? 'ARTICLE_UPDATED' : 'ARTICLE_CREATED',
        entityType: 'KnowledgeArticle',
        entityId: article.id,
        summary: `${existing ? 'Updated' : 'Created'} knowledge article "${article.title}" (${article.status})`,
      });
    },
    [recordLog, session, workspace]
  );

  const deleteKnowledgeArticle = useCallback(
    async (id: string) => {
      if (!repoRef.current || !workspace) return;
      const existing = workspace.knowledgeArticles.find((k) => k.id === id);
      await repoRef.current.deleteKnowledgeArticle(id);
      setWorkspace((prev) =>
        prev ? { ...prev, knowledgeArticles: prev.knowledgeArticles.filter((k) => k.id !== id) } : prev
      );
      await recordLog({
        action: 'ARTICLE_DELETED',
        entityType: 'KnowledgeArticle',
        entityId: id,
        summary: `Deleted knowledge article "${existing?.title ?? id}"`,
      });
    },
    [recordLog, workspace]
  );

  const restoreBackup = useCallback(
    async (snapshot: WorkspaceSnapshot) => {
      if (!repoRef.current) return;
      await repoRef.current.restoreWorkspace(snapshot);
      const reloaded = await repoRef.current.loadWorkspace();
      setWorkspace(reloaded);
      await recordLog({
        action: 'BACKUP_RESTORED',
        entityType: 'Organization',
        entityId: reloaded.organization.id,
        summary: `Restored workspace backup exported on ${snapshot.exportedAt}`,
      });
    },
    [recordLog]
  );

  const resetLocalDemoData = useCallback(async () => {
    if (session?.mode !== 'local') return;
    const fresh = LocalOfflineRepository.resetToSeed();
    setWorkspace(fresh);
  }, [session?.mode]);

  const notifications = useMemo(() => {
    if (!workspace) return [];
    return buildOperationalNotifications({
      assets: workspace.assets,
      inventory: workspace.inventory,
      maintenance: workspace.maintenance,
      assignments: workspace.assignments,
      warrantyAlertDays: workspace.organization.warrantyAlertDays,
      readIds: readNotifIds,
    });
  }, [workspace, readNotifIds]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const markNotificationRead = useCallback((id: string) => {
    setReadNotifIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        window.localStorage.setItem(READ_NOTIF_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setReadNotifIds((prev) => {
      const next = new Set(prev);
      for (const n of notifications) next.add(n.id);
      try {
        window.localStorage.setItem(READ_NOTIF_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  }, [notifications]);

  const clearError = useCallback(() => setError(null), []);

  const value: WorkspaceContextValue = {
    session,
    authReady,
    loading,
    error,
    workspace,
    notifications,
    unreadCount,
    theme,
    setTheme,
    signInWithGoogle,
    enterLocalOfflineMode,
    logout,
    can,
    setActiveRolePreview,
    markNotificationRead,
    markAllNotificationsRead,
    clearError,
    saveOrganization,
    saveUser,
    saveDepartment,
    deleteDepartment,
    saveLocation,
    deleteLocation,
    saveEmployee,
    saveAsset,
    deleteAsset,
    assignAsset,
    returnAsset,
    transferAsset,
    saveInventoryItem,
    deleteInventoryItem,
    performStockOperation,
    saveMaintenance,
    deleteMaintenance,
    saveKnowledgeArticle,
    deleteKnowledgeArticle,
    restoreBackup,
    resetLocalDemoData,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}

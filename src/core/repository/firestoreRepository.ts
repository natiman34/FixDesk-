import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { createSeedWorkspace } from '../seed/demoData';
import type {
  ActivityLog,
  Asset,
  AssetAssignment,
  Department,
  Employee,
  InventoryItem,
  InventoryTransaction,
  KnowledgeArticle,
  Location,
  MaintenanceRecord,
  Organization,
  OrgUser,
  WorkspaceSnapshot,
} from '../types/domain';
import type { IDataRepository } from './types';

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      clean[k] = v;
    }
  }
  return clean as T;
}

export class FirestoreRepository implements IDataRepository {
  readonly mode = 'cloud' as const;
  private readonly uid: string;
  private readonly email: string;
  private readonly displayName: string;
  private readonly orgId: string;

  constructor(params: { uid: string; email: string; displayName: string }) {
    this.uid = params.uid;
    this.email = params.email;
    this.displayName = params.displayName || params.email.split('@')[0] || 'Administrator';
    this.orgId = `org_${this.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28)}`;
  }

  private subPath(col: string, id?: string): string {
    return id ? `organizations/${this.orgId}/${col}/${id}` : `organizations/${this.orgId}/${col}`;
  }

  private async listOwned<T>(colName: string): Promise<T[]> {
    const path = this.subPath(colName);
    try {
      const q = query(collection(db, path), where('ownerUid', '==', this.uid));
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as T);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  async loadWorkspace(): Promise<WorkspaceSnapshot> {
    const orgPath = `organizations/${this.orgId}`;
    let orgSnap;
    try {
      orgSnap = await getDoc(doc(db, 'organizations', this.orgId));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, orgPath);
    }

    if (!orgSnap.exists()) {
      const seeded = createSeedWorkspace(this.uid, this.displayName, this.email);
      seeded.organization.id = this.orgId;
      seeded.organization.ownerUid = this.uid;
      seeded.organization.email = this.email;

      const rebind = <T extends { orgId: string; ownerUid?: string }>(items: T[]): T[] =>
        items.map((item) => ({ ...item, orgId: this.orgId, ownerUid: this.uid }));

      const hydrated: WorkspaceSnapshot = {
        ...seeded,
        users: [
          {
            uid: this.uid,
            orgId: this.orgId,
            displayName: this.displayName,
            email: this.email,
            role: 'ORG_ADMIN',
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        departments: rebind(seeded.departments),
        locations: rebind(seeded.locations),
        employees: rebind(seeded.employees),
        assets: rebind(seeded.assets),
        assignments: rebind(seeded.assignments),
        inventory: rebind(seeded.inventory),
        inventoryTransactions: rebind(seeded.inventoryTransactions),
        maintenance: rebind(seeded.maintenance),
        knowledgeArticles: rebind(seeded.knowledgeArticles),
        activityLogs: seeded.activityLogs.map((l) => ({
          ...l,
          orgId: this.orgId,
          ownerUid: this.uid,
          actorUid: this.uid,
        })),
      };

      await this.bootstrapCloudWorkspace(hydrated);
      return hydrated;
    }

    const organization = orgSnap.data() as Organization;
    const memberPath = this.subPath('members', this.uid);
    let currentMember: OrgUser | null = null;
    try {
      const mSnap = await getDoc(doc(db, memberPath));
      if (mSnap.exists()) {
        currentMember = mSnap.data() as OrgUser;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, memberPath);
    }

    const [
      departments,
      locations,
      employees,
      assets,
      assignments,
      inventory,
      inventoryTransactions,
      maintenance,
      knowledgeArticles,
      activityLogs,
    ] = await Promise.all([
      this.listOwned<Department>('departments'),
      this.listOwned<Location>('locations'),
      this.listOwned<Employee>('employees'),
      this.listOwned<Asset>('assets'),
      this.listOwned<AssetAssignment>('assignments'),
      this.listOwned<InventoryItem>('inventory'),
      this.listOwned<InventoryTransaction>('inventoryTransactions'),
      this.listOwned<MaintenanceRecord>('maintenance'),
      this.listOwned<KnowledgeArticle>('knowledgeArticles'),
      this.listOwned<ActivityLog>('activityLogs'),
    ]);

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      organization,
      users: currentMember
        ? [currentMember]
        : [
            {
              uid: this.uid,
              orgId: this.orgId,
              displayName: this.displayName,
              email: this.email,
              role: 'ORG_ADMIN',
              status: 'ACTIVE',
              createdAt: organization.createdAt,
              updatedAt: organization.updatedAt,
            },
          ],
      departments,
      locations,
      employees,
      assets,
      assignments,
      inventory,
      inventoryTransactions,
      maintenance,
      knowledgeArticles,
      activityLogs: activityLogs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }

  private async bootstrapCloudWorkspace(snapshot: WorkspaceSnapshot): Promise<void> {
    const now = new Date().toISOString();
    try {
      await setDoc(doc(db, 'users', this.uid), {
        uid: this.uid,
        email: this.email,
        displayName: this.displayName,
        activeOrgId: this.orgId,
        updatedAt: now,
      });

      await setDoc(doc(db, 'organizations', this.orgId), stripUndefined({ ...snapshot.organization }));
      const adminMember = snapshot.users[0];
      await setDoc(doc(db, this.subPath('members', this.uid)), stripUndefined({ ...adminMember }));

      const batch = writeBatch(db);
      for (const d of snapshot.departments) batch.set(doc(db, this.subPath('departments', d.id)), stripUndefined({ ...d }));
      for (const l of snapshot.locations) batch.set(doc(db, this.subPath('locations', l.id)), stripUndefined({ ...l }));
      for (const e of snapshot.employees) batch.set(doc(db, this.subPath('employees', e.id)), stripUndefined({ ...e }));
      for (const a of snapshot.assets) batch.set(doc(db, this.subPath('assets', a.id)), stripUndefined({ ...a }));
      for (const asg of snapshot.assignments) batch.set(doc(db, this.subPath('assignments', asg.id)), stripUndefined({ ...asg }));
      for (const i of snapshot.inventory) batch.set(doc(db, this.subPath('inventory', i.id)), stripUndefined({ ...i }));
      for (const tx of snapshot.inventoryTransactions) batch.set(doc(db, this.subPath('inventoryTransactions', tx.id)), stripUndefined({ ...tx }));
      for (const m of snapshot.maintenance) batch.set(doc(db, this.subPath('maintenance', m.id)), stripUndefined({ ...m }));
      for (const k of snapshot.knowledgeArticles) batch.set(doc(db, this.subPath('knowledgeArticles', k.id)), stripUndefined({ ...k }));
      for (const log of snapshot.activityLogs) batch.set(doc(db, this.subPath('activityLogs', log.id)), stripUndefined({ ...log }));
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `organizations/${this.orgId}`);
    }
  }

  async saveOrganization(org: Organization): Promise<void> {
    const path = `organizations/${this.orgId}`;
    try {
      await setDoc(doc(db, path), stripUndefined({ ...org, id: this.orgId, ownerUid: this.uid }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  async saveUser(user: OrgUser): Promise<void> {
    const path = this.subPath('members', user.uid);
    try {
      await setDoc(doc(db, path), stripUndefined({ ...user, orgId: this.orgId }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  async saveDepartment(dept: Department): Promise<void> {
    const path = this.subPath('departments', dept.id);
    try {
      await setDoc(doc(db, path), stripUndefined({ ...dept, orgId: this.orgId, ownerUid: this.uid }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  async deleteDepartment(id: string): Promise<void> {
    const path = this.subPath('departments', id);
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  async saveLocation(loc: Location): Promise<void> {
    const path = this.subPath('locations', loc.id);
    try {
      await setDoc(doc(db, path), stripUndefined({ ...loc, orgId: this.orgId, ownerUid: this.uid }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  async deleteLocation(id: string): Promise<void> {
    const path = this.subPath('locations', id);
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  async saveEmployee(emp: Employee): Promise<void> {
    const path = this.subPath('employees', emp.id);
    try {
      await setDoc(doc(db, path), stripUndefined({ ...emp, orgId: this.orgId, ownerUid: this.uid }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  async saveAsset(asset: Asset): Promise<void> {
    const path = this.subPath('assets', asset.id);
    try {
      await setDoc(doc(db, path), stripUndefined({ ...asset, orgId: this.orgId, ownerUid: this.uid }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  async deleteAsset(id: string): Promise<void> {
    const path = this.subPath('assets', id);
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  async saveAssignment(assignment: AssetAssignment): Promise<void> {
    const path = this.subPath('assignments', assignment.id);
    try {
      await setDoc(doc(db, path), stripUndefined({ ...assignment, orgId: this.orgId, ownerUid: this.uid }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  async saveInventoryItem(item: InventoryItem): Promise<void> {
    const path = this.subPath('inventory', item.id);
    try {
      await setDoc(doc(db, path), stripUndefined({ ...item, orgId: this.orgId, ownerUid: this.uid }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  async deleteInventoryItem(id: string): Promise<void> {
    const path = this.subPath('inventory', id);
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  async addInventoryTransaction(tx: InventoryTransaction): Promise<void> {
    const path = this.subPath('inventoryTransactions', tx.id);
    try {
      await setDoc(doc(db, path), stripUndefined({ ...tx, orgId: this.orgId, ownerUid: this.uid }));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  async saveMaintenance(record: MaintenanceRecord): Promise<void> {
    const path = this.subPath('maintenance', record.id);
    try {
      await setDoc(doc(db, path), stripUndefined({ ...record, orgId: this.orgId, ownerUid: this.uid }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  async deleteMaintenance(id: string): Promise<void> {
    const path = this.subPath('maintenance', id);
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  async saveKnowledgeArticle(article: KnowledgeArticle): Promise<void> {
    const path = this.subPath('knowledgeArticles', article.id);
    try {
      await setDoc(doc(db, path), stripUndefined({ ...article, orgId: this.orgId, ownerUid: this.uid }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  async deleteKnowledgeArticle(id: string): Promise<void> {
    const path = this.subPath('knowledgeArticles', id);
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  async appendActivityLog(log: ActivityLog): Promise<void> {
    const path = this.subPath('activityLogs', log.id);
    try {
      await setDoc(
        doc(db, path),
        stripUndefined({ ...log, orgId: this.orgId, ownerUid: this.uid, actorUid: this.uid })
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  async restoreWorkspace(snapshot: WorkspaceSnapshot): Promise<void> {
    const rebind = <T extends { orgId: string; ownerUid?: string }>(items: T[]): T[] =>
      items.map((item) => ({ ...item, orgId: this.orgId, ownerUid: this.uid }));

    await this.bootstrapCloudWorkspace({
      ...snapshot,
      organization: { ...snapshot.organization, id: this.orgId, ownerUid: this.uid },
      departments: rebind(snapshot.departments),
      locations: rebind(snapshot.locations),
      employees: rebind(snapshot.employees),
      assets: rebind(snapshot.assets),
      assignments: rebind(snapshot.assignments),
      inventory: rebind(snapshot.inventory),
      inventoryTransactions: rebind(snapshot.inventoryTransactions),
      maintenance: rebind(snapshot.maintenance),
      knowledgeArticles: rebind(snapshot.knowledgeArticles),
      activityLogs: snapshot.activityLogs.map((l) => ({
        ...l,
        orgId: this.orgId,
        ownerUid: this.uid,
        actorUid: this.uid,
      })),
    });
  }
}

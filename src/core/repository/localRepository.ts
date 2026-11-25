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
import { createSeedWorkspace } from '../seed/demoData';
import type { IDataRepository } from './types';

const STORAGE_KEY = 'fixdesk.offline.workspace.v1';

function readLocalState(): WorkspaceSnapshot {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkspaceSnapshot;
      if (parsed && parsed.organization && Array.isArray(parsed.assets)) {
        return parsed;
      }
    }
  } catch {
    // Fallback to clean seed if storage unavailable or corrupted
  }
  const seed = createSeedWorkspace();
  writeLocalState(seed);
  return seed;
}

function writeLocalState(snapshot: WorkspaceSnapshot): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.error('Failed to persist local offline workspace:', err);
  }
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [item, ...list];
  const next = [...list];
  next[idx] = item;
  return next;
}

export class LocalOfflineRepository implements IDataRepository {
  readonly mode = 'local' as const;

  async loadWorkspace(): Promise<WorkspaceSnapshot> {
    return readLocalState();
  }

  async saveOrganization(org: Organization): Promise<void> {
    const state = readLocalState();
    state.organization = org;
    writeLocalState(state);
  }

  async saveUser(user: OrgUser): Promise<void> {
    const state = readLocalState();
    const idx = state.users.findIndex((u) => u.uid === user.uid);
    if (idx === -1) state.users = [user, ...state.users];
    else {
      const next = [...state.users];
      next[idx] = user;
      state.users = next;
    }
    writeLocalState(state);
  }

  async saveDepartment(dept: Department): Promise<void> {
    const state = readLocalState();
    state.departments = upsertById(state.departments, dept);
    writeLocalState(state);
  }

  async deleteDepartment(id: string): Promise<void> {
    const state = readLocalState();
    state.departments = state.departments.filter((d) => d.id !== id);
    writeLocalState(state);
  }

  async saveLocation(loc: Location): Promise<void> {
    const state = readLocalState();
    state.locations = upsertById(state.locations, loc);
    writeLocalState(state);
  }

  async deleteLocation(id: string): Promise<void> {
    const state = readLocalState();
    state.locations = state.locations.filter((l) => l.id !== id);
    writeLocalState(state);
  }

  async saveEmployee(emp: Employee): Promise<void> {
    const state = readLocalState();
    state.employees = upsertById(state.employees, emp);
    writeLocalState(state);
  }

  async saveAsset(asset: Asset): Promise<void> {
    const state = readLocalState();
    state.assets = upsertById(state.assets, asset);
    writeLocalState(state);
  }

  async deleteAsset(id: string): Promise<void> {
    const state = readLocalState();
    state.assets = state.assets.filter((a) => a.id !== id);
    writeLocalState(state);
  }

  async saveAssignment(assignment: AssetAssignment): Promise<void> {
    const state = readLocalState();
    state.assignments = upsertById(state.assignments, assignment);
    writeLocalState(state);
  }

  async saveInventoryItem(item: InventoryItem): Promise<void> {
    const state = readLocalState();
    state.inventory = upsertById(state.inventory, item);
    writeLocalState(state);
  }

  async deleteInventoryItem(id: string): Promise<void> {
    const state = readLocalState();
    state.inventory = state.inventory.filter((i) => i.id !== id);
    writeLocalState(state);
  }

  async addInventoryTransaction(tx: InventoryTransaction): Promise<void> {
    const state = readLocalState();
    state.inventoryTransactions = [tx, ...state.inventoryTransactions];
    writeLocalState(state);
  }

  async saveMaintenance(record: MaintenanceRecord): Promise<void> {
    const state = readLocalState();
    state.maintenance = upsertById(state.maintenance, record);
    writeLocalState(state);
  }

  async deleteMaintenance(id: string): Promise<void> {
    const state = readLocalState();
    state.maintenance = state.maintenance.filter((m) => m.id !== id);
    writeLocalState(state);
  }

  async saveKnowledgeArticle(article: KnowledgeArticle): Promise<void> {
    const state = readLocalState();
    state.knowledgeArticles = upsertById(state.knowledgeArticles, article);
    writeLocalState(state);
  }

  async deleteKnowledgeArticle(id: string): Promise<void> {
    const state = readLocalState();
    state.knowledgeArticles = state.knowledgeArticles.filter((k) => k.id !== id);
    writeLocalState(state);
  }

  async appendActivityLog(log: ActivityLog): Promise<void> {
    const state = readLocalState();
    state.activityLogs = [log, ...state.activityLogs];
    writeLocalState(state);
  }

  async restoreWorkspace(snapshot: WorkspaceSnapshot): Promise<void> {
    writeLocalState(snapshot);
  }

  static resetToSeed(): WorkspaceSnapshot {
    const seed = createSeedWorkspace();
    writeLocalState(seed);
    return seed;
  }
}

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

export interface IDataRepository {
  readonly mode: 'cloud' | 'local';
  loadWorkspace(): Promise<WorkspaceSnapshot>;
  saveOrganization(org: Organization): Promise<void>;
  saveUser(user: OrgUser): Promise<void>;
  saveDepartment(dept: Department): Promise<void>;
  deleteDepartment(id: string): Promise<void>;
  saveLocation(loc: Location): Promise<void>;
  deleteLocation(id: string): Promise<void>;
  saveEmployee(emp: Employee): Promise<void>;
  saveAsset(asset: Asset): Promise<void>;
  deleteAsset(id: string): Promise<void>;
  saveAssignment(assignment: AssetAssignment): Promise<void>;
  saveInventoryItem(item: InventoryItem): Promise<void>;
  deleteInventoryItem(id: string): Promise<void>;
  addInventoryTransaction(tx: InventoryTransaction): Promise<void>;
  saveMaintenance(record: MaintenanceRecord): Promise<void>;
  deleteMaintenance(id: string): Promise<void>;
  saveKnowledgeArticle(article: KnowledgeArticle): Promise<void>;
  deleteKnowledgeArticle(id: string): Promise<void>;
  appendActivityLog(log: ActivityLog): Promise<void>;
  restoreWorkspace(snapshot: WorkspaceSnapshot): Promise<void>;
}

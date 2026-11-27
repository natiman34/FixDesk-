import React, { useRef, useState, useCallback } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  Monitor,
  Moon,
  Plus,
  RotateCcw,
  Shield,
  Sun,
  Upload,
  X,
  AlertTriangle,
  Info,
  UserCheck,
  UserX,
  Key,
  Palette,
  HardDrive,
  Globe,
  Bell,
  Lock,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { organizationSchema } from '../core/validation/schemas';
import { validateBackupSnapshot } from '../core/logic/operations';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../core/permissions/rbac';
import type {
  OrgUser,
  ThemePreference,
  UserRole,
  WorkspaceSnapshot,
} from '../core/types/domain';
import {
  Button,
  ConfirmDialog,
  Field,
  Input,
  KPICard,
  Modal,
  PageHeader,
  Select,
  StatusText,
  Tabs,
  Toast,
  ToastContainer,
  type ToastMessage,
} from '../components/ui/Primitives';
import { generateId, getInitials, todayIsoDate, formatDateTime } from '../lib/utils';

type SettingsTab = 'organization' | 'taxonomies' | 'users' | 'appearance' | 'backup' | 'security';

export function SettingsPage() {
  const {
    workspace,
    session,
    theme,
    setTheme,
    can,
    saveOrganization,
    saveUser,
    restoreBackup,
    resetLocalDemoData,
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<SettingsTab>('organization');

  // Org form state
  const [orgName, setOrgName] = useState(workspace?.organization.name ?? '');
  const [orgEmail, setOrgEmail] = useState(workspace?.organization.email ?? '');
  const [orgPhone, setOrgPhone] = useState(workspace?.organization.phone ?? '');
  const [orgWebsite, setOrgWebsite] = useState(workspace?.organization.website ?? '');
  const [orgAddress, setOrgAddress] = useState(workspace?.organization.address ?? '');
  const [orgTimezone, setOrgTimezone] = useState(workspace?.organization.timezone ?? 'UTC');
  const [orgCurrency, setOrgCurrency] = useState(workspace?.organization.currency ?? 'USD');
  const [orgDateFormat, setOrgDateFormat] = useState(workspace?.organization.dateFormat ?? 'YYYY-MM-DD');
  const [warrantyDays, setWarrantyDays] = useState(String(workspace?.organization.warrantyAlertDays ?? 60));
  const [maintDays, setMaintDays] = useState(String(workspace?.organization.maintenanceReminderDays ?? 14));
  const [orgErrors, setOrgErrors] = useState<Record<string, string>>({});
  const [orgSavedBanner, setOrgSavedBanner] = useState(false);

  // Taxonomy inputs
  const [newAssetCat, setNewAssetCat] = useState('');
  const [newInvCat, setNewInvCat] = useState('');
  const [newMaintType, setNewMaintType] = useState('');

  // User modal state
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<OrgUser | null>(null);
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uRole, setURole] = useState<UserRole>('IT_TECHNICIAN');
  const [uStatus, setUStatus] = useState<'ACTIVE' | 'SUSPENDED'>('ACTIVE');
  const [userErrors, setUserErrors] = useState<Record<string, string>>({});

  // Backup state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingRestore, setPendingRestore] = useState<WorkspaceSnapshot | null>(null);
  const [backupFeedback, setBackupFeedback] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Toast state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastMessage['type'], message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  if (!workspace || !session) return null;

  const canManageOrg = can('settings:org');
  const canManageUsers = can('settings:users');
  const canManageBackup = can('settings:backup');

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgSavedBanner(false);
    const parsed = organizationSchema.safeParse({
      name: orgName,
      email: orgEmail,
      phone: orgPhone,
      website: orgWebsite,
      address: orgAddress,
      timezone: orgTimezone,
      currency: orgCurrency,
      dateFormat: orgDateFormat,
      warrantyAlertDays: Number(warrantyDays),
      maintenanceReminderDays: Number(maintDays),
    });

    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!errs[key]) errs[key] = issue.message;
      }
      setOrgErrors(errs);
      return;
    }

    setOrgErrors({});
    await saveOrganization({
      ...workspace.organization,
      ...parsed.data,
    });
    setOrgSavedBanner(true);
    showToast('success', 'Organization settings saved');
  };

  const addTaxonomyItem = async (
    field: 'assetCategories' | 'inventoryCategories' | 'maintenanceTypes',
    rawValue: string,
    clearFn: () => void
  ) => {
    const val = rawValue.trim();
    if (!val) return;
    const current = workspace.organization[field];
    if (current.some((c) => c.toLowerCase() === val.toLowerCase())) {
      showToast('warning', `${val} already exists`);
      clearFn();
      return;
    }
    await saveOrganization({
      ...workspace.organization,
      [field]: [...current, val],
    });
    clearFn();
    showToast('success', 'Category added');
  };

  const removeTaxonomyItem = async (
    field: 'assetCategories' | 'inventoryCategories' | 'maintenanceTypes',
    value: string
  ) => {
    const next = workspace.organization[field].filter((item) => item !== value);
    if (next.length === 0) {
      showToast('error', 'At least one category is required');
      return;
    }
    await saveOrganization({
      ...workspace.organization,
      [field]: next,
    });
    showToast('success', 'Category removed');
  };

  const openUserModal = (existing?: OrgUser) => {
    setUserErrors({});
    if (existing) {
      setEditingUser(existing);
      setUName(existing.displayName);
      setUEmail(existing.email);
      setURole(existing.role);
      setUStatus(existing.status);
    } else {
      setEditingUser(null);
      setUName('');
      setUEmail('');
      setURole('IT_TECHNICIAN');
      setUStatus('ACTIVE');
    }
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!uName.trim()) errors.name = 'Full name is required';
    if (!uEmail.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(uEmail)) errors.email = 'Invalid email format';

    if (Object.keys(errors).length > 0) {
      setUserErrors(errors);
      return;
    }

    const now = new Date().toISOString();
    const nextUser: OrgUser = {
      uid: editingUser?.uid ?? generateId('usr'),
      orgId: workspace.organization.id,
      displayName: uName.trim(),
      email: uEmail.trim(),
      role: uRole,
      status: uStatus,
      avatarInitials: getInitials(uName.trim()),
      createdAt: editingUser?.createdAt ?? now,
      updatedAt: now,
    };
    await saveUser(nextUser);
    setUserModalOpen(false);
    showToast('success', editingUser ? 'User updated' : 'User created');
  };

  const handleDownloadBackup = () => {
    const payload: WorkspaceSnapshot = {
      ...workspace,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fixdesk-backup-${workspace.organization.slug}-${todayIsoDate()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'JSON workspace backup downloaded');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const checked = validateBackupSnapshot(parsed);
      if (!checked.ok) {
        showToast('error', checked.error);
        return;
      }
      setPendingRestore(checked.data);
      showToast('info', 'Backup loaded. Click Restore to apply.');
    } catch {
      showToast('error', 'Selected file is not valid JSON.');
    }
  };

  const confirmRestore = async () => {
    if (!pendingRestore) return;
    await restoreBackup(pendingRestore);
    setPendingRestore(null);
    showToast('success', 'Workspace backup restored cleanly');
  };

  const tabsConfig: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'organization', label: 'Organization', icon: Globe },
    { id: 'taxonomies', label: 'Categories & Types', icon: Palette },
    { id: 'users', label: 'Users & Roles', icon: UserCheck },
    { id: 'appearance', label: 'Appearance', icon: Monitor },
    { id: 'backup', label: 'Backup & Storage', icon: HardDrive },
    { id: 'security', label: 'Security', icon: Lock },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings & System Configuration"
        description="Manage organization profile, IT taxonomies, role-based access control, theme preferences, and database backups."
      />

      <Tabs
        tabs={tabsConfig.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))}
        activeTab={activeTab}
        onChange={setActiveTab}
        className="border-slate-200 dark:border-slate-800"
      />

      {/* ORGANIZATION TAB */}
      {activeTab === 'organization' && (
        <form
          onSubmit={handleSaveOrg}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 max-w-3xl"
        >
          {orgSavedBanner && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Organization settings saved.
            </div>
          )}

          <div className="flex items-center gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <Globe className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Organization Profile</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Organization Name" htmlFor="org-name" required error={orgErrors.name}>
              <Input
                id="org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={!canManageOrg}
              />
            </Field>
            <Field label="Contact Email" htmlFor="org-email" error={orgErrors.email}>
              <Input
                id="org-email"
                type="email"
                value={orgEmail}
                onChange={(e) => setOrgEmail(e.target.value)}
                disabled={!canManageOrg}
              />
            </Field>
            <Field label="Phone Number" htmlFor="org-phone" error={orgErrors.phone}>
              <Input
                id="org-phone"
                value={orgPhone}
                onChange={(e) => setOrgPhone(e.target.value)}
                disabled={!canManageOrg}
              />
            </Field>
            <Field label="Website" htmlFor="org-web" error={orgErrors.website}>
              <Input
                id="org-web"
                value={orgWebsite}
                onChange={(e) => setOrgWebsite(e.target.value)}
                disabled={!canManageOrg}
              />
            </Field>
          </div>

          <Field label="Headquarters Address" htmlFor="org-addr" error={orgErrors.address}>
            <Input
              id="org-addr"
              value={orgAddress}
              onChange={(e) => setOrgAddress(e.target.value)}
              disabled={!canManageOrg}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Timezone" htmlFor="org-tz" required error={orgErrors.timezone}>
              <Input
                id="org-tz"
                value={orgTimezone}
                onChange={(e) => setOrgTimezone(e.target.value)}
                disabled={!canManageOrg}
              />
            </Field>
            <Field label="Currency" htmlFor="org-curr" required error={orgErrors.currency}>
              <Select
                id="org-curr"
                value={orgCurrency}
                onChange={(e) => setOrgCurrency(e.target.value)}
                disabled={!canManageOrg}
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="ETB">ETB (Br)</option>
                <option value="KES">KES (KSh)</option>
                <option value="CAD">CAD ($)</option>
              </Select>
            </Field>
            <Field label="Date Format" htmlFor="org-datefmt" required>
              <Select
                id="org-datefmt"
                value={orgDateFormat}
                onChange={(e) => setOrgDateFormat(e.target.value)}
                disabled={!canManageOrg}
              >
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              </Select>
            </Field>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
              <Bell className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Alert Thresholds</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              <Field
                label="Warranty Expiration Alert Lead Time (days)"
                htmlFor="org-war-days"
                error={orgErrors.warrantyAlertDays}
                hint="Notify when warranty expires within this many days"
              >
                <Input
                  id="org-war-days"
                  type="number"
                  min={1}
                  max={365}
                  value={warrantyDays}
                  onChange={(e) => setWarrantyDays(e.target.value)}
                  disabled={!canManageOrg}
                />
              </Field>
              <Field
                label="Maintenance Reminder Lead Time (days)"
                htmlFor="org-mnt-days"
                error={orgErrors.maintenanceReminderDays}
                hint="Notify before scheduled maintenance is due"
              >
                <Input
                  id="org-mnt-days"
                  type="number"
                  min={1}
                  max={180}
                  value={maintDays}
                  onChange={(e) => setMaintDays(e.target.value)}
                  disabled={!canManageOrg}
                />
              </Field>
            </div>
          </div>

          {canManageOrg && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <Button type="submit">Save Organization Settings</Button>
            </div>
          )}
        </form>
      )}

      {/* TAXONOMIES TAB */}
      {activeTab === 'taxonomies' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">Manage IT Taxonomies</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Categories and types are used across assets, inventory, and maintenance modules. Changes apply to new records.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[
              {
                title: 'Asset Categories',
                field: 'assetCategories' as const,
                items: workspace.organization.assetCategories,
                value: newAssetCat,
                setValue: setNewAssetCat,
                placeholder: 'Add category (e.g., Firewall)',
                icon: HardDrive,
              },
              {
                title: 'Inventory Categories',
                field: 'inventoryCategories' as const,
                items: workspace.organization.inventoryCategories,
                value: newInvCat,
                setValue: setNewInvCat,
                placeholder: 'Add category (e.g., Fiber Optics)',
                icon: Database,
              },
              {
                title: 'Maintenance Types',
                field: 'maintenanceTypes' as const,
                items: workspace.organization.maintenanceTypes,
                value: newMaintType,
                setValue: setNewMaintType,
                placeholder: 'Add type (e.g., Firmware Audit)',
                icon: RotateCcw,
              },
            ].map((group) => (
              <section
                key={group.field}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
              >
                <div className="flex items-center gap-2">
                  <group.icon className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {group.title}
                  </h2>
                </div>
                {canManageOrg && (
                  <div className="flex gap-2">
                    <Input
                      value={group.value}
                      onChange={(e) => group.setValue(e.target.value)}
                      placeholder={group.placeholder}
                      aria-label={group.placeholder}
                    />
                    <Button
                      variant="secondary"
                      onClick={() => addTaxonomyItem(group.field, group.value, () => group.setValue(''))}
                      aria-label={`Add to ${group.title}`}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                  {group.items.map((item) => (
                    <li key={item} className="py-2.5 flex items-center justify-between text-sm">
                      <span className="text-slate-700 dark:text-slate-300">{item}</span>
                      {canManageOrg && group.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTaxonomyItem(group.field, item)}
                          aria-label={`Remove ${item}`}
                          className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-slate-500 dark:text-slate-400">{group.items.length} item{group.items.length !== 1 ? 's' : ''}</p>
              </section>
            ))}
          </div>
        </div>
      )}

      {/* USERS & RBAC TAB */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              label="Total Users"
              value={workspace.users.length}
              sub="Workspace accounts"
              tone="default"
              icon={UserCheck}
            />
            <KPICard
              label="Active"
              value={workspace.users.filter((u) => u.status === 'ACTIVE').length}
              sub="Can sign in"
              tone="success"
              icon={UserCheck}
            />
            <KPICard
              label="Suspended"
              value={workspace.users.filter((u) => u.status === 'SUSPENDED').length}
              sub="Access revoked"
              tone="warning"
              icon={UserX}
            />
            <KPICard
              label="Roles in Use"
              value={new Set(workspace.users.map((u) => u.role)).size}
              sub="Of 6 available"
              tone="info"
              icon={Shield}
            />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Workspace Accounts
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Assign operational roles to enforce module and action permissions.
                </p>
              </div>
              {canManageUsers && (
                <Button size="sm" onClick={() => openUserModal()}>
                  <Plus className="w-4 h-4" />
                  Add Account
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created</th>
                    {canManageUsers && <th className="py-3 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {workspace.users.map((user) => (
                    <tr key={user.uid}>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {user.displayName}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{user.email}</td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-200">
                        {ROLE_LABELS[user.role]}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText
                          tone={user.status === 'ACTIVE' ? 'success' : 'danger'}
                          label={user.status}
                        />
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDateTime(user.createdAt)}
                      </td>
                      {canManageUsers && (
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openUserModal(user)}
                            aria-label={`Edit account ${user.displayName}`}
                          >
                            Edit
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Role Permissions Reference
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((roleKey) => (
                <div
                  key={roleKey}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {ROLE_LABELS[roleKey]}
                    </p>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {ROLE_DESCRIPTIONS[roleKey]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* APPEARANCE TAB */}
      {activeTab === 'appearance' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6 max-w-3xl">
          <div>
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Interface Theme
              </h2>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Choose Light, Dark, or match your operating system preference. Saved automatically on this device.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(
              [
                { id: 'light', label: 'Light Mode', icon: Sun, desc: 'Clean bright workspace' },
                { id: 'dark', label: 'Dark Mode', icon: Moon, desc: 'Low-glare slate surface' },
                { id: 'system', label: 'System Default', icon: Monitor, desc: 'Follows OS theme' },
              ] as { id: ThemePreference; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }[]
            ).map((opt) => {
              const Icon = opt.icon;
              const selected = theme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTheme(opt.id)}
                  className={`text-left rounded-xl border p-4 transition-colors relative ${
                    selected
                      ? 'border-sky-600 bg-sky-50/60 dark:bg-sky-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {selected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <Icon className="w-5 h-5 text-slate-800 dark:text-slate-200" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-2.5">
                    {opt.label}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* BACKUP & STORAGE TAB */}
      {activeTab === 'backup' && (
        <div className="space-y-6 max-w-3xl">
          {backupFeedback && (
            <div
              role="alert"
              className={`rounded-lg border px-4 py-3 text-sm ${
                backupFeedback.type === 'ok'
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                  : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300'
              }`}
            >
              {backupFeedback.message}
            </div>
          )}

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Active Storage Mode
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {session.mode === 'cloud'
                ? 'Connected to Cloud Workspace (Firebase Firestore with per-owner multi-tenant security rules). All changes persist immediately across browsers.'
                : 'Running in Local Offline Storage mode (persisted in this browser via localStorage). For multi-device cloud persistence, sign in with Google from the login screen. The native Windows Desktop SQLite adapter and bidirectional sync engine are documented in docs/architecture/ARCHITECTURE.md for Phase 11.'}
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              JSON Backup & Restore
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Export a validated JSON archive of all assets, assignments, inventory, maintenance records, employees,
              departments, locations, knowledge articles, and audit logs.
            </p>

            <div className="flex flex-wrap gap-3 pt-1">
              {canManageBackup && (
                <>
                  <Button onClick={handleDownloadBackup}>
                    <Download className="w-4 h-4" />
                    Download JSON Backup
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    Restore from Backup
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={handleFileChange}
                    className="hidden"
                    aria-label="Upload FixDesk backup JSON file"
                  />
                </>
              )}
              {session.mode === 'local' && (
                <Button variant="ghost" onClick={() => setResetConfirmOpen(true)}>
                  <RotateCcw className="w-4 h-4" />
                  Reset Local Demo Dataset
                </Button>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Workspace Statistics
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <p className="text-slate-500 dark:text-slate-400">Assets</p>
                <p className="font-bold text-slate-900 dark:text-slate-100">{workspace.assets.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <p className="text-slate-500 dark:text-slate-400">Employees</p>
                <p className="font-bold text-slate-900 dark:text-slate-100">{workspace.employees.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <p className="text-slate-500 dark:text-slate-400">Inventory SKUs</p>
                <p className="font-bold text-slate-900 dark:text-slate-100">{workspace.inventory.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <p className="text-slate-500 dark:text-slate-400">Audit Log Entries</p>
                <p className="font-bold text-slate-900 dark:text-slate-100">{workspace.activityLogs.length}</p>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* SECURITY TAB */}
      {activeTab === 'security' && (
        <div className="space-y-6 max-w-3xl">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Access Control & Authentication
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              FixDesk uses Firebase Authentication for cloud workspaces and local session management for offline mode.
              All data access is governed by Role-Based Access Control (RBAC) with 6 operational roles.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-medium text-slate-900 dark:text-slate-100">Multi-Factor Authentication</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 ml-6">
                  Enforced via Google Workspace / Firebase Auth for cloud sessions.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span className="font-medium text-slate-900 dark:text-slate-100">Session Management</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 ml-6">
                  JWT tokens with automatic refresh. Local mode uses encrypted localStorage.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span className="font-medium text-slate-900 dark:text-slate-100">Audit Trail</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 ml-6">
                  Immutable activity log records all mutations with actor, timestamp, and value changes.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span className="font-medium text-slate-900 dark:text-slate-100">Data Isolation</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 ml-6">
                  Cloud: Firestore security rules enforce per-organization isolation. Local: Browser sandbox.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Session & Privacy
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                <h3 className="font-medium text-slate-900 dark:text-slate-100">Current Session</h3>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">User</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100">{session.displayName}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100">{session.email}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Role</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100">{ROLE_LABELS[session.role]}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Mode</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100">{session.mode === 'cloud' ? 'Cloud Workspace' : 'Local Offline'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Organization</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100">{workspace.organization.name}</dd>
                  </div>
                </dl>
              </div>
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                <h3 className="font-medium text-slate-900 dark:text-slate-100">Security Features</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Encrypted data in transit (TLS 1.3)</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Encrypted data at rest (Firestore / localStorage)</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> RBAC enforced on every API call</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Immutable audit trail</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> No hardcoded secrets or credentials</li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* User Modal */}
      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={editingUser ? 'Edit Workspace Account' : 'Add Workspace Account'}
        size="md"
      >
        <form onSubmit={handleSaveUser} className="space-y-4">
          <Field label="Full Name" htmlFor="u-name" required error={userErrors.name}>
            <Input id="u-name" value={uName} onChange={(e) => setUName(e.target.value)} required />
          </Field>
          <Field label="Work Email" htmlFor="u-email" required error={userErrors.email}>
            <Input
              id="u-email"
              type="email"
              value={uEmail}
              onChange={(e) => setUEmail(e.target.value)}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role" htmlFor="u-role" required>
              <Select
                id="u-role"
                value={uRole}
                onChange={(e) => setURole(e.target.value as UserRole)}
              >
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((roleKey) => (
                  <option key={roleKey} value={roleKey}>
                    {ROLE_LABELS[roleKey]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Account Status" htmlFor="u-status" required>
              <Select
                id="u-status"
                value={uStatus}
                onChange={(e) => setUStatus(e.target.value as 'ACTIVE' | 'SUSPENDED')}
              >
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setUserModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Account</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingRestore)}
        title="Overwrite Workspace with Backup?"
        message={`This will replace current organization records with the backup from "${pendingRestore?.organization.name ?? ''}" exported on ${pendingRestore?.exportedAt ?? ''}. Proceed only if you intend to overwrite existing records.`}
        confirmLabel="Restore Backup"
        danger
        onConfirm={confirmRestore}
        onCancel={() => setPendingRestore(null)}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Reset Local Demo Data?"
        message="This will clear your local browser edits and restore the default Meridian Relief Foundation dataset."
        confirmLabel="Reset Local Data"
        danger
        onConfirm={async () => {
          await resetLocalDemoData();
          setResetConfirmOpen(false);
          showToast('success', 'Local dataset reset to default seed data');
        }}
        onCancel={() => setResetConfirmOpen(false)}
      />

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
import React, { useRef, useState } from 'react';
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
  Modal,
  PageHeader,
  Select,
  StatusText,
} from '../components/ui/Primitives';
import { generateId, getInitials, todayIsoDate } from '../lib/utils';

type SettingsTab = 'organization' | 'taxonomies' | 'users' | 'appearance' | 'backup';

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

  // Backup state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingRestore, setPendingRestore] = useState<WorkspaceSnapshot | null>(null);
  const [backupFeedback, setBackupFeedback] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

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
      clearFn();
      return;
    }
    await saveOrganization({
      ...workspace.organization,
      [field]: [...current, val],
    });
    clearFn();
  };

  const removeTaxonomyItem = async (
    field: 'assetCategories' | 'inventoryCategories' | 'maintenanceTypes',
    value: string
  ) => {
    const next = workspace.organization[field].filter((item) => item !== value);
    if (next.length === 0) return;
    await saveOrganization({
      ...workspace.organization,
      [field]: next,
    });
  };

  const openUserModal = (existing?: OrgUser) => {
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
    if (!uName.trim() || !uEmail.trim()) return;
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
    setBackupFeedback({ type: 'ok', message: 'JSON workspace backup downloaded successfully.' });
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
        setBackupFeedback({ type: 'err', message: checked.error });
        return;
      }
      setBackupFeedback(null);
      setPendingRestore(checked.data);
    } catch {
      setBackupFeedback({ type: 'err', message: 'Selected file is not valid JSON.' });
    }
  };

  const confirmRestore = async () => {
    if (!pendingRestore) return;
    await restoreBackup(pendingRestore);
    setPendingRestore(null);
    setBackupFeedback({ type: 'ok', message: 'Workspace backup restored cleanly.' });
  };

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'organization', label: 'Organization' },
    { id: 'taxonomies', label: 'Categories & Types' },
    { id: 'users', label: 'Users & Roles (RBAC)' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'backup', label: 'Backup & Storage' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings & System Configuration"
        description="Manage organization profile, IT taxonomies, role-based access control, theme preferences, and database backups."
      />

      <div role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-slate-900 text-slate-900 dark:border-sky-500 dark:text-sky-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Warranty Expiration Alert Lead Time (days)"
              htmlFor="org-war-days"
              error={orgErrors.warrantyAlertDays}
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

          {canManageOrg && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <Button type="submit">Save Organization Settings</Button>
            </div>
          )}
        </form>
      )}

      {/* TAXONOMIES TAB */}
      {activeTab === 'taxonomies' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[
            {
              title: 'Asset Categories',
              field: 'assetCategories' as const,
              items: workspace.organization.assetCategories,
              value: newAssetCat,
              setValue: setNewAssetCat,
              placeholder: 'Add category (e.g., Firewall)',
            },
            {
              title: 'Inventory Categories',
              field: 'inventoryCategories' as const,
              items: workspace.organization.inventoryCategories,
              value: newInvCat,
              setValue: setNewInvCat,
              placeholder: 'Add category (e.g., Fiber Optics)',
            },
            {
              title: 'Maintenance Types',
              field: 'maintenanceTypes' as const,
              items: workspace.organization.maintenanceTypes,
              value: newMaintType,
              setValue: setNewMaintType,
              placeholder: 'Add type (e.g., Firmware Audit)',
            },
          ].map((group) => (
            <section
              key={group.field}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
            >
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {group.title}
              </h2>
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
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                {group.items.map((item) => (
                  <li key={item} className="py-2 flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-300">{item}</span>
                    {canManageOrg && group.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTaxonomyItem(group.field, item)}
                        aria-label={`Remove ${item}`}
                        className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* USERS & RBAC TAB */}
      {activeTab === 'users' && (
        <div className="space-y-6">
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
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {ROLE_LABELS[roleKey]}
                  </p>
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
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 max-w-2xl">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Interface Theme
            </h2>
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
                  className={`text-left rounded-xl border p-4 transition-colors ${
                    selected
                      ? 'border-sky-600 bg-sky-50/60 dark:bg-sky-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
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
              JSON Backup &amp; Restore
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
          <Field label="Full Name" htmlFor="u-name" required>
            <Input id="u-name" value={uName} onChange={(e) => setUName(e.target.value)} required />
          </Field>
          <Field label="Work Email" htmlFor="u-email" required>
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
          setBackupFeedback({ type: 'ok', message: 'Local dataset reset to default seed data.' });
        }}
        onCancel={() => setResetConfirmOpen(false)}
      />
    </div>
  );
}

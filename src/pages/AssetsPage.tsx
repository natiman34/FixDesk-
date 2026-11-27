import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  ArrowUpDown,
  Download,
  Edit3,
  Eye,
  Plus,
  Printer,
  QrCode,
  Search,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { assetSchema } from '../core/validation/schemas';
import { getWarrantyStatus } from '../core/logic/operations';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusText,
  Textarea,
  Toast,
} from '../components/ui/Primitives';
import { formatCurrency, formatDate, todayIsoDate } from '../lib/utils';
import type { Asset, AssetCondition, AssetStatus } from '../core/types/domain';

const ASSET_STATUSES: AssetStatus[] = [
  'AVAILABLE',
  'ASSIGNED',
  'IN_REPAIR',
  'UNDER_MAINTENANCE',
  'RETIRED',
  'LOST',
  'DAMAGED',
  'DISPOSED',
];

const ASSET_CONDITIONS: AssetCondition[] = ['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'];

const COMPUTE_CATEGORIES = new Set(['Laptop', 'Desktop', 'Server', 'Tablet', 'Mobile Phone']);
const NETWORK_CATEGORIES = new Set([
  'Laptop',
  'Desktop',
  'Server',
  'Router',
  'Switch',
  'Access Point',
  'Printer',
  'UPS',
]);

function statusTone(status: AssetStatus): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'AVAILABLE':
      return 'success';
    case 'ASSIGNED':
      return 'info';
    case 'IN_REPAIR':
    case 'UNDER_MAINTENANCE':
      return 'warning';
    case 'LOST':
    case 'DAMAGED':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function AssetsPage() {
  const { workspace, can, saveAsset, deleteAsset } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [warrantyFilter, setWarrantyFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'assetTag' | 'name' | 'purchasePrice' | 'warrantyEnd'>('assetTag');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [formOpen, setFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const emptyForm = useMemo(() => {
    const defaultDept = workspace?.departments[0]?.id ?? 'dept-it';
    const defaultLoc = workspace?.locations[0]?.id ?? 'loc-hq';
    const nextNum = (workspace?.assets.length ?? 0) + 1;
    return {
      assetTag: `FX-AST-${String(nextNum).padStart(3, '0')}`,
      name: '',
      category: workspace?.organization.assetCategories[0] ?? 'Laptop',
      manufacturer: '',
      model: '',
      serialNumber: '',
      processor: '',
      ram: '',
      storage: '',
      operatingSystem: '',
      osVersion: '',
      macAddress: '',
      ipAddress: '',
      hostname: '',
      purchaseDate: todayIsoDate(),
      purchasePrice: 0,
      currency: workspace?.organization.currency ?? 'USD',
      vendor: '',
      warrantyStart: todayIsoDate(),
      warrantyEnd: '',
      condition: 'EXCELLENT' as AssetCondition,
      status: 'AVAILABLE' as AssetStatus,
      locationId: defaultLoc,
      departmentId: defaultDept,
      assignedEmployeeId: '',
      assignedTechnicianName: '',
      notes: '',
    };
  }, [workspace]);

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (searchParams.get('action') === 'register' && can('assets:create')) {
      setEditingAsset(null);
      setForm(emptyForm);
      setFormErrors({});
      setFormOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, can, emptyForm]);

  useEffect(() => {
    if (!selectedAsset) {
      setQrDataUrl('');
      return;
    }
    const assetLink = `${window.location.origin}/assets?q=${encodeURIComponent(selectedAsset.assetTag)}`;
    QRCode.toDataURL(assetLink, { width: 220, margin: 1 })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [selectedAsset]);

  const deptMap = useMemo(
    () => new Map(workspace?.departments.map((d) => [d.id, d.name]) ?? []),
    [workspace?.departments]
  );
  const locMap = useMemo(
    () => new Map(workspace?.locations.map((l) => [l.id, l.name]) ?? []),
    [workspace?.locations]
  );
  const empMap = useMemo(
    () => new Map(workspace?.employees.map((e) => [e.id, e]) ?? []),
    [workspace?.employees]
  );

  const filteredAssets = useMemo(() => {
    if (!workspace) return [];
    const q = query.trim().toLowerCase();
    const list = workspace.assets.filter((a) => {
      if (categoryFilter !== 'ALL' && a.category !== categoryFilter) return false;
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      if (deptFilter !== 'ALL' && a.departmentId !== deptFilter) return false;
      if (warrantyFilter !== 'ALL') {
        const ws = getWarrantyStatus(a.warrantyEnd, workspace.organization.warrantyAlertDays).status;
        if (ws !== warrantyFilter) return false;
      }
      if (!q) return true;
      const empName = empMap.get(a.assignedEmployeeId)?.fullName.toLowerCase() ?? '';
      const deptName = (deptMap.get(a.departmentId) ?? '').toLowerCase();
      const locName = (locMap.get(a.locationId) ?? '').toLowerCase();
      return (
        a.assetTag.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.serialNumber.toLowerCase().includes(q) ||
        a.manufacturer.toLowerCase().includes(q) ||
        a.model.toLowerCase().includes(q) ||
        a.hostname.toLowerCase().includes(q) ||
        a.ipAddress.toLowerCase().includes(q) ||
        empName.includes(q) ||
        deptName.includes(q) ||
        locName.includes(q)
      );
    });

    return list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortBy === 'purchasePrice') return (a.purchasePrice - b.purchasePrice) * dir;
      return String(a[sortBy] ?? '').localeCompare(String(b[sortBy] ?? '')) * dir;
    });
  }, [workspace, query, categoryFilter, statusFilter, deptFilter, warrantyFilter, sortBy, sortDir, empMap, deptMap, locMap]);

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
  const pagedAssets = filteredAssets.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = useCallback((col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(col);
      setSortDir('asc');
    }
  }, [sortBy]);

  const openCreate = useCallback(() => {
    setEditingAsset(null);
    setForm(emptyForm);
    setFormErrors({});
    setFormOpen(true);
  }, [emptyForm]);

  const openEdit = useCallback((asset: Asset) => {
    setEditingAsset(asset);
    setForm({
      assetTag: asset.assetTag,
      name: asset.name,
      category: asset.category,
      manufacturer: asset.manufacturer,
      model: asset.model,
      serialNumber: asset.serialNumber,
      processor: asset.processor,
      ram: asset.ram,
      storage: asset.storage,
      operatingSystem: asset.operatingSystem,
      osVersion: asset.osVersion,
      macAddress: asset.macAddress,
      ipAddress: asset.ipAddress,
      hostname: asset.hostname,
      purchaseDate: asset.purchaseDate,
      purchasePrice: asset.purchasePrice,
      currency: asset.currency,
      vendor: asset.vendor,
      warrantyStart: asset.warrantyStart,
      warrantyEnd: asset.warrantyEnd,
      condition: asset.condition,
      status: asset.status,
      locationId: asset.locationId,
      departmentId: asset.departmentId,
      assignedEmployeeId: asset.assignedEmployeeId,
      assignedTechnicianName: asset.assignedTechnicianName,
      notes: asset.notes,
    });
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = assetSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!errs[key]) errs[key] = issue.message;
      }
      setFormErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      await saveAsset({
        ...parsed.data,
        id: editingAsset?.id,
      });
      setFormOpen(false);
      setToast({
        type: 'success',
        message: editingAsset ? 'Asset updated successfully' : 'Asset registered successfully',
      });
    } catch (err) {
      setToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save asset',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const downloadQr = useCallback(() => {
    if (!qrDataUrl || !selectedAsset) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `${selectedAsset.assetTag}-qr.png`;
    link.click();
  }, [qrDataUrl, selectedAsset]);

  const copyAssetLink = useCallback(() => {
    if (!selectedAsset) return;
    const assetLink = `${window.location.origin}/assets?q=${encodeURIComponent(selectedAsset.assetTag)}`;
    navigator.clipboard.writeText(assetLink).then(() => {
      setToast({ type: 'success', message: 'Asset link copied to clipboard' });
    });
  }, [selectedAsset]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAsset(deleteTarget.id);
      setDeleteTarget(null);
      setToast({ type: 'success', message: 'Asset deleted successfully' });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete asset' });
    }
  };

  if (!workspace) return null;

  const assetAssignments = selectedAsset
    ? workspace.assignments.filter((a) => a.assetId === selectedAsset.id)
    : [];
  const assetMaintenance = selectedAsset
    ? workspace.maintenance.filter((m) => m.assetId === selectedAsset.id)
    : [];
  const assetLogs = selectedAsset
    ? workspace.activityLogs.filter((l) => l.entityId === selectedAsset.id)
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="IT Asset Registry"
        description="Register, inspect, tag, and track hardware lifecycles, warranties, specifications, and QR labels."
        actions={
          can('assets:create') && (
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4" />
              Register Asset
            </Button>
          )
        }
      />

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Search & Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="relative xl:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search tag, serial, employee, IP, hostname..."
            aria-label="Search assets"
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Filter by category"
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All Categories</option>
          {workspace.organization.assetCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All Statuses</option>
          {ASSET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by department"
          value={deptFilter}
          onChange={(e) => {
            setDeptFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All Departments</option>
          {workspace.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by warranty"
          value={warrantyFilter}
          onChange={(e) => {
            setWarrantyFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All Warranties</option>
          <option value="ACTIVE">Active Warranty</option>
          <option value="EXPIRING_SOON">Expiring Soon</option>
          <option value="EXPIRED">Expired Warranty</option>
          <option value="NONE">No Warranty Recorded</option>
        </Select>
      </div>

      {/* Table */}
      {filteredAssets.length === 0 ? (
        <EmptyState
          title="No matching IT assets"
          description="Adjust your search filters or register a new hardware asset in the registry."
          action={
            can('assets:create') && (
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4" />
                Register Asset
              </Button>
            )
          }
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" role="grid">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('assetTag')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                      aria-sort={sortBy === 'assetTag' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      Asset Tag <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('name')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                      aria-sort={sortBy === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      Asset / Model <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 font-medium">Category</th>
                  <th className="py-3 px-4 font-medium">Assigned / Location</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('warrantyEnd')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                      aria-sort={sortBy === 'warrantyEnd' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      Warranty <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pagedAssets.map((asset) => {
                  const emp = empMap.get(asset.assignedEmployeeId);
                  const w = getWarrantyStatus(asset.warrantyEnd, workspace.organization.warrantyAlertDays);
                  return (
                    <tr key={asset.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {asset.assetTag}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{asset.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                          {asset.manufacturer} · S/N {asset.serialNumber}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {asset.category}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {emp ? emp.fullName : 'Unassigned'}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">
                          {deptMap.get(asset.departmentId) ?? '—'} · {locMap.get(asset.locationId) ?? '—'}
                        </p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusText tone={statusTone(asset.status)} label={asset.status.replace(/_/g, ' ')} />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusText
                          tone={
                            w.status === 'EXPIRED'
                              ? 'danger'
                              : w.status === 'EXPIRING_SOON'
                              ? 'warning'
                              : w.status === 'ACTIVE'
                              ? 'success'
                              : 'neutral'
                          }
                          label={
                            w.status === 'NONE'
                              ? 'None'
                              : w.status === 'EXPIRED'
                              ? 'Expired'
                              : w.status === 'EXPIRING_SOON'
                              ? `${w.daysRemaining}d left`
                              : formatDate(asset.warrantyEnd)
                          }
                        />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`View ${asset.assetTag}`}
                            onClick={() => setSelectedAsset(asset)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Details</span>
                          </Button>
                          {can('assets:edit') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Edit ${asset.assetTag}`}
                              onClick={() => openEdit(asset)}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Edit</span>
                            </Button>
                          )}
                          {can('assets:delete') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Delete ${asset.assetTag}`}
                              onClick={() => setDeleteTarget(asset)}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span className="tabular-nums">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredAssets.length)} of{' '}
              {filteredAssets.length} assets
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="tabular-nums">
                Page {page} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Register / Edit Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingAsset ? `Edit Asset · ${editingAsset.assetTag}` : 'Register New IT Asset'}
        subtitle="Capture hardware specifications, network identifiers, warranty dates, and custody assignment."
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Asset Tag" htmlFor="assetTag" required error={formErrors.assetTag}>
              <Input
                id="assetTag"
                value={form.assetTag}
                onChange={(e) => setForm({ ...form, assetTag: e.target.value })}
                placeholder="FX-LPT-099"
                autoComplete="off"
              />
            </Field>
            <Field label="Asset Name" htmlFor="assetName" required error={formErrors.name}>
              <Input
                id="assetName"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Lenovo ThinkPad T14 Gen 5"
              />
            </Field>
            <Field label="Category" htmlFor="assetCategory" required error={formErrors.category}>
              <Select
                id="assetCategory"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {workspace.organization.assetCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Manufacturer" htmlFor="manufacturer" required error={formErrors.manufacturer}>
              <Input
                id="manufacturer"
                value={form.manufacturer}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                placeholder="Lenovo / Dell / HP / Cisco"
              />
            </Field>
            <Field label="Model" htmlFor="model" required error={formErrors.model}>
              <Input
                id="model"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="ThinkPad T14 Gen 5"
              />
            </Field>
            <Field label="Serial Number" htmlFor="serialNumber" required error={formErrors.serialNumber}>
              <Input
                id="serialNumber"
                value={form.serialNumber}
                onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                placeholder="PF5T14-9821A"
              />
            </Field>
          </div>

          {COMPUTE_CATEGORIES.has(form.category) && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Compute & OS Specifications
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Processor" htmlFor="processor">
                  <Input
                    id="processor"
                    value={form.processor}
                    onChange={(e) => setForm({ ...form, processor: e.target.value })}
                    placeholder="Intel Core Ultra 7"
                  />
                </Field>
                <Field label="RAM" htmlFor="ram">
                  <Input
                    id="ram"
                    value={form.ram}
                    onChange={(e) => setForm({ ...form, ram: e.target.value })}
                    placeholder="16 GB DDR5"
                  />
                </Field>
                <Field label="Storage" htmlFor="storage">
                  <Input
                    id="storage"
                    value={form.storage}
                    onChange={(e) => setForm({ ...form, storage: e.target.value })}
                    placeholder="512 GB NVMe SSD"
                  />
                </Field>
                <Field label="Operating System" htmlFor="os">
                  <Input
                    id="os"
                    value={form.operatingSystem}
                    onChange={(e) => setForm({ ...form, operatingSystem: e.target.value })}
                    placeholder="Windows 11 Pro"
                  />
                </Field>
                <Field label="OS Version" htmlFor="osVersion">
                  <Input
                    id="osVersion"
                    value={form.osVersion}
                    onChange={(e) => setForm({ ...form, osVersion: e.target.value })}
                    placeholder="24H2"
                  />
                </Field>
              </div>
            </div>
          )}

          {NETWORK_CATEGORIES.has(form.category) && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Network Identifiers
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Hostname" htmlFor="hostname">
                  <Input
                    id="hostname"
                    value={form.hostname}
                    onChange={(e) => setForm({ ...form, hostname: e.target.value })}
                    placeholder="MRF-HQ-LPT099"
                  />
                </Field>
                <Field label="IPv4 Address" htmlFor="ipAddress" error={formErrors.ipAddress}>
                  <Input
                    id="ipAddress"
                    value={form.ipAddress}
                    onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
                    placeholder="10.20.10.99"
                  />
                </Field>
                <Field label="MAC Address" htmlFor="macAddress" error={formErrors.macAddress}>
                  <Input
                    id="macAddress"
                    value={form.macAddress}
                    onChange={(e) => setForm({ ...form, macAddress: e.target.value })}
                    placeholder="AA:BB:CC:DD:EE:FF"
                  />
                </Field>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Procurement, Warranty & Lifecycle
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Purchase Date" htmlFor="purchaseDate">
                <Input
                  id="purchaseDate"
                  type="date"
                  value={form.purchaseDate}
                  onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                />
              </Field>
              <Field label="Purchase Price" htmlFor="purchasePrice" error={formErrors.purchasePrice}>
                <Input
                  id="purchasePrice"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.purchasePrice}
                  onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })}
                />
              </Field>
              <Field label="Vendor" htmlFor="vendor">
                <Input
                  id="vendor"
                  value={form.vendor}
                  onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                  placeholder="CDW / Dell Direct"
                />
              </Field>
              <Field label="Warranty Start" htmlFor="warrantyStart">
                <Input
                  id="warrantyStart"
                  type="date"
                  value={form.warrantyStart}
                  onChange={(e) => setForm({ ...form, warrantyStart: e.target.value })}
                />
              </Field>
              <Field label="Warranty End" htmlFor="warrantyEnd">
                <Input
                  id="warrantyEnd"
                  type="date"
                  value={form.warrantyEnd}
                  onChange={(e) => setForm({ ...form, warrantyEnd: e.target.value })}
                />
              </Field>
              <Field label="Condition" htmlFor="condition" required>
                <Select
                  id="condition"
                  value={form.condition}
                  onChange={(e) => setForm({ ...form, condition: e.target.value as AssetCondition })}
                >
                  {ASSET_CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status" htmlFor="status" required>
                <Select
                  id="status"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as AssetStatus })}
                >
                  {ASSET_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Department" htmlFor="departmentId" required error={formErrors.departmentId}>
                <Select
                  id="departmentId"
                  value={form.departmentId}
                  onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                >
                  {workspace.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Location" htmlFor="locationId" required error={formErrors.locationId}>
                <Select
                  id="locationId"
                  value={form.locationId}
                  onChange={(e) => setForm({ ...form, locationId: e.target.value })}
                >
                  {workspace.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Operational Notes" htmlFor="assetNotes">
              <Textarea
                id="assetNotes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="BitLocker status, rack U-position, accessories, or warranty notes..."
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : editingAsset ? 'Save Changes' : 'Register Asset'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Asset Details & QR Code Modal */}
      <Modal
        open={Boolean(selectedAsset)}
        onClose={() => setSelectedAsset(null)}
        title={selectedAsset ? `${selectedAsset.assetTag} — ${selectedAsset.name}` : 'Asset Details'}
        subtitle={selectedAsset ? `${selectedAsset.manufacturer} ${selectedAsset.model} · S/N ${selectedAsset.serialNumber}` : undefined}
        size="xl"
      >
        {selectedAsset && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="md:col-span-2 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <StatusText tone={statusTone(selectedAsset.status)} label={selectedAsset.status.replace(/_/g, ' ')} />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Condition</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{selectedAsset.condition}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Department & Location</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {deptMap.get(selectedAsset.departmentId) ?? '—'} · {locMap.get(selectedAsset.locationId) ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Assigned Custodian</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {empMap.get(selectedAsset.assignedEmployeeId)?.fullName ?? 'Unassigned'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Purchase Info</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                    {formatCurrency(selectedAsset.purchasePrice, selectedAsset.currency)} · {formatDate(selectedAsset.purchaseDate)}
                  </p>
                  <p className="text-xs text-slate-500">{selectedAsset.vendor || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Warranty Period</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                    {formatDate(selectedAsset.warrantyStart)} – {formatDate(selectedAsset.warrantyEnd)}
                  </p>
                </div>
                {(selectedAsset.processor || selectedAsset.ram || selectedAsset.storage) && (
                  <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-slate-500 mb-1">Technical Specifications</p>
                    <p className="text-xs font-mono text-slate-700 dark:text-slate-300">
                      {[selectedAsset.processor, selectedAsset.ram, selectedAsset.storage, selectedAsset.operatingSystem, selectedAsset.osVersion]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                )}
                {(selectedAsset.hostname || selectedAsset.ipAddress || selectedAsset.macAddress) && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 mb-1">Network Profile</p>
                    <p className="text-xs font-mono text-slate-700 dark:text-slate-300">
                      {[
                        selectedAsset.hostname && `Host: ${selectedAsset.hostname}`,
                        selectedAsset.ipAddress && `IP: ${selectedAsset.ipAddress}`,
                        selectedAsset.macAddress && `MAC: ${selectedAsset.macAddress}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                )}
                {selectedAsset.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 mb-1">Notes</p>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{selectedAsset.notes}</p>
                  </div>
                )}
              </div>

              {/* QR Asset Label Card */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col items-center justify-between text-center bg-slate-50 dark:bg-slate-950/60">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Asset QR Label</span>
                </div>
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR code for ${selectedAsset.assetTag}`}
                    className="w-36 h-36 my-3 rounded-lg bg-white p-2 border border-slate-200"
                  />
                ) : (
                  <div className="w-36 h-36 my-3 rounded-lg bg-slate-200 dark:bg-slate-800" />
                )}
                <p className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                  {selectedAsset.assetTag}
                </p>
                <p className="text-[11px] text-slate-500 font-mono truncate max-w-full">
                  S/N {selectedAsset.serialNumber}
                </p>
                <div className="flex items-center gap-2 mt-3 w-full">
                  <Button size="sm" variant="secondary" className="flex-1" onClick={downloadQr}>
                    <Download className="w-3.5 h-3.5" />
                    PNG
                  </Button>
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => window.print()}>
                    <Printer className="w-3.5 h-3.5" />
                    Print
                  </Button>
                  <Button size="sm" variant="ghost" className="flex-1" onClick={copyAssetLink}>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Link
                  </Button>
                </div>
              </div>
            </div>

            {/* Lifecycle History Tabs Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Assignment History ({assetAssignments.length})
                </h3>
                {assetAssignments.length === 0 ? (
                  <p className="text-xs text-slate-500">No assignments recorded for this asset.</p>
                ) : (
                  <ul className="space-y-2">
                    {assetAssignments.map((asg) => (
                      <li key={asg.id} className="text-xs border-b border-slate-100 dark:border-slate-800 pb-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {asg.actionType} → {empMap.get(asg.employeeId)?.fullName ?? asg.employeeId}
                        </span>
                        <span className="text-slate-500 ml-2 tabular-nums">
                          {formatDate(asg.assignedDate)}
                          {asg.returnDate ? ` to ${formatDate(asg.returnDate)}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Maintenance & Audit Events ({assetMaintenance.length + assetLogs.length})
                </h3>
                {assetMaintenance.length === 0 && assetLogs.length === 0 ? (
                  <p className="text-xs text-slate-500">No maintenance or audit events yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {assetMaintenance.map((m) => (
                      <li key={m.id} className="text-xs border-b border-slate-100 dark:border-slate-800 pb-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {m.maintenanceType} ({m.status})
                        </span>
                        <span className="text-slate-500 ml-2 tabular-nums">{formatDate(m.scheduledDate)}</span>
                      </li>
                    ))}
                    {assetLogs.slice(0, 4).map((l) => (
                      <li key={l.id} className="text-xs text-slate-600 dark:text-slate-400">
                        {l.summary}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete IT Asset"
        message={`Remove ${deleteTarget?.assetTag} (${deleteTarget?.name}) from the registry? This action is recorded in the Activity Log.`}
        confirmLabel="Delete Asset"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
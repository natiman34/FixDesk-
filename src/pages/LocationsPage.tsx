import React, { useState, useCallback } from 'react';
import { Edit3, MapPin, Plus, Trash2, Download, Building2, Users, Package } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { locationSchema } from '../core/validation/schemas';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Toast,
  KPICard,
} from '../components/ui/Primitives';
import type { Location, LocationType } from '../core/types/domain';

const LOCATION_TYPES: LocationType[] = [
  'HEADQUARTERS',
  'BRANCH_OFFICE',
  'BUILDING',
  'SERVER_ROOM',
  'WAREHOUSE',
  'FIELD_SITE',
];

export function LocationsPage() {
  const { workspace, can, saveLocation, deleteLocation } = useWorkspace();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    code: '',
    type: 'BRANCH_OFFICE' as LocationType,
    address: '',
    city: '',
    country: '',
  });

  if (!workspace) return null;

  const openNew = useCallback(() => {
    setEditing(null);
    setForm({ name: '', code: '', type: 'BRANCH_OFFICE', address: '', city: '', country: '' });
    setErrors({});
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((loc: Location) => {
    setEditing(loc);
    setForm({
      name: loc.name,
      code: loc.code,
      type: loc.type,
      address: loc.address,
      city: loc.city,
      country: loc.country,
    });
    setErrors({});
    setModalOpen(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = locationSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      await saveLocation({ ...parsed.data, id: editing?.id });
      setModalOpen(false);
      setToast({
        type: 'success',
        message: editing ? 'Location updated successfully' : 'Location added successfully',
      });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save location' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteLocation(deleteTarget.id);
      setDeleteTarget(null);
      setToast({ type: 'success', message: 'Location deleted successfully' });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete location' });
    }
  };

  const handleExportCSV = () => {
    const headers = ['Code', 'Name', 'Type', 'Address', 'City', 'Country', 'Assets', 'Employees', 'Stock SKUs'];
    const rows = workspace.locations.map((loc) => [
      loc.code,
      loc.name,
      loc.type.replace(/_/g, ' '),
      loc.address,
      loc.city,
      loc.country,
      String(workspace.assets.filter((a) => a.locationId === loc.id).length),
      String(workspace.employees.filter((e) => e.locationId === loc.id).length),
      String(workspace.inventory.filter((i) => i.locationId === loc.id).length),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `locations-${workspace.organization.slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setToast({ type: 'success', message: 'Locations exported to CSV' });
  };

  const totalAssets = workspace.assets.length;
  const totalEmployees = workspace.employees.length;
  const totalStock = workspace.inventory.length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Offices & Locations"
        description="Manage headquarters, regional branches, server rooms, warehouses, and field sites."
        actions={
          <>
            {can('locations:manage') && (
              <Button onClick={handleExportCSV} variant="secondary">
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            )}
            {can('locations:manage') && (
              <Button onClick={openNew}>
                <Plus className="w-4 h-4" />
                Add Location
              </Button>
            )}
          </>
        }
      />

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Total Locations"
          value={workspace.locations.length}
          sub={`${workspace.locations.filter((l) => l.type === 'HEADQUARTERS').length} HQ`}
          tone="default"
          icon={Building2}
        />
        <KPICard
          label="Assets Distributed"
          value={totalAssets}
          sub="Across all sites"
          tone="info"
          icon={Package}
        />
        <KPICard
          label="Employees Located"
          value={totalEmployees}
          sub="Assigned to offices"
          tone="success"
          icon={Users}
        />
        <KPICard
          label="Stock SKUs Stored"
          value={totalStock}
          sub="In warehouses & rooms"
          tone="default"
          icon={Package}
        />
      </div>

      {workspace.locations.length === 0 ? (
        <EmptyState
          title="No office locations configured"
          description="Add your headquarters, server rooms, and branch offices to map assets and inventory."
          action={
            can('locations:manage') && (
              <Button onClick={openNew}>
                <Plus className="w-4 h-4" />
                Create First Location
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workspace.locations.map((loc) => {
            const assetsCount = workspace.assets.filter((a) => a.locationId === loc.id).length;
            const empCount = workspace.employees.filter((e) => e.locationId === loc.id).length;
            const invCount = workspace.inventory.filter((i) => i.locationId === loc.id).length;
            return (
              <div
                key={loc.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4 animate-fade-in"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-sky-700 dark:text-sky-400">{loc.code}</span>
                      <span aria-hidden="true">·</span>
                      <span>{loc.type.replace(/_/g, ' ')}</span>
                    </div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{loc.name}</h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        {[loc.address, loc.city, loc.country].filter(Boolean).join(', ') || 'No street address'}
                      </span>
                    </p>
                  </div>
                  {can('locations:manage') && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" aria-label={`Edit ${loc.name}`} onClick={() => openEdit(loc)}>
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${loc.name}`}
                        onClick={() => setDeleteTarget(loc)}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                  <span>
                    <strong className="text-slate-900 dark:text-slate-100">{assetsCount}</strong> assets
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    <strong className="text-slate-900 dark:text-slate-100">{empCount}</strong> employees
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    <strong className="text-slate-900 dark:text-slate-100">{invCount}</strong> stock SKUs
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Location · ${editing.name}` : 'Add Office / Site Location'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Field label="Location Name" htmlFor="locName" required error={errors.name}>
                <Input
                  id="locName"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Regional Office — Kigali"
                />
              </Field>
            </div>
            <Field label="Site Code" htmlFor="locCode" required error={errors.code}>
              <Input
                id="locCode"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="KGL-01"
              />
            </Field>
          </div>
          <Field label="Site Type" htmlFor="locType" required>
            <Select
              id="locType"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as LocationType })}
            >
              {LOCATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Street Address" htmlFor="locAddr">
            <Input
              id="locAddr"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="City" htmlFor="locCity">
              <Input
                id="locCity"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </Field>
            <Field label="Country" htmlFor="locCountry">
              <Input
                id="locCountry"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : editing ? 'Save Location' : 'Add Location'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Location"
        message={`Delete location "${deleteTarget?.name}"? Assets linked to this site should be reassigned to another location.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
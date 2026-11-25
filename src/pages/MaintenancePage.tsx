import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Edit3, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { isMaintenanceOverdue } from '../core/logic/operations';
import { maintenanceSchema } from '../core/validation/schemas';
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
} from '../components/ui/Primitives';
import { formatCurrency, formatDate, todayIsoDate } from '../lib/utils';
import type {
  MaintenanceRecurrence,
  MaintenanceRecord,
  MaintenanceStatus,
} from '../core/types/domain';

const MAINT_STATUSES: MaintenanceStatus[] = [
  'SCHEDULED',
  'IN_PROGRESS',
  'PENDING_PARTS',
  'COMPLETED',
  'CANCELLED',
];

export function MaintenancePage() {
  const { workspace, can, saveMaintenance, deleteMaintenance } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();

  const [statusFilter, setStatusFilter] = useState<'ALL' | MaintenanceStatus>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceRecord | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const emptyForm = useMemo(
    () => ({
      assetId: workspace?.assets[0]?.id ?? '',
      maintenanceType: workspace?.organization.maintenanceTypes[0] ?? 'Preventive Maintenance',
      technicianName: 'David Okafor',
      scheduledDate: todayIsoDate(),
      completionDate: '',
      recurrence: 'NONE' as MaintenanceRecurrence,
      customIntervalDays: 30,
      status: 'SCHEDULED' as MaintenanceStatus,
      description: '',
      issue: '',
      workPerformed: '',
      partsUsed: '',
      cost: 0,
      currency: workspace?.organization.currency ?? 'USD',
      notes: '',
    }),
    [workspace]
  );

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (searchParams.get('action') === 'new' && can('maintenance:manage')) {
      setEditing(null);
      setForm(emptyForm);
      setErrors({});
      setModalOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, can, emptyForm]);

  if (!workspace) return null;

  const assetMap = new Map(workspace.assets.map((a) => [a.id, a]));
  const currency = workspace.organization.currency;

  const upcomingCount = workspace.maintenance.filter(
    (m) => m.status !== 'COMPLETED' && m.status !== 'CANCELLED' && !isMaintenanceOverdue(m)
  ).length;
  const overdueCount = workspace.maintenance.filter((m) => isMaintenanceOverdue(m)).length;
  const completedCount = workspace.maintenance.filter((m) => m.status === 'COMPLETED').length;
  const totalCost = workspace.maintenance.reduce((acc, m) => acc + Number(m.cost || 0), 0);

  const filtered = workspace.maintenance
    .filter((m) => (statusFilter === 'ALL' ? true : m.status === statusFilter))
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = maintenanceSchema.safeParse({
      ...form,
      customIntervalDays: form.recurrence === 'CUSTOM' ? form.customIntervalDays : undefined,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      return;
    }
    await saveMaintenance({
      ...parsed.data,
      id: editing?.id,
    });
    setModalOpen(false);
  };

  const quickComplete = async (record: MaintenanceRecord) => {
    await saveMaintenance({
      ...record,
      status: 'COMPLETED',
      completionDate: todayIsoDate(),
      workPerformed: record.workPerformed || 'Completed maintenance and verified nominal operation.',
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Preventive & Corrective Maintenance"
        description="Schedule recurring inspections, log hardware repairs, track technician workload, and monitor maintenance costs."
        actions={
          can('maintenance:manage') && (
            <Button
              onClick={() => {
                setEditing(null);
                setForm(emptyForm);
                setErrors({});
                setModalOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Schedule Maintenance
            </Button>
          )
        }
      />

      {/* Maintenance Dashboard Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Upcoming Scheduled</p>
          <p className="text-2xl font-bold tabular-nums text-sky-700 dark:text-sky-400 mt-1">{upcomingCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Overdue Tasks</p>
          <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400 mt-1">{overdueCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Completed Records</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
            {completedCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Total Maintenance Cost</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {formatCurrency(totalCost, currency)}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 w-fit">
        {(['ALL', ...MAINT_STATUSES] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              statusFilter === st
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {st === 'ALL' ? 'All' : st.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No maintenance records match this filter"
          description="Schedule preventive maintenance or log a hardware repair to track asset health."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Asset</th>
                  <th className="py-3 px-4 font-medium">Type &amp; Summary</th>
                  <th className="py-3 px-4 font-medium">Technician</th>
                  <th className="py-3 px-4 font-medium">Schedule / Recurrence</th>
                  <th className="py-3 px-4 font-medium text-right">Cost</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((m) => {
                  const asset = assetMap.get(m.assetId);
                  const overdue = isMaintenanceOverdue(m);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {asset?.assetTag ?? m.assetId}
                        </p>
                        <p className="text-xs text-slate-500">{asset?.name ?? '—'}</p>
                      </td>
                      <td className="py-3 px-4 max-w-sm">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{m.maintenanceType}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.description}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {m.technicianName}
                      </td>
                      <td className="py-3 px-4 text-xs tabular-nums whitespace-nowrap">
                        <p className={overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-800 dark:text-slate-200'}>
                          {formatDate(m.scheduledDate)} {overdue ? '(Overdue)' : ''}
                        </p>
                        <p className="text-slate-500">
                          {m.recurrence === 'NONE'
                            ? 'One-time'
                            : m.recurrence === 'CUSTOM'
                            ? `Every ${m.customIntervalDays ?? 30}d`
                            : m.recurrence}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        {formatCurrency(m.cost, m.currency)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusText
                          tone={
                            m.status === 'COMPLETED'
                              ? 'success'
                              : overdue || m.status === 'PENDING_PARTS'
                              ? 'danger'
                              : m.status === 'IN_PROGRESS'
                              ? 'warning'
                              : m.status === 'SCHEDULED'
                              ? 'info'
                              : 'neutral'
                          }
                          label={m.status.replace(/_/g, ' ')}
                        />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {can('maintenance:manage') && m.status !== 'COMPLETED' && m.status !== 'CANCELLED' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void quickComplete(m)}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Complete
                            </Button>
                          )}
                          {can('maintenance:manage') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Edit maintenance ${m.id}`}
                              onClick={() => {
                                setEditing(m);
                                setForm({
                                  assetId: m.assetId,
                                  maintenanceType: m.maintenanceType,
                                  technicianName: m.technicianName,
                                  scheduledDate: m.scheduledDate,
                                  completionDate: m.completionDate ?? '',
                                  recurrence: m.recurrence,
                                  customIntervalDays: m.customIntervalDays ?? 30,
                                  status: m.status,
                                  description: m.description,
                                  issue: m.issue,
                                  workPerformed: m.workPerformed,
                                  partsUsed: m.partsUsed,
                                  cost: m.cost,
                                  currency: m.currency,
                                  notes: m.notes,
                                });
                                setErrors({});
                                setModalOpen(true);
                              }}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {can('assets:delete') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Delete maintenance ${m.id}`}
                              onClick={() => setDeleteTarget(m)}
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
        </div>
      )}

      {/* Schedule / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Update Maintenance Record' : 'Schedule / Record Maintenance'}
        subtitle="Completing a recurring maintenance task automatically schedules its next interval."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Target IT Asset" htmlFor="mntAsset" required error={errors.assetId}>
              <Select
                id="mntAsset"
                value={form.assetId}
                onChange={(e) => setForm({ ...form, assetId: e.target.value })}
              >
                {workspace.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.assetTag} — {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Maintenance Type" htmlFor="mntType" required>
              <Select
                id="mntType"
                value={form.maintenanceType}
                onChange={(e) => setForm({ ...form, maintenanceType: e.target.value })}
              >
                {workspace.organization.maintenanceTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assigned Technician" htmlFor="mntTech" required error={errors.technicianName}>
              <Input
                id="mntTech"
                value={form.technicianName}
                onChange={(e) => setForm({ ...form, technicianName: e.target.value })}
              />
            </Field>
            <Field label="Status" htmlFor="mntStatus" required>
              <Select
                id="mntStatus"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as MaintenanceStatus })}
              >
                {MAINT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Scheduled Date" htmlFor="mntDate" required error={errors.scheduledDate}>
              <Input
                id="mntDate"
                type="date"
                value={form.scheduledDate}
                onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
              />
            </Field>
            <Field label="Recurrence Schedule" htmlFor="mntRec" required>
              <Select
                id="mntRec"
                value={form.recurrence}
                onChange={(e) => setForm({ ...form, recurrence: e.target.value as MaintenanceRecurrence })}
              >
                <option value="NONE">One-Time</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="ANNUAL">Annual</option>
                <option value="CUSTOM">Custom Interval (Days)</option>
              </Select>
            </Field>
            {form.recurrence === 'CUSTOM' && (
              <Field label="Custom Interval (Days)" htmlFor="mntDays">
                <Input
                  id="mntDays"
                  type="number"
                  min={1}
                  max={1095}
                  value={form.customIntervalDays}
                  onChange={(e) => setForm({ ...form, customIntervalDays: Number(e.target.value) })}
                />
              </Field>
            )}
            <Field label="Cost" htmlFor="mntCost" error={errors.cost}>
              <Input
                id="mntCost"
                type="number"
                min={0}
                step="0.01"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Description / Scope" htmlFor="mntDesc" required error={errors.description}>
            <Textarea
              id="mntDesc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe preventive inspection steps or repair scope..."
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Observed Issue" htmlFor="mntIssue">
              <Input
                id="mntIssue"
                value={form.issue}
                onChange={(e) => setForm({ ...form, issue: e.target.value })}
              />
            </Field>
            <Field label="Parts Used" htmlFor="mntParts">
              <Input
                id="mntParts"
                value={form.partsUsed}
                onChange={(e) => setForm({ ...form, partsUsed: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Work Performed" htmlFor="mntWork">
            <Textarea
              id="mntWork"
              value={form.workPerformed}
              onChange={(e) => setForm({ ...form, workPerformed: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editing ? 'Save Record' : 'Schedule Maintenance'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Maintenance Record"
        message="Delete this maintenance record permanently? This action will be recorded in the Activity Log."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await deleteMaintenance(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

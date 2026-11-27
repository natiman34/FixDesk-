import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckSquare, Edit3, Eye, Plus, Search, UserCheck, UserX, Download } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { employeeSchema } from '../core/validation/schemas';
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
  KPICard,
} from '../components/ui/Primitives';
import { formatDate, getInitials, todayIsoDate } from '../lib/utils';
import type { Employee } from '../core/types/domain';

export function EmployeesPage() {
  const { workspace, can, saveEmployee } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [detailEmp, setDetailEmp] = useState<Employee | null>(null);
  const [exitChecklist, setExitChecklist] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emptyForm = useMemo(
    () => ({
      employeeCode: `MRF-${1001 + (workspace?.employees.length ?? 0)}`,
      fullName: '',
      email: '',
      phone: '',
      departmentId: workspace?.departments[0]?.id ?? 'dept-it',
      locationId: workspace?.locations[0]?.id ?? 'loc-hq',
      position: '',
      managerName: '',
      status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
      startDate: todayIsoDate(),
      notes: '',
    }),
    [workspace]
  );

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (searchParams.get('action') === 'new' && can('employees:manage')) {
      setEditing(null);
      setForm(emptyForm);
      setErrors({});
      setFormOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, can, emptyForm]);

  if (!workspace) return null;

  const deptMap = new Map(workspace.departments.map((d) => [d.id, d.name]));
  const locMap = new Map(workspace.locations.map((l) => [l.id, l.name]));
  const assetMap = new Map(workspace.assets.map((a) => [a.id, a]));

  const filtered = workspace.employees.filter((e) => {
    if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
    if (deptFilter !== 'ALL' && e.departmentId !== deptFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      e.fullName.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.employeeCode.toLowerCase().includes(q) ||
      e.position.toLowerCase().includes(q)
    );
  });

  const activeCount = workspace.employees.filter((e) => e.status === 'ACTIVE').length;
  const inactiveCount = workspace.employees.filter((e) => e.status === 'INACTIVE').length;
  const totalAssetsAssigned = workspace.assets.filter((a) => a.assignedEmployeeId).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = employeeSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      await saveEmployee({ ...parsed.data, id: editing?.id });
      setFormOpen(false);
      setToast({
        type: 'success',
        message: editing ? 'Employee updated successfully' : 'Employee added successfully',
      });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save employee' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (emp: Employee) => {
    try {
      await saveEmployee({
        ...emp,
        status: emp.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      });
      setToast({
        type: 'success',
        message: emp.status === 'ACTIVE' ? 'Employee deactivated' : 'Employee reactivated',
      });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update status' });
    }
  };

  const empAssignedAssets = detailEmp
    ? workspace.assets.filter((a) => a.assignedEmployeeId === detailEmp.id)
    : [];
  const empHistory = detailEmp
    ? workspace.assignments.filter((asg) => asg.employeeId === detailEmp.id)
    : [];

  const handleExportCSV = () => {
    const headers = ['Employee ID', 'Full Name', 'Email', 'Phone', 'Department', 'Location', 'Position', 'Manager', 'Status', 'Start Date', 'Assigned Assets'];
    const rows = workspace.employees.map((emp) => [
      emp.employeeCode,
      emp.fullName,
      emp.email,
      emp.phone,
      deptMap.get(emp.departmentId) ?? '—',
      locMap.get(emp.locationId) ?? '—',
      emp.position,
      emp.managerName,
      emp.status,
      emp.startDate,
      String(workspace.assets.filter((a) => a.assignedEmployeeId === emp.id).length),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `employees-${workspace.organization.slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setToast({ type: 'success', message: 'Employee directory exported to CSV' });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Employee Directory"
        description="Manage staff profiles, office assignments, active IT equipment custody, and offboarding return checklists. Deactivating an employee preserves all asset history."
        actions={
          <>
            {can('employees:manage') && (
              <Button onClick={handleExportCSV} variant="secondary">
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            )}
            {can('employees:manage') && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm);
                  setErrors({});
                  setFormOpen(true);
                }}
              >
                <Plus className="w-4 h-4" />
                Add Employee
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
          label="Total Employees"
          value={workspace.employees.length}
          sub={`${activeCount} active · ${inactiveCount} inactive`}
          tone="default"
          icon={UserCheck}
        />
        <KPICard
          label="Active Staff"
          value={activeCount}
          sub={`${workspace.departments.length} departments`}
          tone="success"
          icon={UserCheck}
          trend={{ value: '+2', positive: true }}
        />
        <KPICard
          label="Assets Assigned"
          value={totalAssetsAssigned}
          sub="Currently in custody"
          tone="info"
          icon={Eye}
        />
        <KPICard
          label="Departments"
          value={workspace.departments.length}
          sub={`${workspace.locations.length} locations`}
          tone="default"
          icon={Search}
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, employee ID, email, position..."
            aria-label="Search employees"
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Filter employees by department"
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="w-48"
        >
          <option value="ALL">All Departments</option>
          {workspace.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter employees by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
          className="w-36"
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching employees"
          description="Try a different search filter or add a new staff member to the directory."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" role="grid">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Employee</th>
                  <th className="py-3 px-4 font-medium">Department & Office</th>
                  <th className="py-3 px-4 font-medium">Position</th>
                  <th className="py-3 px-4 font-medium text-right">Assigned Assets</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((emp) => {
                  const assignedCount = workspace.assets.filter((a) => a.assignedEmployeeId === emp.id).length;
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center shrink-0">
                            {getInitials(emp.fullName)}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">{emp.fullName}</p>
                            <p className="text-xs text-slate-500 font-mono">
                              {emp.employeeCode} · {emp.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {deptMap.get(emp.departmentId) ?? '—'}
                        </p>
                        <p className="text-slate-500">{locMap.get(emp.locationId) ?? '—'}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">{emp.position}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold tabular-nums">
                        {assignedCount}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText
                          tone={emp.status === 'ACTIVE' ? 'success' : 'neutral'}
                          label={emp.status}
                        />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetailEmp(emp)}
                            aria-label={`View profile for ${emp.fullName}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Profile</span>
                          </Button>
                          {can('employees:manage') && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Edit ${emp.fullName}`}
                                onClick={() => {
                                  setEditing(emp);
                                  setForm({
                                    employeeCode: emp.employeeCode,
                                    fullName: emp.fullName,
                                    email: emp.email,
                                    phone: emp.phone,
                                    departmentId: emp.departmentId,
                                    locationId: emp.locationId,
                                    position: emp.position,
                                    managerName: emp.managerName,
                                    status: emp.status,
                                    startDate: emp.startDate,
                                    notes: emp.notes,
                                  });
                                  setErrors({});
                                  setFormOpen(true);
                                }}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={emp.status === 'ACTIVE' ? `Deactivate ${emp.fullName}` : `Reactivate ${emp.fullName}`}
                                onClick={() => toggleStatus(emp)}
                              >
                                {emp.status === 'ACTIVE' ? (
                                  <UserX className="w-3.5 h-3.5 text-amber-600" />
                                ) : (
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                                )}
                              </Button>
                            </>
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

      {/* Add / Edit Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit Employee · ${editing.fullName}` : 'Add Employee'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Employee ID" htmlFor="empCode" required error={errors.employeeCode}>
              <Input
                id="empCode"
                value={form.employeeCode}
                onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
              />
            </Field>
            <Field label="Full Name" htmlFor="empName" required error={errors.fullName}>
              <Input
                id="empName"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </Field>
            <Field label="Work Email" htmlFor="empEmail" required error={errors.email}>
              <Input
                id="empEmail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Phone" htmlFor="empPhone">
              <Input
                id="empPhone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Department" htmlFor="empDept" required>
              <Select
                id="empDept"
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
            <Field label="Office Location" htmlFor="empLoc" required>
              <Select
                id="empLoc"
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
            <Field label="Position / Title" htmlFor="empPos" required error={errors.position}>
              <Input
                id="empPos"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
              />
            </Field>
            <Field label="Manager" htmlFor="empMgr">
              <Input
                id="empMgr"
                value={form.managerName}
                onChange={(e) => setForm({ ...form, managerName: e.target.value })}
              />
            </Field>
            <Field label="Start Date" htmlFor="empStart">
              <Input
                id="empStart"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </Field>
            <Field label="Status" htmlFor="empStatus" required>
              <Select
                id="empStatus"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </Field>
          </div>
          <Field label="Notes" htmlFor="empNotes">
            <Textarea
              id="empNotes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Add Employee'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Employee Details + Exit Checklist Modal */}
      <Modal
        open={Boolean(detailEmp)}
        onClose={() => setDetailEmp(null)}
        title={detailEmp ? `${detailEmp.fullName} (${detailEmp.employeeCode})` : 'Employee Profile'}
        subtitle={
          detailEmp
            ? `${detailEmp.position} · ${deptMap.get(detailEmp.departmentId) ?? '—'} · ${locMap.get(detailEmp.locationId) ?? '—'}`
            : undefined
        }
        size="xl"
      >
        {detailEmp && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="text-slate-500">Email</p>
                <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{detailEmp.email}</p>
              </div>
              <div>
                <p className="text-slate-500">Phone</p>
                <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{detailEmp.phone || '—'}</p>
              </div>
              <div>
                <p className="text-slate-500">Manager</p>
                <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{detailEmp.managerName || '—'}</p>
              </div>
              <div>
                <p className="text-slate-500">Start Date</p>
                <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
                  {formatDate(detailEmp.startDate)}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Currently Assigned IT Equipment ({empAssignedAssets.length})
              </h3>
              {empAssignedAssets.length === 0 ? (
                <p className="text-xs text-slate-500">No IT assets currently assigned to this employee.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                  {empAssignedAssets.map((a) => (
                    <div key={a.id} className="px-3 py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {a.assetTag}
                        </span>
                        <span className="ml-2 text-slate-700 dark:text-slate-300">{a.name}</span>
                        <span className="ml-2 text-slate-400 font-mono">S/N {a.serialNumber}</span>
                      </div>
                      <StatusText tone="info" label={a.condition} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Assignment & Return History ({empHistory.length})
                </h3>
                {empHistory.length === 0 ? (
                  <p className="text-xs text-slate-500">No historical handovers recorded.</p>
                ) : (
                  <ul className="space-y-2">
                    {empHistory.map((h) => (
                      <li key={h.id} className="text-xs border-b border-slate-100 dark:border-slate-800 pb-2">
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {assetMap.get(h.assetId)?.assetTag ?? h.assetId}
                        </span>{' '}
                        · {h.actionType} ({h.status}) · {formatDate(h.assignedDate)}
                        {h.returnDate ? ` → Returned ${formatDate(h.returnDate)}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2.5 bg-slate-50 dark:bg-slate-950/50">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <CheckSquare className="w-3.5 h-3.5 text-sky-600" />
                  <span>Employee Exit & Equipment Return Checklist</span>
                </div>
                {[
                  'All assigned laptops, monitors, and mobile units returned',
                  'Power adapters, docks, and carrying bags verified',
                  'Physical condition inspected and logged in FixDesk',
                  'Device storage encrypted/sanitized per NIST 800-88',
                  'Access credentials and VPN certificates revoked',
                ].map((label, idx) => {
                  const key = `${detailEmp.id}-${idx}`;
                  return (
                    <label key={key} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(exitChecklist[key])}
                        onChange={(e) =>
                          setExitChecklist((prev) => ({ ...prev, [key]: e.target.checked }))
                        }
                        className="mt-0.5 rounded border-slate-300"
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
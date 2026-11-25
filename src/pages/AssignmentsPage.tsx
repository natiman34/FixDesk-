import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, CheckCircle2, FileText, Plus, Printer, RotateCcw } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { assignAssetSchema, returnAssetSchema } from '../core/validation/schemas';
import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusText,
  Textarea,
} from '../components/ui/Primitives';
import { formatDate, todayIsoDate } from '../lib/utils';
import type { AssetAssignment, AssetCondition, AssetStatus } from '../core/types/domain';

export function AssignmentsPage() {
  const { workspace, can, assignAsset, returnAsset, transferAsset } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'RETURNED' | 'TRANSFERRED'>('ALL');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [returnTarget, setReturnTarget] = useState<AssetAssignment | null>(null);
  const [transferTarget, setTransferTarget] = useState<AssetAssignment | null>(null);
  const [handoverDoc, setHandoverDoc] = useState<AssetAssignment | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const availableAssets = useMemo(
    () => workspace?.assets.filter((a) => a.status === 'AVAILABLE') ?? [],
    [workspace?.assets]
  );
  const activeEmployees = useMemo(
    () => workspace?.employees.filter((e) => e.status === 'ACTIVE') ?? [],
    [workspace?.employees]
  );

  const [assignForm, setAssignForm] = useState({
    assetId: '',
    employeeId: '',
    departmentId: '',
    locationId: '',
    conditionAtHandover: 'EXCELLENT' as AssetCondition,
    accessories: 'Power Adapter, Carrying Case',
    assignedDate: todayIsoDate(),
    notes: '',
    acknowledged: true,
  });

  const [returnForm, setReturnForm] = useState({
    returnDate: todayIsoDate(),
    conditionAtReturn: 'GOOD' as AssetCondition,
    missingAccessories: 'None',
    resultingStatus: 'AVAILABLE' as 'AVAILABLE' | 'IN_REPAIR' | 'DAMAGED' | 'RETIRED',
    notes: '',
  });

  const [transferForm, setTransferForm] = useState({
    toEmployeeId: '',
    toDepartmentId: '',
    toLocationId: '',
    notes: '',
  });

  const openAssignModal = () => {
    const firstEmp = activeEmployees[0];
    setAssignForm({
      assetId: availableAssets[0]?.id ?? '',
      employeeId: firstEmp?.id ?? '',
      departmentId: firstEmp?.departmentId ?? workspace?.departments[0]?.id ?? '',
      locationId: firstEmp?.locationId ?? workspace?.locations[0]?.id ?? '',
      conditionAtHandover: 'EXCELLENT',
      accessories: '65W USB-C Power Adapter, Laptop Sleeve',
      assignedDate: todayIsoDate(),
      notes: '',
      acknowledged: true,
    });
    setErrors({});
    setAssignModalOpen(true);
  };

  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'assign' && can('assignments:manage')) {
      openAssignModal();
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    } else if (action === 'return' && can('assignments:manage') && workspace) {
      const firstActive = workspace.assignments.find((a) => a.status === 'ACTIVE');
      if (firstActive) setReturnTarget(firstActive);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (!workspace) return null;

  const assetMap = new Map(workspace.assets.map((a) => [a.id, a]));
  const empMap = new Map(workspace.employees.map((e) => [e.id, e]));
  const deptMap = new Map(workspace.departments.map((d) => [d.id, d.name]));
  const locMap = new Map(workspace.locations.map((l) => [l.id, l.name]));

  const filtered = workspace.assignments.filter((a) =>
    statusFilter === 'ALL' ? true : a.status === statusFilter
  );

  const activeCount = workspace.assignments.filter((a) => a.status === 'ACTIVE').length;
  const returnedCount = workspace.assignments.filter((a) => a.status === 'RETURNED').length;
  const transferredCount = workspace.assignments.filter((a) => a.status === 'TRANSFERRED').length;

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = assignAssetSchema.safeParse(assignForm);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      return;
    }
    const created = await assignAsset(parsed.data);
    setAssignModalOpen(false);
    setHandoverDoc(created);
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnTarget) return;
    const parsed = returnAssetSchema.safeParse({
      assignmentId: returnTarget.id,
      ...returnForm,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      return;
    }
    await returnAsset({
      assignmentId: returnTarget.id,
      returnDate: parsed.data.returnDate,
      conditionAtReturn: parsed.data.conditionAtReturn,
      missingAccessories: parsed.data.missingAccessories,
      resultingStatus: parsed.data.resultingStatus as AssetStatus,
      notes: parsed.data.notes,
    });
    setReturnTarget(null);
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTarget || !transferForm.toEmployeeId) return;
    await transferAsset({
      assetId: transferTarget.assetId,
      toEmployeeId: transferForm.toEmployeeId,
      toDepartmentId: transferForm.toDepartmentId,
      toLocationId: transferForm.toLocationId,
      notes: transferForm.notes,
    });
    setTransferTarget(null);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Asset Assignments & Handovers"
        description="Issue available IT equipment to employees, process returns with condition checklists, transfer custody, and generate printable handover forms."
        actions={
          can('assignments:manage') && (
            <Button onClick={openAssignModal} disabled={availableAssets.length === 0}>
              <Plus className="w-4 h-4" />
              Assign Equipment
            </Button>
          )
        }
      />

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Active Assignments</p>
          <p className="text-2xl font-bold tabular-nums text-sky-700 dark:text-sky-400 mt-1">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Available Assets Ready</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
            {availableAssets.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Completed Returns</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-1">{returnedCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Custody Transfers</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {transferredCount}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 w-fit">
        {(['ALL', 'ACTIVE', 'RETURNED', 'TRANSFERRED'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setStatusFilter(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              statusFilter === tab
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {tab === 'ALL' ? 'All Records' : tab}
          </button>
        ))}
      </div>

      {/* Assignments Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No assignment records"
          description="Assign an available asset to an employee to start tracking custody and handover history."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Asset</th>
                  <th className="py-3 px-4 font-medium">Employee / Dept</th>
                  <th className="py-3 px-4 font-medium">Accessories</th>
                  <th className="py-3 px-4 font-medium">Assigned / Returned</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Workflow Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((asg) => {
                  const asset = assetMap.get(asg.assetId);
                  const emp = empMap.get(asg.employeeId);
                  return (
                    <tr key={asg.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <p className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {asset?.assetTag ?? asg.assetId}
                        </p>
                        <p className="text-xs text-slate-500">{asset?.name ?? 'Unknown asset'}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {emp?.fullName ?? asg.employeeId}
                        </p>
                        <p className="text-xs text-slate-500">
                          {deptMap.get(asg.departmentId) ?? '—'} · {locMap.get(asg.locationId) ?? '—'}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 max-w-xs truncate">
                        {asg.accessories || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs tabular-nums whitespace-nowrap">
                        <p className="text-slate-800 dark:text-slate-200">Issued {formatDate(asg.assignedDate)}</p>
                        {asg.returnDate && (
                          <p className="text-slate-500">Returned {formatDate(asg.returnDate)}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusText
                          tone={
                            asg.status === 'ACTIVE'
                              ? 'info'
                              : asg.status === 'RETURNED'
                              ? 'success'
                              : 'neutral'
                          }
                          label={asg.status}
                        />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setHandoverDoc(asg)}>
                            <FileText className="w-3.5 h-3.5" />
                            Handover
                          </Button>
                          {asg.status === 'ACTIVE' && can('assignments:manage') && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  const nextEmp = activeEmployees.find((e) => e.id !== asg.employeeId) ?? activeEmployees[0];
                                  setTransferForm({
                                    toEmployeeId: nextEmp?.id ?? '',
                                    toDepartmentId: nextEmp?.departmentId ?? workspace.departments[0]?.id ?? '',
                                    toLocationId: nextEmp?.locationId ?? workspace.locations[0]?.id ?? '',
                                    notes: '',
                                  });
                                  setTransferTarget(asg);
                                }}
                              >
                                <ArrowLeftRight className="w-3.5 h-3.5" />
                                Transfer
                              </Button>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => {
                                  setReturnForm({
                                    returnDate: todayIsoDate(),
                                    conditionAtReturn: 'GOOD',
                                    missingAccessories: 'None',
                                    resultingStatus: 'AVAILABLE',
                                    notes: '',
                                  });
                                  setErrors({});
                                  setReturnTarget(asg);
                                }}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Return
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

      {/* Assign Equipment Modal */}
      <Modal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="Assign IT Equipment"
        subtitle="Select an available asset and custodian to generate a tracked handover record."
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <Field label="Available Asset" htmlFor="assignAssetId" required error={errors.assetId}>
            <Select
              id="assignAssetId"
              value={assignForm.assetId}
              onChange={(e) => setAssignForm({ ...assignForm, assetId: e.target.value })}
            >
              <option value="">Select available asset...</option>
              {availableAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.assetTag} — {a.name} ({a.serialNumber})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Employee Custodian" htmlFor="assignEmployeeId" required error={errors.employeeId}>
            <Select
              id="assignEmployeeId"
              value={assignForm.employeeId}
              onChange={(e) => {
                const emp = activeEmployees.find((x) => x.id === e.target.value);
                setAssignForm({
                  ...assignForm,
                  employeeId: e.target.value,
                  departmentId: emp?.departmentId ?? assignForm.departmentId,
                  locationId: emp?.locationId ?? assignForm.locationId,
                });
              }}
            >
              <option value="">Select employee...</option>
              {activeEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} ({emp.employeeCode} · {emp.position})
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Department" htmlFor="assignDept" required>
              <Select
                id="assignDept"
                value={assignForm.departmentId}
                onChange={(e) => setAssignForm({ ...assignForm, departmentId: e.target.value })}
              >
                {workspace.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Location" htmlFor="assignLoc" required>
              <Select
                id="assignLoc"
                value={assignForm.locationId}
                onChange={(e) => setAssignForm({ ...assignForm, locationId: e.target.value })}
              >
                {workspace.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Condition at Handover" htmlFor="assignCond" required>
              <Select
                id="assignCond"
                value={assignForm.conditionAtHandover}
                onChange={(e) =>
                  setAssignForm({ ...assignForm, conditionAtHandover: e.target.value as AssetCondition })
                }
              >
                {(['EXCELLENT', 'GOOD', 'FAIR', 'POOR'] as const).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assignment Date" htmlFor="assignDate" required>
              <Input
                id="assignDate"
                type="date"
                value={assignForm.assignedDate}
                onChange={(e) => setAssignForm({ ...assignForm, assignedDate: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Included Accessories" htmlFor="assignAcc">
            <Input
              id="assignAcc"
              value={assignForm.accessories}
              onChange={(e) => setAssignForm({ ...assignForm, accessories: e.target.value })}
              placeholder="Charger, USB-C dock, laptop sleeve, mouse..."
            />
          </Field>

          <Field label="Handover Notes" htmlFor="assignNotes">
            <Textarea
              id="assignNotes"
              value={assignForm.notes}
              onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
              placeholder="Record BitLocker confirmation, serial verification, or special handling notes..."
            />
          </Field>

          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={assignForm.acknowledged}
              onChange={(e) => setAssignForm({ ...assignForm, acknowledged: e.target.checked })}
              className="rounded border-slate-300"
            />
            Employee acknowledged receipt of equipment and accessories
          </label>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              <CheckCircle2 className="w-4 h-4" />
              Confirm Assignment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Return Equipment Modal */}
      <Modal
        open={Boolean(returnTarget)}
        onClose={() => setReturnTarget(null)}
        title="Process Equipment Return"
        subtitle={
          returnTarget
            ? `${assetMap.get(returnTarget.assetId)?.assetTag ?? returnTarget.assetId} from ${
                empMap.get(returnTarget.employeeId)?.fullName ?? returnTarget.employeeId
              }`
            : undefined
        }
      >
        <form onSubmit={handleReturnSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Return Date" htmlFor="returnDate" required>
              <Input
                id="returnDate"
                type="date"
                value={returnForm.returnDate}
                onChange={(e) => setReturnForm({ ...returnForm, returnDate: e.target.value })}
              />
            </Field>
            <Field label="Inspected Condition" htmlFor="returnCond" required>
              <Select
                id="returnCond"
                value={returnForm.conditionAtReturn}
                onChange={(e) =>
                  setReturnForm({ ...returnForm, conditionAtReturn: e.target.value as AssetCondition })
                }
              >
                {(['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Update Asset Status To" htmlFor="returnStatus" required>
            <Select
              id="returnStatus"
              value={returnForm.resultingStatus}
              onChange={(e) =>
                setReturnForm({
                  ...returnForm,
                  resultingStatus: e.target.value as 'AVAILABLE' | 'IN_REPAIR' | 'DAMAGED' | 'RETIRED',
                })
              }
            >
              <option value="AVAILABLE">Available (Ready for Reassignment)</option>
              <option value="IN_REPAIR">In Repair (Needs Service)</option>
              <option value="DAMAGED">Damaged</option>
              <option value="RETIRED">Retired</option>
            </Select>
          </Field>

          <Field label="Missing Accessories" htmlFor="missingAcc">
            <Input
              id="missingAcc"
              value={returnForm.missingAccessories}
              onChange={(e) => setReturnForm({ ...returnForm, missingAccessories: e.target.value })}
            />
          </Field>

          <Field label="Inspection & Wipe Notes" htmlFor="returnNotes">
            <Textarea
              id="returnNotes"
              value={returnForm.notes}
              onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })}
              placeholder="Screen check, battery health, SSD sanitization status..."
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setReturnTarget(null)}>
              Cancel
            </Button>
            <Button type="submit">Complete Return</Button>
          </div>
        </form>
      </Modal>

      {/* Transfer Equipment Modal */}
      <Modal
        open={Boolean(transferTarget)}
        onClose={() => setTransferTarget(null)}
        title="Transfer Asset Custody"
        subtitle="Reassign active equipment to another employee, department, or office location."
      >
        <form onSubmit={handleTransferSubmit} className="space-y-4">
          <Field label="New Custodian Employee" htmlFor="transferEmp" required>
            <Select
              id="transferEmp"
              value={transferForm.toEmployeeId}
              onChange={(e) => {
                const emp = activeEmployees.find((x) => x.id === e.target.value);
                setTransferForm({
                  ...transferForm,
                  toEmployeeId: e.target.value,
                  toDepartmentId: emp?.departmentId ?? transferForm.toDepartmentId,
                  toLocationId: emp?.locationId ?? transferForm.toLocationId,
                });
              }}
            >
              {activeEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} ({emp.employeeCode})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Destination Department" htmlFor="transferDept" required>
              <Select
                id="transferDept"
                value={transferForm.toDepartmentId}
                onChange={(e) => setTransferForm({ ...transferForm, toDepartmentId: e.target.value })}
              >
                {workspace.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Destination Location" htmlFor="transferLoc" required>
              <Select
                id="transferLoc"
                value={transferForm.toLocationId}
                onChange={(e) => setTransferForm({ ...transferForm, toLocationId: e.target.value })}
              >
                {workspace.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Transfer Reason / Notes" htmlFor="transferNotes">
            <Textarea
              id="transferNotes"
              value={transferForm.notes}
              onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
              placeholder="Department reallocation, staff role change, or field hub deployment..."
            />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setTransferTarget(null)}>
              Cancel
            </Button>
            <Button type="submit">Confirm Transfer</Button>
          </div>
        </form>
      </Modal>

      {/* Printable Handover Form Modal */}
      <Modal
        open={Boolean(handoverDoc)}
        onClose={() => setHandoverDoc(null)}
        title="IT Equipment Handover Certificate"
        subtitle="Printable organizational custody agreement"
        size="lg"
      >
        {handoverDoc && (
          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-5 space-y-4 bg-white dark:bg-slate-950">
              <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {workspace.organization.name}
                  </p>
                  <p className="text-xs text-slate-500">IT Operations · Equipment Handover Form</p>
                </div>
                <p className="font-mono text-xs text-slate-500">REF: {handoverDoc.id}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Custodian</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {empMap.get(handoverDoc.employeeId)?.fullName ?? handoverDoc.employeeId}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Department / Office</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {deptMap.get(handoverDoc.departmentId) ?? '—'} · {locMap.get(handoverDoc.locationId) ?? '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Asset Tag &amp; Model</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {assetMap.get(handoverDoc.assetId)?.assetTag} — {assetMap.get(handoverDoc.assetId)?.name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Serial Number</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {assetMap.get(handoverDoc.assetId)?.serialNumber ?? '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Handover Date</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                    {formatDate(handoverDoc.assignedDate)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Condition at Handover</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {handoverDoc.conditionAtHandover}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 block">Accessories Issued</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {handoverDoc.accessories || 'Standard unit only'}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-2 border-t border-slate-100 dark:border-slate-800">
                I acknowledge receipt of the above organizational IT equipment in the stated condition and agree to comply with the IT Equipment Care &amp; Return Policy.
              </p>

              <div className="grid grid-cols-2 gap-6 pt-6 text-xs text-slate-500">
                <div className="border-t border-slate-300 dark:border-slate-700 pt-2">
                  Employee Signature &amp; Date
                </div>
                <div className="border-t border-slate-300 dark:border-slate-700 pt-2">
                  IT Custodian ({handoverDoc.performedBy})
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 no-print">
              <Button variant="secondary" onClick={() => setHandoverDoc(null)}>
                Close
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="w-4 h-4" />
                Print Handover Form
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

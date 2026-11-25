import React, { useState } from 'react';
import { Edit3, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { departmentSchema } from '../core/validation/schemas';
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
import type { Department } from '../core/types/domain';

export function DepartmentsPage() {
  const { workspace, can, saveDepartment, deleteDepartment } = useWorkspace();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: '',
    code: '',
    headName: '',
    description: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });

  if (!workspace) return null;

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', code: '', headName: '', description: '', status: 'ACTIVE' });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (dept: Department) => {
    setEditing(dept);
    setForm({
      name: dept.name,
      code: dept.code,
      headName: dept.headName,
      description: dept.description,
      status: dept.status,
    });
    setErrors({});
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = departmentSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      return;
    }
    await saveDepartment({ ...parsed.data, id: editing?.id });
    setModalOpen(false);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Departments & Teams"
        description="Configure your organizational structure and inspect employee and IT asset allocations per unit."
        actions={
          can('departments:manage') && (
            <Button onClick={openNew}>
              <Plus className="w-4 h-4" />
              Add Department
            </Button>
          )
        }
      />

      {workspace.departments.length === 0 ? (
        <EmptyState
          title="No departments configured"
          description="Create departments such as Finance, HR, Programs, Procurement, Operations, and IT."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspace.departments.map((dept) => {
            const empCount = workspace.employees.filter((e) => e.departmentId === dept.id).length;
            const assetCount = workspace.assets.filter((a) => a.departmentId === dept.id).length;
            return (
              <div
                key={dept.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs font-semibold text-sky-700 dark:text-sky-400">
                        {dept.code}
                      </p>
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {dept.name}
                      </h2>
                    </div>
                    <StatusText
                      tone={dept.status === 'ACTIVE' ? 'success' : 'neutral'}
                      label={dept.status}
                    />
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {dept.description || 'No description provided.'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Lead: <span className="font-medium text-slate-700 dark:text-slate-300">{dept.headName || '—'}</span>
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                    <span>
                      <strong className="text-slate-900 dark:text-slate-100">{empCount}</strong> staff
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      <strong className="text-slate-900 dark:text-slate-100">{assetCount}</strong> assets
                    </span>
                  </div>

                  {can('departments:manage') && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" aria-label={`Edit ${dept.name}`} onClick={() => openEdit(dept)}>
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${dept.name}`}
                        onClick={() => setDeleteTarget(dept)}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Department · ${editing.name}` : 'Create Department'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Field label="Department Name" htmlFor="deptName" required error={errors.name}>
                <Input
                  id="deptName"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Field Programs"
                />
              </Field>
            </div>
            <Field label="Code" htmlFor="deptCode" required error={errors.code}>
              <Input
                id="deptCode"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="PRG"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Department Head" htmlFor="deptHead">
              <Input
                id="deptHead"
                value={form.headName}
                onChange={(e) => setForm({ ...form, headName: e.target.value })}
              />
            </Field>
            <Field label="Status" htmlFor="deptStatus" required>
              <Select
                id="deptStatus"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </Field>
          </div>
          <Field label="Description" htmlFor="deptDesc">
            <Textarea
              id="deptDesc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editing ? 'Save Changes' : 'Create Department'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Department"
        message={`Delete department "${deleteTarget?.name}"? Existing assets and employees referencing it will remain in the database.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await deleteDepartment(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

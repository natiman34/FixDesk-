import React from 'react';
import { Cloud, HardDrive, Laptop, ShieldCheck, Wrench, Database } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../components/ui/Primitives';

export function LoginPage() {
  const { signInWithGoogle, enterLocalOfflineMode, loading, error } = useWorkspace();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row">
      {/* Left Brand & Architecture Panel */}
      <div className="lg:w-[46%] bg-slate-900 text-slate-100 p-8 lg:p-14 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-600 text-white flex items-center justify-center">
            <HardDrive className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">FixDesk</span>
        </div>

        <div className="my-10 space-y-6 max-w-lg">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight text-balance">
            IT Asset Management &amp; Operations Platform
          </h1>
          <p className="text-sm lg:text-base text-slate-300 leading-relaxed">
            Built for NGOs, schools, internal IT departments, and field technicians. Manage hardware lifecycles, equipment handovers, spare parts inventory, preventive maintenance, documentation, and network diagnostics from one unified workspace.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sky-400 text-sm font-semibold">
                <Laptop className="w-4 h-4" />
                <span>Asset &amp; Handover Control</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Track serials, warranties, QR labels, staff handovers, transfers, and certified returns.
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sky-400 text-sm font-semibold">
                <Wrench className="w-4 h-4" />
                <span>Preventive Maintenance</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Schedule recurring inspections, track repair costs, and prevent stockouts on spare parts.
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sky-400 text-sm font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Multi-Tenant &amp; RBAC</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Organization-isolated records, 6 operational roles, and immutable audit trails.
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sky-400 text-sm font-semibold">
                <Database className="w-4 h-4" />
                <span>Offline-First Ready</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Shared repository architecture for cloud multi-user web and local offline operations.
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          FixDesk · Dedicated IT Asset, Inventory &amp; Infrastructure Operations
        </p>
      </div>

      {/* Right Sign-In Panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-14">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Sign in to FixDesk
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Choose your cloud multi-tenant workspace or launch the local offline environment.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="space-y-2">
              <Button
                onClick={() => void signInWithGoogle()}
                disabled={loading}
                size="lg"
                className="w-full"
              >
                <Cloud className="w-4 h-4" />
                {loading ? 'Connecting...' : 'Sign in with Google (Cloud Workspace)'}
              </Button>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Authenticates via Firebase Auth and stores organization records in your isolated Cloud Firestore database.
              </p>
            </div>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
              <span className="mx-3 text-xs text-slate-400">or work offline</span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
            </div>

            <div className="space-y-2">
              <Button
                variant="secondary"
                onClick={() => void enterLocalOfflineMode()}
                disabled={loading}
                size="lg"
                className="w-full"
              >
                <HardDrive className="w-4 h-4" />
                Open Local Offline Workspace
              </Button>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Runs completely offline with persistent local storage, Meridian Relief Foundation seed data, full RBAC role preview, and JSON backup/restore.
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <p className="font-medium text-slate-700 dark:text-slate-300">
              Security &amp; Data Scope
            </p>
            <p>
              All mutations are validated against shared Zod schemas and logged to an immutable activity trail. Cloud workspaces isolate data strictly by verified organization membership.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

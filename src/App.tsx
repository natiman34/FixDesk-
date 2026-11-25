import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { ErrorBoundary } from './components/ui/Primitives';
import { AppShell } from './components/layout/AppShell';
import type { Permission } from './core/permissions/rbac';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AssetsPage } from './pages/AssetsPage';
import { AssignmentsPage } from './pages/AssignmentsPage';
import { InventoryPage } from './pages/InventoryPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { DepartmentsPage } from './pages/DepartmentsPage';
import { LocationsPage } from './pages/LocationsPage';
import { MaintenancePage } from './pages/MaintenancePage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';
import { NetworkToolsPage } from './pages/NetworkToolsPage';
import { ReportsPage } from './pages/ReportsPage';
import { ActivityLogPage } from './pages/ActivityLogPage';
import { SettingsPage } from './pages/SettingsPage';

function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: React.ReactNode;
}) {
  const { can } = useWorkspace();
  if (!can(permission)) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 max-w-xl mx-auto mt-8 text-center space-y-3">
        <ShieldAlert className="w-8 h-8 text-amber-600 dark:text-amber-400 mx-auto" />
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Role Access Restricted
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Your current role does not have permission to view this module. Contact your Organization
          Administrator if you need elevated operational access.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

function AuthenticatedApp() {
  const { session, workspace, authReady, loading } = useWorkspace();

  if (!authReady || (loading && !workspace)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 rounded-full border-2 border-slate-300 border-t-slate-900 dark:border-slate-700 dark:border-t-sky-500 animate-spin mx-auto" />
          <p className="text-sm font-medium">Loading FixDesk workspace...</p>
        </div>
      </div>
    );
  }

  if (!session || !workspace) {
    return <LoginPage />;
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/assets"
          element={
            <RequirePermission permission="assets:view">
              <AssetsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/assignments"
          element={
            <RequirePermission permission="assignments:view">
              <AssignmentsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/inventory"
          element={
            <RequirePermission permission="inventory:view">
              <InventoryPage />
            </RequirePermission>
          }
        />
        <Route
          path="/employees"
          element={
            <RequirePermission permission="employees:view">
              <EmployeesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/departments"
          element={
            <RequirePermission permission="departments:view">
              <DepartmentsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/locations"
          element={
            <RequirePermission permission="locations:view">
              <LocationsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/maintenance"
          element={
            <RequirePermission permission="maintenance:view">
              <MaintenancePage />
            </RequirePermission>
          }
        />
        <Route
          path="/knowledge-base"
          element={
            <RequirePermission permission="knowledge:view_employee">
              <KnowledgeBasePage />
            </RequirePermission>
          }
        />
        <Route
          path="/network-tools"
          element={
            <RequirePermission permission="network:use">
              <NetworkToolsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/reports"
          element={
            <RequirePermission permission="reports:view">
              <ReportsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/activity-log"
          element={
            <RequirePermission permission="audit:view">
              <ActivityLogPage />
            </RequirePermission>
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <WorkspaceProvider>
          <AuthenticatedApp />
        </WorkspaceProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

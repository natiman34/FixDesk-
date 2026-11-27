import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { ErrorBoundary } from './components/ui/Primitives';
import { AppShell } from './components/layout/AppShell';
import type { Permission } from './core/permissions/rbac';
import { LoginPage } from './pages/LoginPage';

// Lazy-loaded pages for code splitting
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const AssetsPage = lazy(() => import('./pages/AssetsPage').then((m) => ({ default: m.AssetsPage })));
const AssignmentsPage = lazy(() => import('./pages/AssignmentsPage').then((m) => ({ default: m.AssignmentsPage })));
const InventoryPage = lazy(() => import('./pages/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const EmployeesPage = lazy(() => import('./pages/EmployeesPage').then((m) => ({ default: m.EmployeesPage })));
const DepartmentsPage = lazy(() => import('./pages/DepartmentsPage').then((m) => ({ default: m.DepartmentsPage })));
const LocationsPage = lazy(() => import('./pages/LocationsPage').then((m) => ({ default: m.LocationsPage })));
const MaintenancePage = lazy(() => import('./pages/MaintenancePage').then((m) => ({ default: m.MaintenancePage })));
const KnowledgeBasePage = lazy(() => import('./pages/KnowledgeBasePage').then((m) => ({ default: m.KnowledgeBasePage })));
const NetworkToolsPage = lazy(() => import('./pages/NetworkToolsPage').then((m) => ({ default: m.NetworkToolsPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const ActivityLogPage = lazy(() => import('./pages/ActivityLogPage').then((m) => ({ default: m.ActivityLogPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

function PageLoader() {
  return (
    <div className="min-h-[400px] flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
      <div className="text-center space-y-3">
        <Loader2 className="w-8 h-8 text-sky-600 dark:text-sky-400 animate-spin mx-auto" />
        <p className="text-sm font-medium">Loading module...</p>
      </div>
    </div>
  );
}

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

function WithPermission({ permission, Component }: { permission: Permission; Component: React.ComponentType }) {
  return (
    <RequirePermission permission={permission}>
      <Suspense fallback={<PageLoader />}>
        <Component />
      </Suspense>
    </RequirePermission>
  );
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
        <Route path="/" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
        <Route path="/assets" element={<WithPermission permission="assets:view" Component={AssetsPage} />} />
        <Route path="/assignments" element={<WithPermission permission="assignments:view" Component={AssignmentsPage} />} />
        <Route path="/inventory" element={<WithPermission permission="inventory:view" Component={InventoryPage} />} />
        <Route path="/employees" element={<WithPermission permission="employees:view" Component={EmployeesPage} />} />
        <Route path="/departments" element={<WithPermission permission="departments:view" Component={DepartmentsPage} />} />
        <Route path="/locations" element={<WithPermission permission="locations:view" Component={LocationsPage} />} />
        <Route path="/maintenance" element={<WithPermission permission="maintenance:view" Component={MaintenancePage} />} />
        <Route path="/knowledge-base" element={<WithPermission permission="knowledge:view_employee" Component={KnowledgeBasePage} />} />
        <Route path="/network-tools" element={<WithPermission permission="network:use" Component={NetworkToolsPage} />} />
        <Route path="/reports" element={<WithPermission permission="reports:view" Component={ReportsPage} />} />
        <Route path="/activity-log" element={<WithPermission permission="audit:view" Component={ActivityLogPage} />} />
        <Route path="/settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
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
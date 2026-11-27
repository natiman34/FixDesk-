import React, { useMemo, useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  Laptop,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Moon,
  Network,
  Package,
  Search,
  Settings,
  Sun,
  Monitor,
  Users,
  Wrench,
  X,
  Shield,
  Database,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { ROLE_LABELS } from '../../core/permissions/rbac';
import { cn, formatDateTime, getInitials } from '../../lib/utils';
import type { UserRole } from '../../core/types/domain';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: Parameters<ReturnType<typeof useWorkspace>['can']>[0];
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard:view' },
  { to: '/assets', label: 'Assets', icon: Laptop, permission: 'assets:view' },
  { to: '/assignments', label: 'Assignments', icon: ArrowLeftRight, permission: 'assignments:view' },
  { to: '/inventory', label: 'Inventory', icon: Package, permission: 'inventory:view' },
  { to: '/employees', label: 'Employees', icon: Users, permission: 'employees:view' },
  { to: '/departments', label: 'Departments', icon: Building2, permission: 'departments:view' },
  { to: '/locations', label: 'Locations', icon: MapPin, permission: 'locations:view' },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench, permission: 'maintenance:view' },
  { to: '/knowledge-base', label: 'Knowledge Base', icon: BookOpen, permission: 'knowledge:view_employee' },
  { to: '/network-tools', label: 'Network Tools', icon: Network, permission: 'network:use' },
  { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports:view' },
  { to: '/activity-log', label: 'Activity Log', icon: Activity, permission: 'audit:view' },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    session,
    workspace,
    notifications,
    unreadCount,
    theme,
    setTheme,
    logout,
    can,
    setActiveRolePreview,
    markNotificationRead,
    markAllNotificationsRead,
    error,
    clearError,
  } = useWorkspace();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const visibleNav = useMemo(
    () => NAV_ITEMS.filter((item) => !item.permission || can(item.permission)),
    [can]
  );

  const activeNav = useMemo(
    () =>
      visibleNav.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to))) ??
      NAV_ITEMS[0],
    [location.pathname, visibleNav]
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !workspace) return [];
    const results: { type: string; title: string; subtitle: string; path: string }[] = [];

    for (const a of workspace.assets) {
      if (
        a.assetTag.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.serialNumber.toLowerCase().includes(q) ||
        a.hostname.toLowerCase().includes(q) ||
        a.ipAddress.toLowerCase().includes(q)
      ) {
        results.push({
          type: 'Asset',
          title: `${a.assetTag} — ${a.name}`,
          subtitle: `${a.category} · ${a.serialNumber}`,
          path: `/assets?q=${encodeURIComponent(a.assetTag)}`,
        });
      }
    }
    for (const e of workspace.employees) {
      if (e.fullName.toLowerCase().includes(q) || e.email.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q)) {
        results.push({
          type: 'Employee',
          title: e.fullName,
          subtitle: `${e.employeeCode} · ${e.position}`,
          path: `/employees?q=${encodeURIComponent(e.fullName)}`,
        });
      }
    }
    for (const i of workspace.inventory) {
      if (i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)) {
        results.push({
          type: 'Inventory',
          title: `${i.sku} — ${i.name}`,
          subtitle: `${i.quantity} ${i.unit} in stock`,
          path: `/inventory?q=${encodeURIComponent(i.sku)}`,
        });
      }
    }
    for (const k of workspace.knowledgeArticles) {
      if (k.title.toLowerCase().includes(q) || k.category.toLowerCase().includes(q)) {
        results.push({
          type: 'Article',
          title: k.title,
          subtitle: `${k.category} · ${k.status}`,
          path: `/knowledge-base?q=${encodeURIComponent(k.title)}`,
        });
      }
    }
    return results.slice(0, 8);
  }, [searchQuery, workspace]);

  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next);
  };

  const getThemeLabel = (t: 'light' | 'dark' | 'system') => {
    switch (t) {
      case 'light':
        return 'Light';
      case 'dark':
        return 'Dark';
      case 'system':
        return 'System';
    }
  };

  const getThemeIcon = (t: 'light' | 'dark' | 'system') => {
    switch (t) {
      case 'light':
        return <Sun className="w-4 h-4" />;
      case 'dark':
        return <Moon className="w-4 h-4" />;
      case 'system':
        return <Monitor className="w-4 h-4" />;
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-dropdown]')) {
        setNotifOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const renderSidebarLinks = (onClickItem?: () => void) => (
    <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5" data-sidebar-nav>
      {visibleNav.map((item) => {
        const Icon = item.icon;
        const isActive = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onClickItem}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 whitespace-nowrap',
              isActive
                ? 'bg-slate-900 text-white dark:bg-sky-600 dark:text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white'
            )}
            title={collapsed ? item.label : undefined}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon className={cn('w-4 h-4 shrink-0 transition-transform', isActive && 'scale-110')} />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-[width,padding] duration-200 ease-out no-print',
          collapsed ? 'w-16 p-0' : 'w-64'
        )}
        aria-label="Main navigation"
      >
        {!collapsed && (
          <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex items-center gap-2.5 text-left min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 p-2"
              aria-label="Go to Dashboard"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-sky-600 text-white flex items-center justify-center shrink-0">
                <HardDrive className="w-4 h-4" />
              </div>
              <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white truncate">
                FixDesk
              </span>
            </button>
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        )}

        {collapsed && (
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-16 h-14 flex items-center justify-center border-b border-slate-200 dark:border-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            aria-label="FixDesk - Go to Dashboard"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-sky-600 text-white flex items-center justify-center">
              <HardDrive className="w-4 h-4" />
            </div>
          </button>
        )}

        {!collapsed && workspace && (
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 animate-fade-in">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Organization</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate mt-0.5">
              {workspace.organization.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
              <Database className="w-3 h-3" />
              {session?.mode === 'cloud' ? 'Cloud Sync (Firestore)' : 'Local Offline Storage'}
            </p>
          </div>
        )}

        <div className={cn('flex-1 overflow-hidden', collapsed ? 'px-0' : 'px-2.5')}>
          {renderSidebarLinks()}
        </div>

        {!collapsed && session && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 animate-fade-in">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-sky-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                {getInitials(session.displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-700 dark:text-slate-300 truncate">{session.displayName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{ROLE_LABELS[session.role]}</p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex animate-fade-in" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 animate-slide-in-right">
            <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-sky-600 text-white flex items-center justify-center">
                  <HardDrive className="w-4 h-4" />
                </div>
                <span className="font-bold text-base text-slate-900 dark:text-white">FixDesk</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderSidebarLinks(() => setMobileNavOpen(false))}
            {session && (
              <div className="p-3 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-sky-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                    {getInitials(session.displayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-700 dark:text-slate-300 truncate">{session.displayName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{ROLE_LABELS[session.role]}</p>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 sticky top-0 z-30 flex items-center justify-between gap-4 px-4 lg:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 dark:text-slate-400 hidden sm:inline truncate">
                {workspace?.organization.name ?? 'FixDesk'}
              </span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {activeNav.label}
              </span>
            </div>
          </div>

          {/* Global Search */}
          <div className="relative flex-1 max-w-md hidden md:block" data-dropdown>
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search asset tags, serials, employees, SKUs..."
              aria-label="Global search"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-sky-600 transition-colors"
            />
            {searchFocused && searchQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden z-40 animate-slide-down">
                {searchResults.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    No matching assets, employees, inventory, or articles.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {searchResults.map((res, idx) => (
                      <li key={idx}>
                        <button
                          type="button"
                          onMouseDown={() => {
                            navigate(res.path);
                            setSearchQuery('');
                          }}
                          className="w-full px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-3 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {res.title}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {res.subtitle}
                            </p>
                          </div>
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
                            {res.type}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5 shrink-0" data-dropdown>
            <div className="relative">
              <button
                type="button"
                onClick={cycleTheme}
                aria-label={`Theme: ${getThemeLabel(theme)}. Click to cycle themes`}
                title={`Theme: ${getThemeLabel(theme)}. Click to cycle themes`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              >
                {getThemeIcon(theme)}
                <span className="hidden sm:inline text-xs font-medium text-slate-700 dark:text-slate-200 capitalize">
                  {theme === 'system' ? 'System' : theme}
                </span>
              </button>
            </div>

            {/* Notifications popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((o) => !o);
                  setProfileOpen(false);
                }}
                aria-label={`Notifications (${unreadCount} unread)`}
                className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-[10px] font-semibold text-white flex items-center justify-center tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl z-40 animate-slide-down">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Notifications ({unreadCount} unread)
                    </span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500 dark:text-slate-400">
                        All operational alerts are clear.
                      </p>
                    ) : (
                      notifications.slice(0, 12).map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            markNotificationRead(n.id);
                            setNotifOpen(false);
                            navigate(n.entityPath);
                          }}
                          className={cn(
                            'w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors',
                            !n.read && 'bg-sky-50/50 dark:bg-sky-950/20'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                'text-xs font-semibold',
                                n.severity === 'critical'
                                  ? 'text-red-700 dark:text-red-400'
                                  : n.severity === 'warning'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-sky-700 dark:text-sky-400'
                              )}
                            >
                              {n.category}
                            </span>
                            <span className="text-[11px] text-slate-400 tabular-nums">
                              {formatDateTime(n.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                            {n.title}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                            {n.message}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile & Role Switcher */}
            {session && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen((o) => !o);
                    setNotifOpen(false);
                  }}
                  aria-label="User profile and role menu"
                  aria-expanded={profileOpen}
                  aria-haspopup="true"
                  className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                >
                  <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-sky-600 text-white text-xs font-semibold flex items-center justify-center">
                    {getInitials(session.displayName)}
                  </div>
                  <span className="hidden sm:inline text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[120px] truncate">
                    {session.displayName}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl z-40 p-3 space-y-3 animate-slide-down">
                    <div className="pb-2.5 border-b border-slate-200 dark:border-slate-800">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {session.displayName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {session.email}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Shield className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                        <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                          {ROLE_LABELS[session.role]}
                        </p>
                      </div>
                    </div>

                    {session.mode === 'local' && (
                      <div className="space-y-1.5">
                        <label
                          htmlFor="role-preview-select"
                          className="block text-xs font-medium text-slate-500 dark:text-slate-400"
                        >
                          Switch Active Role (RBAC Preview)
                        </label>
                        <select
                          id="role-preview-select"
                          value={session.role}
                          onChange={(e) => setActiveRolePreview(e.target.value as UserRole)}
                          className="w-full h-8 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-600"
                        >
                          {Object.entries(ROLE_LABELS).map(([roleKey, roleLabel]) => (
                            <option key={roleKey} value={roleKey}>
                              {roleLabel}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        void logout();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {error && (
          <div className="mx-4 lg:mx-6 mt-4 px-4 py-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 flex items-center justify-between gap-3 text-sm text-red-800 dark:text-red-200 no-print animate-slide-down">
            <span className="truncate">{error}</span>
            <button
              type="button"
              onClick={clearError}
              className="text-xs font-semibold underline shrink-0 hover:text-red-600 dark:hover:text-red-300"
            >
              Dismiss
            </button>
          </div>
        )}

        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}

// Add keyframe animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slide-in-right {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .animate-slide-in-right { animation: slide-in-right 0.2s ease-out; }
  @keyframes slide-down {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-slide-down { animation: slide-down 0.15s ease-out; }
`;
if (typeof document !== 'undefined' && !document.querySelector('#appshell-animations')) {
  style.id = 'appshell-animations';
  document.head.appendChild(style);
}
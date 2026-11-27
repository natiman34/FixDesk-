import React, { useEffect, useState } from 'react';
import { Cloud, HardDrive, Laptop, ShieldCheck, Wrench, Database, AlertCircle, CheckCircle2, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button, Input, Field } from '../components/ui/Primitives';

export function LoginPage() {
  const { signInWithGoogle, enterLocalOfflineMode, loading, error, theme } = useWorkspace();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showEmailLogin, setShowEmailLogin] = useState(false);

  // Apply theme to login page
  useEffect(() => {
    const root = document.documentElement;
    const apply = (pref: 'light' | 'dark' | 'system') => {
      const isDark =
        pref === 'dark' ||
        (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('dark', isDark);
    };
    apply(theme);
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => apply('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  const handleGoogleSignIn = () => {
    setLoginError('');
    void signInWithGoogle();
  };

  const handleLocalMode = () => {
    setLoginError('');
    void enterLocalOfflineMode();
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    // This would integrate with Firebase email/password auth
    // For now, show a message
    setLoginError('Email/password authentication not configured. Use Google Sign-In or Local Offline Mode.');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row">
      {/* Left Brand & Architecture Panel */}
      <div
        className="lg:w-[46%] bg-slate-900 text-slate-100 p-8 lg:p-14 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 hidden lg:flex"
        role="region"
        aria-label="Product information"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-600 text-white flex items-center justify-center" aria-hidden="true">
            <HardDrive className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">FixDesk</span>
        </div>

        <div className="my-10 space-y-6 max-w-lg">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight text-balance">
            IT Asset Management & Operations Platform
          </h1>
          <p className="text-sm lg:text-base text-slate-300 leading-relaxed">
            Built for NGOs, schools, internal IT departments, and field technicians. Manage hardware lifecycles, equipment handovers, spare parts inventory, preventive maintenance, documentation, and network diagnostics from one unified workspace.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
            <FeatureCard
              icon={Laptop}
              title="Asset & Handover Control"
              description="Track serials, warranties, QR labels, staff handovers, transfers, and certified returns."
            />
            <FeatureCard
              icon={Wrench}
              title="Preventive Maintenance"
              description="Schedule recurring inspections, track repair costs, and prevent stockouts on spare parts."
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Multi-Tenant & RBAC"
              description="Organization-isolated records, 6 operational roles, and immutable audit trails."
            />
            <FeatureCard
              icon={Database}
              title="Offline-First Ready"
              description="Shared repository architecture for cloud multi-user web and local offline operations."
            />
          </div>
        </div>

        <p className="text-xs text-slate-400">
          FixDesk · Dedicated IT Asset, Inventory & Infrastructure Operations
        </p>
      </div>

      {/* Right Sign-In Panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-14">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-1.5 text-center sm:text-left">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Sign in to FixDesk
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Choose your cloud multi-tenant workspace or launch the local offline environment.
            </p>
          </div>

          {(error || loginError) && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2"
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{loginError || error}</span>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            {/* Primary: Google Sign-In */}
            <div className="space-y-2">
              <Button
                onClick={handleGoogleSignIn}
                disabled={loading}
                size="lg"
                className="w-full"
                aria-busy={loading}
              >
                <Cloud className="w-4 h-4" />
                {loading ? (
                  <>
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Connecting...
                    </span>
                  </>
                ) : (
                  'Sign in with Google (Cloud Workspace)'
                )}
              </Button>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-center">
                Authenticates via Firebase Auth and stores organization records in your isolated Cloud Firestore database.
              </p>
            </div>

            {/* Divider */}
            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
              <span className="mx-3 text-xs text-slate-400 uppercase tracking-wider font-medium">
                or continue with
              </span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
            </div>

            {/* Email/Password Login (Optional) */}
            {showEmailLogin && (
              <form onSubmit={handleEmailLogin} className="space-y-4" noValidate>
                <Field label="Email Address" htmlFor="login-email" required>
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@organization.org"
                    required
                    disabled={loading}
                  />
                </Field>
                <Field label="Password" htmlFor="login-password" required>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      disabled={loading}
                      className="pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </Field>
                <Button type="submit" disabled={loading} size="lg" className="w-full">
                  <Lock className="w-4 h-4" />
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowEmailLogin(false)}
                    className="p-0"
                  >
                    Use Google Sign-In instead
                  </Button>
                </p>
              </form>
            )}

            {/* Local Offline Mode */}
            <div className="space-y-2">
              <Button
                variant="secondary"
                onClick={handleLocalMode}
                disabled={loading}
                size="lg"
                className="w-full"
              >
                <HardDrive className="w-4 h-4" />
                Open Local Offline Workspace
              </Button>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-center">
                Runs completely offline with persistent local storage, Meridian Relief Foundation seed data, full RBAC role preview, and JSON backup/restore.
              </p>
            </div>

            {/* Toggle Email Login */}
            {!showEmailLogin && (
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEmailLogin(true)}
                  className="p-0"
                >
                  Use email and password instead
                </Button>
              </p>
            )}
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 text-center sm:text-left">
            <p className="font-medium text-slate-700 dark:text-slate-300">
              Security & Data Scope
            </p>
            <p>
              All mutations are validated against shared Zod schemas and logged to an immutable activity trail. Cloud workspaces isolate data strictly by verified organization membership.
            </p>
          </div>

          {/* Demo credentials hint for local mode */}
          <details className="text-xs text-slate-500 dark:text-slate-400">
            <summary className="cursor-pointer flex items-center justify-center gap-1 select-none">
              <span>Demo credentials (Local Mode)</span>
              <ChevronDown className="w-4 h-4" />
            </summary>
            <div className="mt-2 p-3 rounded-lg bg-slate-100 dark:bg-slate-800/50 font-mono text-[11px] space-y-1">
              <div><strong>Admin:</strong> admin@fixdesk.local / admin123</div>
              <div><strong>IT Manager:</strong> itmgr@fixdesk.local / manager123</div>
              <div><strong>Technician:</strong> tech@fixdesk.local / tech123</div>
              <div><strong>Inventory:</strong> inv@fixdesk.local / inv123</div>
              <div><strong>Employee:</strong> emp@fixdesk.local / emp123</div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sky-400 text-sm font-semibold">
        <Icon className="w-4 h-4" aria-hidden="true" />
        <span>{title}</span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import './App.css';
import { ChatAssistant } from './ChatAssistant';
import {
  api,
  ApiError,
  clearAccessToken,
  getAccessToken,
  type ApiLeave,
  type ApiPolicy,
  type ApiRole,
  type ApiUser,
} from './api';

type Role = 'Employee' | 'HR' | 'Super Admin';
type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
const TODAY_ISO = new Date().toISOString().slice(0, 10);
const TODAY_LABEL = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})
  .format(new Date(`${TODAY_ISO}T12:00:00`))
  .toUpperCase();
type LeaveRequest = {
  id: string;
  userId: string;
  policyId: string;
  name: string;
  initials: string;
  department: string;
  type: string;
  startDate: string;
  endDate: string;
  dates: string;
  days: number;
  submitted: string;
  status: LeaveStatus;
  color: string;
};

type DirectoryPerson = ApiUser & { initials: string; color: string };

function titleRole(role: ApiRole): Role {
  if (role === 'super_admin') return 'Super Admin';
  return role === 'hr' ? 'HR' : 'Employee';
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}

function mapLeave(leave: ApiLeave): LeaveRequest {
  const color =
    ['blue', 'lilac', 'peach', 'mint', 'yellow'][
      leave.userId.split('').reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 5
    ] ?? 'blue';
  const start = new Date(`${leave.startDate}T00:00:00`);
  const end = new Date(`${leave.endDate}T00:00:00`);
  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit', year: 'numeric' }).format(date);
  return {
    id: leave.leaveRequestId,
    userId: leave.userId,
    policyId: leave.policyId,
    name: leave.employee.name,
    initials: initials(leave.employee.name),
    department: leave.employee.department,
    type: leave.leaveName,
    startDate: leave.startDate,
    endDate: leave.endDate,
    dates: start.getTime() === end.getTime() ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`,
    days: leave.requestedDays,
    submitted: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(leave.createdAt)),
    status:
      leave.status === 'pending'
        ? 'Pending'
        : leave.status === 'approved'
          ? 'Approved'
          : leave.status === 'cancelled'
            ? 'Cancelled'
            : 'Rejected',
    color,
  };
}

function mapPerson(user: ApiUser): DirectoryPerson {
  const color =
    ['blue', 'lilac', 'peach', 'mint', 'yellow'][
      user.userId.split('').reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 5
    ] ?? 'blue';
  return { ...user, initials: initials(user.name), color };
}

function App() {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [signedIn, setSignedIn] = useState(Boolean(getAccessToken()));
  const [authLoading, setAuthLoading] = useState(Boolean(getAccessToken()));
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [page, setPage] = useState('Overview');
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [policies, setPolicies] = useState<ApiPolicy[]>([]);
  const [directory, setDirectory] = useState<DirectoryPerson[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [toast, setToast] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [search, setSearch] = useState('');
  const role = user ? titleRole(user.role) : 'Employee';
  const profile = user ? { ...user, initials: initials(user.name) } : null;
  const pendingCount = requests.filter((request) => request.status === 'Pending').length;
  const visiblePeople = useMemo(
    () =>
      directory.filter((person) =>
        `${person.name} ${person.email} ${person.department}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [directory, search],
  );

  async function refreshPortalData(currentUser = user) {
    if (!currentUser) return;
    setDataLoading(true);
    setApiError('');
    try {
      const tasks: [Promise<ApiLeave[]>, Promise<ApiPolicy[]>, Promise<DirectoryPerson[] | null>] = [
        api.leaves(),
        api.policies(),
        currentUser.role === 'employee' ? Promise.resolve(null) : api.people().then((items) => items.map(mapPerson)),
      ];
      const [leaveItems, policyItems, peopleItems] = await Promise.all(tasks);
      setRequests(leaveItems.map(mapLeave));
      setPolicies(policyItems);
      if (peopleItems) setDirectory(peopleItems);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearAccessToken();
        setUser(null);
        setSignedIn(false);
      } else {
        setApiError(error instanceof Error ? error.message : 'Unable to load portal data.');
      }
    } finally {
      setDataLoading(false);
    }
  }

  useEffect(() => {
    if (!getAccessToken()) {
      setAuthLoading(false);
      return;
    }
    let active = true;
    api
      .me()
      .then((currentUser) => {
        if (!active) return;
        setUser(currentUser);
        setSignedIn(true);
      })
      .catch(() => {
        if (!active) return;
        clearAccessToken();
        setUser(null);
        setSignedIn(false);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (signedIn && user) void refreshPortalData(user);
    // Refresh after sign-in and when the authenticated identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, user?.userId]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  }

  async function login(email: string, password: string) {
    setLoginLoading(true);
    setLoginError('');
    try {
      const authenticatedUser = await api.login(email, password);
      setUser(authenticatedUser);
      setSignedIn(true);
      setPage('Overview');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Sign in failed.');
    } finally {
      setLoginLoading(false);
    }
  }

  function logout() {
    clearAccessToken();
    setUser(null);
    setSignedIn(false);
    setRequests([]);
    setPolicies([]);
    setDirectory([]);
    setPage('Overview');
    setLoginError('');
  }

  async function decideRequest(id: string, status: 'Approved' | 'Rejected') {
    setActionLoading(true);
    setApiError('');
    try {
      await api.decideLeave(id, status === 'Approved' ? 'approve' : 'reject');
      await refreshPortalData();
      notify(`Leave request ${status.toLowerCase()}.`);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to update leave request.');
    } finally {
      setActionLoading(false);
    }
  }

  async function submitLeave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const policyId = String(form.get('policyId'));
    const startDate = String(form.get('startDate'));
    const endDate = String(form.get('endDate'));
    const reason = String(form.get('reason') ?? '');
    setActionLoading(true);
    setApiError('');
    try {
      await api.createLeave({ policyId, startDate, endDate, reason: reason || undefined });
      await refreshPortalData();
      setShowLeaveForm(false);
      setPage('My leave');
      notify('Your leave request has been submitted.');
      formElement.reset();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to submit leave request.');
    } finally {
      setActionLoading(false);
    }
  }

  const menuItems = [
    { label: 'Overview', icon: LayoutDashboard },
    ...(role === 'Employee' ? [{ label: 'My leave', icon: CalendarDays }] : [{ label: 'Requests', icon: FileText }]),
    ...(role !== 'Employee' ? [{ label: 'People', icon: Users }] : []),
  ];

  if (authLoading) {
    return (
      <main className="auth-loading">
        <span className="loading-spinner" />
        Checking your secure session…
      </main>
    );
  }

  if (!signedIn || !user || !profile) {
    return <LoginScreen error={loginError} loading={loginLoading} onLogin={login} />;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#overview" onClick={() => setPage('Overview')}>
          <span className="brand-mark">
            <Command size={20} />
          </span>
          <span>
            northstar<span className="brand-dot">.</span>
            <small>PEOPLE PLATFORM</small>
          </span>
        </a>
        <button className="workspace-switcher">
          <span className="workspace-logo">N</span>
          <span className="workspace-copy">
            <strong>Northstar Studio</strong>
            <small>Workspace</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {menuItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${page === label ? 'active' : ''}`}
              onClick={() => {
                setPage(label);
                setMobileNavOpen(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === 'Requests' && pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}
            </button>
          ))}
        </nav>
        <div className="side-label tools-label">YOUR WORKSPACE</div>
        <button
          className="nav-item muted-nav"
          onClick={() => notify('Settings will be available in a future release.')}
        >
          <Settings2 size={18} />
          <span>Settings</span>
        </button>
        <button className="nav-item muted-nav" onClick={() => notify('Help center is coming soon.')}>
          <CircleHelp size={18} />
          <span>Help center</span>
        </button>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon">
              <ShieldCheck size={18} />
            </div>
            <strong>People, made simple.</strong>
            <p>Your team’s home for everything work.</p>
            <button onClick={() => notify('You’re all set — this is your HR portal preview.')}>
              Explore the portal <ArrowRight size={14} />
            </button>
          </div>
          <button className="user-mini" onClick={logout}>
            <span className="avatar avatar-small">{profile.initials}</span>
            <span className="user-mini-copy">
              <strong>{profile.name}</strong>
              <small>{role}</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(!mobileNavOpen)}>
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => notify('You’re all caught up.')}
            >
              <Bell size={18} />
              <span />
            </button>
            <span className="topbar-divider" />
            <button className="topbar-profile" onClick={logout}>
              <span className="avatar avatar-small">{profile.initials}</span>
              <span className="top-profile-name">{profile.name}</span>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>

        <div className="content-wrap">
          {apiError && (
            <div className="api-alert" role="alert">
              <span>{apiError}</span>
              <button onClick={() => void refreshPortalData()} aria-label="Retry loading data">
                Retry
              </button>
            </div>
          )}
          {dataLoading && (
            <div className="data-loading">
              <span className="loading-spinner" /> Syncing with your HR portal…
            </div>
          )}
          {page === 'People' && role !== 'Employee' ? (
            <PeoplePage search={search} setSearch={setSearch} people={visiblePeople} />
          ) : page === 'Requests' && role !== 'Employee' ? (
            <RequestsPage requests={requests} onDecide={decideRequest} actionLoading={actionLoading} />
          ) : page === 'My leave' && role === 'Employee' ? (
            <MyLeavePage
              userId={user.userId}
              requests={requests}
              policies={policies}
              onApply={() => setShowLeaveForm(true)}
            />
          ) : (
            <Dashboard
              role={role}
              profile={profile}
              requests={requests}
              policies={policies}
              directory={directory}
              actionLoading={actionLoading}
              onPage={setPage}
              onApply={() => setShowLeaveForm(true)}
              onDecide={decideRequest}
            />
          )}
          <footer className="page-footer">
            <span>© 2026 Northstar Studio</span>
            <span>
              Made for people, by people <span className="footer-heart">♥</span>
            </span>
          </footer>
        </div>
      </main>

      {showLeaveForm && (
        <LeaveModal
          policies={policies}
          loading={actionLoading}
          error={apiError}
          onClose={() => setShowLeaveForm(false)}
          onSubmit={submitLeave}
        />
      )}
      {toast && (
        <div className="toast">
          <span className="toast-check">
            <Check size={15} />
          </span>
          {toast}
        </div>
      )}
      <ChatAssistant user={user} />
    </div>
  );
}

function LoginScreen({
  error,
  loading,
  onLogin,
}: {
  error: string;
  loading: boolean;
  onLogin: (email: string, password: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <main className="login-screen">
      <section className="login-panel">
        <a className="brand login-brand" href="#login">
          <span className="brand-mark">
            <Command size={20} />
          </span>
          <span>
            northstar<span className="brand-dot">.</span>
            <small>PEOPLE PLATFORM</small>
          </span>
        </a>
        <div className="login-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> YOUR WORK, IN ONE PLACE
          </div>
          <h1>
            Good work starts
            <br />
            with <em>good people.</em>
          </h1>
          <p>
            Welcome to your team’s home. Manage time off, stay in the loop, and find what you need to do your best work.
          </p>
        </div>
        <div className="login-art">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-sun">
            <span>
              n<span>.</span>
            </span>
          </div>
          <div className="art-note note-one">
            <CalendarDays size={18} />
            <span>
              <b>Your time, your way</b>
              <small>Leave made easy</small>
            </span>
          </div>
          <div className="art-note note-two">
            <span className="tiny-avatar">SC</span>
            <span>
              <b>People first</b>
              <small>Better, together</small>
            </span>
          </div>
          <span className="art-star star-one">✳</span>
          <span className="art-star star-two">✦</span>
        </div>
        <div className="login-foot">
          <span>© 2026 Northstar Studio</span>
          <span>People first. Always.</span>
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-form-wrap">
          <div className="form-kicker">WELCOME BACK</div>
          <h2>Sign in to Northstar</h2>
          <p className="login-subtitle">Sign in with your company account to access your HR portal.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onLogin(email, password);
            }}
          >
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}
            <button className="primary-button login-submit" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in to portal'} {!loading && <ArrowRight size={17} />}
            </button>
          </form>
          <div className="login-security">
            <ShieldCheck size={15} /> Secure access for your team
          </div>
          <p className="login-demo-note">Your access is based on your assigned account role.</p>
        </div>
      </section>
    </main>
  );
}

function Dashboard({
  role,
  profile,
  requests,
  policies,
  directory,
  actionLoading,
  onPage,
  onApply,
  onDecide,
}: {
  role: Role;
  profile: ApiUser & { initials: string };
  requests: LeaveRequest[];
  policies: ApiPolicy[];
  directory: DirectoryPerson[];
  actionLoading: boolean;
  onPage: (page: string) => void;
  onApply: () => void;
  onDecide: (id: string, status: 'Approved' | 'Rejected') => void;
}) {
  const manager = role !== 'Employee';
  const pending = requests.filter((request) => request.status === 'Pending');
  const annualPolicy = policies.find((policy) => policy.annualAllowanceDays !== null);
  const annualUsed = annualPolicy
    ? requests
        .filter(
          (request) =>
            request.policyId === annualPolicy.policyId &&
            request.status === 'Approved' &&
            request.startDate.startsWith(TODAY_ISO.slice(0, 4)),
        )
        .reduce((sum, request) => sum + request.days, 0)
    : 0;
  const annualBalance =
    annualPolicy?.annualAllowanceDays === null || annualPolicy?.annualAllowanceDays === undefined
      ? null
      : Math.max(0, annualPolicy.annualAllowanceDays - annualUsed);
  const visibleRequests = manager ? requests : requests.filter((request) => request.userId === profile.userId);
  const upcomingRequest = visibleRequests
    .filter(
      (request) => request.startDate >= TODAY_ISO && request.status !== 'Rejected' && request.status !== 'Cancelled',
    )
    .sort((left, right) => left.startDate.localeCompare(right.startDate))[0];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const yearRequests = visibleRequests.filter((request) => request.startDate.startsWith(TODAY_ISO.slice(0, 4)));
  const monthlyRequests = monthNames.map((month, index) => {
    const forMonth = yearRequests.filter((request) => Number(request.startDate.slice(5, 7)) === index + 1);
    return {
      month,
      approved: Math.min(100, (forMonth.filter((request) => request.status === 'Approved').length / 4) * 100),
      pending: Math.min(100, (forMonth.filter((request) => request.status === 'Pending').length / 4) * 100),
    };
  });
  return (
    <>
      <div className="welcome-row">
        <div>
          <div className="date-kicker">
            <CalendarDays size={15} /> {TODAY_LABEL}
          </div>
          <h1>
            Good morning, {profile.name.split(' ')[0]} <span className="wave">✳</span>
          </h1>
          <p>
            {role === 'Employee'
              ? 'Here’s what’s happening with your time off.'
              : role === 'HR'
                ? 'Here’s your team’s latest people update.'
                : 'Here’s the latest across your workspace.'}
          </p>
        </div>
        <button className="secondary-button download-button" onClick={() => window.print()}>
          <ArrowDownToLine size={16} /> Export report
        </button>
      </div>
      <section className="hero-banner">
        <div className="hero-banner-content">
          <div className="hero-pill">
            <span /> {manager ? 'YOUR PEOPLE OVERVIEW' : 'YOUR TIME OFF, AT A GLANCE'}
          </div>
          <h2>{manager ? 'A little more people-first.' : 'Make room for what matters.'}</h2>
          <p>
            {manager
              ? 'A happy team starts with thoughtful support. You’ve got this.'
              : 'You’ve earned time to recharge. See your balance and plan what’s next.'}
          </p>
          <button className="hero-link" onClick={() => (manager ? onPage('Requests') : onPage('My leave'))}>
            {manager ? 'Review leave requests' : 'View your leave details'} <ArrowRight size={15} />
          </button>
        </div>
        <div className="hero-illustration" aria-hidden="true">
          <span className="hero-spark spark-a">✳</span>
          <div className="hero-ring ring-a" />
          <div className="hero-ring ring-b" />
          <div className="hero-plant">
            <i />
            <i />
            <i />
            <b />
          </div>
          <div className="hero-person">
            <div className="person-head" />
            <div className="person-body" />
            <div className="person-leg leg-a" />
            <div className="person-leg leg-b" />
          </div>
          <div className="hero-chair" />
          <span className="hero-spark spark-b">✦</span>
          <div className="hero-orb orb-a" />
          <div className="hero-orb orb-b" />
        </div>
      </section>
      <div className="section-heading">
        <div>
          <h2>{manager ? 'At a glance' : 'Your leave snapshot'}</h2>
          <p>{manager ? 'The numbers that matter this month.' : 'A little planning goes a long way.'}</p>
        </div>
        <span className="period-tag">
          October 2026 <ChevronDown size={14} />
        </span>
      </div>
      <section className="stats-grid">
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon icon-blue">
              <CalendarDays size={18} />
            </span>
            <span className="stat-note">{manager ? 'All requests' : annualPolicy ? 'Policy-based' : 'No policy'}</span>
          </div>
          <div className="stat-value">
            {manager ? requests.length : (annualBalance ?? '—')} <span>{manager ? 'requests' : 'days'}</span>
          </div>
          <div className="stat-label">
            {manager
              ? 'Leave requests in the workspace'
              : annualPolicy
                ? `${annualPolicy.name} balance`
                : 'Leave balance'}
          </div>
          <div className="stat-bottom">
            <span className="stat-line">
              <i
                style={{
                  width: manager
                    ? `${requests.length ? (requests.filter((request) => request.status === 'Approved').length / requests.length) * 100 : 0}%`
                    : annualPolicy?.annualAllowanceDays
                      ? `${Math.min(100, (annualUsed / annualPolicy.annualAllowanceDays) * 100)}%`
                      : '0%',
                }}
              />
            </span>
            <span>
              {manager
                ? `${requests.filter((request) => request.status === 'Approved').length} approved`
                : annualPolicy?.annualAllowanceDays
                  ? `of ${annualPolicy.annualAllowanceDays} days`
                  : 'policy not set'}
            </span>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon icon-lilac">
              <Clock3 size={18} />
            </span>
            <span className="stat-note">This month</span>
          </div>
          <div className="stat-value">
            {manager ? pending.length : visibleRequests.filter((item) => item.status === 'Pending').length}{' '}
            <span>requests</span>
          </div>
          <div className="stat-label">Awaiting review</div>
          <div className="stat-bottom">
            <span className="stat-note-inline">{manager ? 'Need your attention' : 'Submitted by you'}</span>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon icon-peach">
              <Users size={18} />
            </span>
            <span className="stat-note">Across the team</span>
          </div>
          <div className="stat-value">
            {manager ? directory.length : policies.length} <span>{manager ? 'people' : 'policies'}</span>
          </div>
          <div className="stat-label">{manager ? 'Active directory records loaded' : 'Active leave policies'}</div>
          <div className="stat-bottom">
            <span className="stat-note-inline">
              {manager
                ? `${new Set(directory.map((person) => person.department)).size} departments`
                : 'From your HR team'}
            </span>
          </div>
        </article>
        <article className="stat-card stat-vacation">
          <div className="stat-top">
            <span className="stat-icon icon-mint">
              <span className="sun-symbol">✳</span>
            </span>
            <span className="stat-note">{upcomingRequest ? 'Coming up next' : 'Coming up'}</span>
          </div>
          <div className="stat-value small-stat">{upcomingRequest?.dates ?? 'Nothing scheduled'}</div>
          <div className="stat-label">
            {upcomingRequest ? `${upcomingRequest.type} · ${upcomingRequest.status}` : 'No upcoming leave requests'}
          </div>
          <div className="stat-bottom">
            <span className="stat-note-inline">
              {upcomingRequest
                ? `${upcomingRequest.days} ${upcomingRequest.days === 1 ? 'day' : 'days'}${manager ? ` · ${upcomingRequest.name}` : ''}`
                : 'You’re all caught up'}
            </span>
            <button
              className="circle-arrow"
              aria-label="View leave"
              onClick={() => (manager ? onPage('Requests') : onPage('My leave'))}
            >
              <ArrowRight size={15} />
            </button>
          </div>
        </article>
      </section>

      <div className="dashboard-columns">
        <section className="panel leave-chart-panel">
          <div className="panel-header">
            <div>
              <h3>{manager ? 'Time off overview' : 'Your time off'}</h3>
              <p>{manager ? 'Leave days taken across your team' : 'Your leave activity through the year'}</p>
            </div>
            <button className="period-select">
              This year <ChevronDown size={14} />
            </button>
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-purple" /> Approved
            </span>
            <span>
              <i className="legend-gray" /> Pending
            </span>
          </div>
          <div className="bar-chart">
            <div className="chart-y-labels">
              <span>4</span>
              <span>3</span>
              <span>2</span>
              <span>1</span>
              <span>0</span>
            </div>
            <div className="chart-plot">
              <div className="chart-grid-lines">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="bar-groups">
                {monthlyRequests.map(({ month, approved, pending: monthPending }) => (
                  <div className="bar-group" key={month}>
                    <div className="bar-pair">
                      <i className="bar-used" style={{ height: `${approved}%` }} />
                      <i className="bar-available" style={{ height: `${monthPending}%` }} />
                    </div>
                    <span>{month}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section className="panel quick-panel">
          <div className="panel-header">
            <div>
              <h3>{manager ? 'Quick actions' : 'Make it happen'}</h3>
              <p>{manager ? 'Your people, one click away.' : 'A little admin, then back to you.'}</p>
            </div>
            <span className="quick-spark">✳</span>
          </div>
          <div className="quick-action-list">
            {manager ? (
              <>
                <button className="quick-action" onClick={() => onPage('Requests')}>
                  <span className="quick-action-icon lavender">
                    <FileText size={17} />
                  </span>
                  <span>
                    <b>Review requests</b>
                    <small>{pending.length} requests need your attention</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
                <button className="quick-action" onClick={() => onPage('People')}>
                  <span className="quick-action-icon mint">
                    <Users size={17} />
                  </span>
                  <span>
                    <b>Explore your people</b>
                    <small>Get to know your team</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
                <button className="quick-action" onClick={() => onPage('Requests')}>
                  <span className="quick-action-icon peach">
                    <CalendarDays size={17} />
                  </span>
                  <span>
                    <b>Team leave calendar</b>
                    <small>See who’s out and when</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              </>
            ) : (
              <>
                <button className="quick-action" onClick={onApply}>
                  <span className="quick-action-icon lavender">
                    <Plus size={18} />
                  </span>
                  <span>
                    <b>Request time off</b>
                    <small>Plan your next break</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
                <button className="quick-action" onClick={() => onPage('My leave')}>
                  <span className="quick-action-icon mint">
                    <FileText size={17} />
                  </span>
                  <span>
                    <b>View leave history</b>
                    <small>Past & upcoming requests</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
                <button className="quick-action" onClick={() => onPage('My leave')}>
                  <span className="quick-action-icon peach">
                    <Users size={17} />
                  </span>
                  <span>
                    <b>Meet your people team</b>
                    <small>Here to help when you need</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              </>
            )}
          </div>
        </section>
      </div>

      <section className="panel requests-panel">
        <div className="panel-header">
          <div>
            <h3>{manager ? 'Requests to review' : 'Your recent requests'}</h3>
            <p>{manager ? 'A timely response makes all the difference.' : 'Stay in the loop with your time off.'}</p>
          </div>
          <button className="text-link" onClick={() => onPage(manager ? 'Requests' : 'My leave')}>
            View all <ArrowRight size={15} />
          </button>
        </div>
        <RequestTable
          requests={
            manager ? requests.slice(0, 3) : requests.filter((request) => request.userId === profile.userId).slice(0, 3)
          }
          showEmployee={manager}
          onDecide={manager ? onDecide : undefined}
          actionLoading={actionLoading}
          compact
        />
      </section>
    </>
  );
}

function RequestsPage({
  requests,
  onDecide,
  actionLoading,
}: {
  requests: LeaveRequest[];
  onDecide: (id: string, status: 'Approved' | 'Rejected') => void;
  actionLoading: boolean;
}) {
  const [filter, setFilter] = useState('All requests');
  const filtered = filter === 'All requests' ? requests : requests.filter((request) => request.status === filter);
  return (
    <>
      <div className="page-title-row">
        <div>
          <div className="date-kicker">PEOPLE OPERATIONS</div>
          <h1>Leave requests</h1>
          <p>Thoughtful decisions make a big difference.</p>
        </div>
        <span className="pending-chip">
          <i /> {requests.filter((item) => item.status === 'Pending').length} pending review
        </span>
      </div>
      <div className="request-summary-cards">
        <div>
          <span className="summary-card-label">NEEDS REVIEW</span>
          <b>{requests.filter((item) => item.status === 'Pending').length}</b>
          <small>Waiting for a decision</small>
        </div>
        <div>
          <span className="summary-card-label">APPROVED THIS MONTH</span>
          <b>{requests.filter((item) => item.status === 'Approved').length}</b>
          <small>Ready for a well-earned break</small>
        </div>
        <div>
          <span className="summary-card-label">DECLINED</span>
          <b>{requests.filter((item) => item.status === 'Rejected').length}</b>
          <small>Handled with care</small>
        </div>
      </div>
      <section className="panel full-table-panel">
        <div className="panel-header">
          <div>
            <h3>All leave requests</h3>
            <p>Review, approve, or decline requests from your team.</p>
          </div>
          <select
            className="period-select filter-select"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option>All requests</option>
            <option>Pending</option>
            <option>Approved</option>
            <option>Rejected</option>
          </select>
        </div>
        <RequestTable requests={filtered} showEmployee onDecide={onDecide} actionLoading={actionLoading} />
      </section>
    </>
  );
}

function MyLeavePage({
  userId,
  requests,
  policies,
  onApply,
}: {
  userId: string;
  requests: LeaveRequest[];
  policies: ApiPolicy[];
  onApply: () => void;
}) {
  const mine = requests.filter((request) => request.userId === userId);
  return (
    <>
      <div className="page-title-row">
        <div>
          <div className="date-kicker">YOUR TIME, YOUR WAY</div>
          <h1>My leave</h1>
          <p>Keep track of your time off, all in one place.</p>
        </div>
        <button className="primary-button" onClick={onApply}>
          <Plus size={17} /> Request time off
        </button>
      </div>
      <div className="leave-balance-row">
        {policies.map((policy, index) => {
          const used = mine
            .filter(
              (request) =>
                request.policyId === policy.policyId &&
                request.status === 'Approved' &&
                request.startDate.startsWith(TODAY_ISO.slice(0, 4)),
            )
            .reduce((sum, request) => sum + request.days, 0);
          const balance = policy.annualAllowanceDays === null ? null : Math.max(0, policy.annualAllowanceDays - used);
          return (
            <div className={`balance-card ${index === 0 ? 'balance-main' : ''}`} key={policy.policyId}>
              <div className={`balance-icon ${index === 1 ? 'sick-icon' : index > 1 ? 'personal-icon' : ''}`}>
                {index === 0 ? (
                  <CalendarDays size={18} />
                ) : index === 1 ? (
                  <ShieldCheck size={18} />
                ) : (
                  <Clock3 size={18} />
                )}
              </div>
              <span>{policy.name}</span>
              <strong>
                {balance === null ? '—' : balance} <small>{balance === null ? 'policy' : 'days'}</small>
              </strong>
              {balance !== null && (
                <div className="balance-progress">
                  <i
                    style={{
                      width: `${policy.annualAllowanceDays ? Math.min(100, (used / policy.annualAllowanceDays) * 100) : 0}%`,
                    }}
                  />
                </div>
              )}
              <small className="balance-caption">
                {policy.annualAllowanceDays === null
                  ? 'No fixed annual allowance'
                  : `${used} used of ${policy.annualAllowanceDays} days`}
              </small>
            </div>
          );
        })}
        {policies.length === 0 && <div className="empty-state">Leave policies have not been configured yet.</div>}
      </div>
      <section className="panel full-table-panel">
        <div className="panel-header">
          <div>
            <h3>Leave history</h3>
            <p>All your submitted requests and their latest status.</p>
          </div>
          <button className="secondary-button small-button" onClick={() => window.print()}>
            <ArrowDownToLine size={15} /> Export
          </button>
        </div>
        <RequestTable requests={mine} showEmployee={false} />
      </section>
    </>
  );
}

function PeoplePage({
  search,
  setSearch,
  people: filteredPeople,
}: {
  search: string;
  setSearch: (value: string) => void;
  people: DirectoryPerson[];
}) {
  const departmentCount = new Set(filteredPeople.map((person) => person.department)).size;
  const privilegedCount = filteredPeople.filter((person) => person.role !== 'employee').length;
  return (
    <>
      <div className="page-title-row">
        <div>
          <div className="date-kicker">YOUR NORTHSTAR COMMUNITY</div>
          <h1>People</h1>
          <p>Good things happen when we know each other.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => window.alert('Adding a teammate will be available when the backend is connected.')}
        >
          <Plus size={17} /> Add a person
        </button>
      </div>
      <div className="people-stats">
        <div>
          <Users size={18} />
          <strong>{filteredPeople.length}</strong>
          <span>people shown</span>
        </div>
        <div>
          <span className="people-stat-dot lavender-dot" />
          <strong>{departmentCount}</strong>
          <span>departments</span>
        </div>
        <div>
          <span className="people-stat-dot green-dot" />
          <strong>{privilegedCount}</strong>
          <span>HR &amp; admins</span>
        </div>
      </div>
      <section className="panel people-panel">
        <div className="panel-header">
          <div>
            <h3>Everyone</h3>
            <p>Meet the people behind the work.</p>
          </div>
          <label className="search-box">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people" />
          </label>
        </div>
        <div className="table-scroll">
          <table className="data-table people-table">
            <thead>
              <tr>
                <th>NAME</th>
                <th>USER ID</th>
                <th>ROLE</th>
                <th>DEPARTMENT</th>
                <th>MANAGER ID</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredPeople.map((person) => (
                <tr key={person.userId}>
                  <td>
                    <div className="person-cell">
                      <span className={`avatar avatar-${person.color}`}>{person.initials}</span>
                      <span>
                        <b>{person.name}</b>
                        <small>{person.email}</small>
                      </span>
                    </div>
                  </td>
                  <td className="id-cell">{person.userId}</td>
                  <td>
                    <span
                      className={`role-tag ${person.role === 'hr' ? 'hr-tag' : person.role === 'super_admin' ? 'manager-tag' : ''}`}
                    >
                      {titleRole(person.role)}
                    </span>
                  </td>
                  <td>{person.department}</td>
                  <td className="id-cell">{person.managerId ?? '—'}</td>
                  <td>
                    <button className="row-more" aria-label={`More about ${person.name}`}>
                      <span>···</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredPeople.length === 0 && <div className="empty-state">No people match “{search}”.</div>}
        </div>
      </section>
    </>
  );
}

function RequestTable({
  requests,
  showEmployee,
  onDecide,
  actionLoading = false,
  compact = false,
}: {
  requests: LeaveRequest[];
  showEmployee: boolean;
  onDecide?: (id: string, status: 'Approved' | 'Rejected') => void;
  actionLoading?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table className={`data-table ${compact ? 'compact-table' : ''}`}>
        <thead>
          <tr>
            {showEmployee && <th>TEAM MEMBER</th>}
            <th>LEAVE TYPE</th>
            <th>DATES</th>
            <th>DAYS</th>
            {!compact && <th>SUBMITTED</th>}
            <th>STATUS</th>
            {onDecide && <th className="actions-heading">ACTION</th>}
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id}>
              {showEmployee && (
                <td>
                  <div className="person-cell">
                    <span className={`avatar avatar-${request.color}`}>{request.initials}</span>
                    <span>
                      <b>{request.name}</b>
                      <small>{request.department}</small>
                    </span>
                  </div>
                </td>
              )}
              <td>
                <span className="leave-type">
                  <i
                    className={`type-dot ${request.type === 'Sick leave' ? 'sick-dot' : request.type === 'Personal leave' ? 'personal-dot' : ''}`}
                  />
                  {request.type}
                </span>
              </td>
              <td className="date-cell">{request.dates}</td>
              <td>
                {request.days} {request.days === 1 ? 'day' : 'days'}
              </td>
              {!compact && <td className="submitted-cell">{request.submitted}</td>}
              <td>
                <span className={`status-pill ${request.status.toLowerCase()}`}>
                  <i />
                  {request.status}
                </span>
              </td>
              {onDecide && (
                <td>
                  {request.status === 'Pending' ? (
                    <div className="action-buttons">
                      <button
                        className="approve-button"
                        onClick={() => onDecide(request.id, 'Approved')}
                        disabled={actionLoading}
                        aria-label={`Approve ${request.name}'s leave`}
                      >
                        <Check size={15} />
                      </button>
                      <button
                        className="reject-button"
                        onClick={() => onDecide(request.id, 'Rejected')}
                        disabled={actionLoading}
                        aria-label={`Reject ${request.name}'s leave`}
                      >
                        <X size={15} />
                      </button>
                      {!compact && (
                        <button className="review-link" onClick={() => onDecide(request.id, 'Approved')}>
                          Review <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  ) : compact ? (
                    <button className="row-more" aria-label="More actions">
                      <span>···</span>
                    </button>
                  ) : (
                    <span className="done-label">{request.status === 'Approved' ? 'Reviewed' : 'Closed'}</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {requests.length === 0 && <div className="empty-state">No requests to show here yet.</div>}
    </div>
  );
}

function LeaveModal({
  policies,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  policies: ApiPolicy[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="leave-modal" role="dialog" aria-modal="true" aria-labelledby="leave-modal-title">
        <div className="modal-header">
          <div>
            <div className="date-kicker">A LITTLE TIME FOR YOU</div>
            <h2 id="leave-modal-title">Request time off</h2>
            <p>We’ll let your manager know. Take care of you.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <label htmlFor="leaveType">Type of leave</label>
          <select id="leaveType" name="policyId" required disabled={policies.length === 0 || loading} defaultValue="">
            <option value="" disabled>
              {policies.length ? 'Choose a leave policy' : 'No active leave policies'}
            </option>
            {policies.map((policy) => (
              <option key={policy.policyId} value={policy.policyId}>
                {policy.name}
              </option>
            ))}
          </select>
          <div className="date-input-row">
            <div>
              <label htmlFor="startDate">First day</label>
              <input id="startDate" type="date" name="startDate" min={TODAY_ISO} required />
            </div>
            <div>
              <label htmlFor="endDate">Last day</label>
              <input id="endDate" type="date" name="endDate" min={TODAY_ISO} required />
            </div>
          </div>
          <label htmlFor="leaveNote">
            Note for your manager <span className="optional-label">OPTIONAL</span>
          </label>
          <textarea id="leaveNote" name="reason" placeholder="Anything you’d like them to know?" rows={3} />
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-footer">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={loading || policies.length === 0}>
              {loading ? 'Sending…' : 'Send request'} {!loading && <ArrowRight size={16} />}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default App;

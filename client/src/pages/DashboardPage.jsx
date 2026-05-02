import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import {
  getUserDashboard,
  getAdminDashboard,
} from '../services/dashboardService';
import { getMyNotifications } from '../services/notificationService';

/* ─────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-BD', {
    style:               'currency',
    currency:            'BDT',
    maximumFractionDigits: 0,
  }).format(amount ?? 0);

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-BD', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* Sub-components                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

/* User avatar with initials */
const Avatar = ({ name }) => {
  const initials = (name || 'U')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-xl font-extrabold text-white shadow-lg ring-2 ring-blue-500/30">
      {initials}
    </div>
  );
};

/* Balance card */
const BalanceCard = ({ label, value, subtext, colorClass }) => (
  <div className={`rounded-2xl bg-gradient-to-br ${colorClass} p-5 shadow-lg`}>
    <p className="text-sm font-medium text-white/80">{label}</p>
    <p className="mt-3 text-2xl font-extrabold text-white">{value}</p>
    {subtext && (
      <p className="mt-2 text-xs leading-5 text-white/70">{subtext}</p>
    )}
  </div>
);

/* Module card used in the grid */
const ModuleCard = ({ title, description, badge, path, badgeColor }) => {
  const badgeClass =
    badge === 'Live'
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-amber-100 text-amber-700';

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-blue-200 hover:bg-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${badgeClass}`}>
          {badge}
        </span>
      </div>

      <div className="mt-5">
        {path ? (
          <Link
            to={path}
            className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Open Module
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex cursor-not-allowed items-center rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500"
          >
            Coming Soon
          </button>
        )}
      </div>
    </div>
  );
};

/* Quick-action card */
const QuickActionCard = ({ title, description, icon, path }) => {
  const content = (
    <>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl ring-1 ring-blue-100">
        {icon}
      </div>
      <h3 className="mt-5 text-lg font-bold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-6">
        {path ? (
          <span className="inline-flex items-center rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
            Open
          </span>
        ) : (
          <span className="inline-flex items-center rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">
            Coming Soon
          </span>
        )}
      </div>
    </>
  );

  return path ? (
    <Link
      to={path}
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl"
    >
      {content}
    </Link>
  ) : (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
      {content}
    </div>
  );
};

/* Admin stat card */
const AdminStatCard = ({ label, value, icon, available }) => (
  <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-lg">
      {icon}
    </div>
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-xl font-extrabold text-slate-900">
        {available ? value : '—'}
      </p>
    </div>
  </div>
);

/* Security checklist item */
const SecurityItem = ({ text }) => (
  <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
    <span className="text-sm font-medium text-slate-700">{text}</span>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────── */
/* Main Dashboard Page                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

const ICON_MAP = {
  transfer:      '💸',
  beneficiaries: '👥',
  history:       '📄',
  support:       '🎧',
  profile:       '👤',
};

const FEATURE_MODULES = [
  {
    title:       'Profile Management',
    description: 'View and update encrypted personal information.',
    badge:       'Live',
    path:        '/profile',
  },
  {
    title:       'Account Details',
    description: 'View account type, number, and status.',
    badge:       'Planned',
    path:        null,
  },
  {
    title:       'Account Balance',
    description: 'Display current and available balance securely.',
    badge:       'Live',
    path:        '/account-balance',
  },
  {
    title:       'Beneficiary Management',
    description: 'Add, edit, and manage beneficiaries.',
    badge:       'Planned',
    path:        null,
  },
  {
    title:       'Money Transfer',
    description: 'Transfer money with secure validation.',
    badge:       'Live',
    path:        '/transfer',
  },
  {
    title:       'Transaction History',
    description: 'Check previous transfers and account activity.',
    badge:       'Live',
    path:        '/transactions',
  },
  {
    title:       'Support Ticket System',
    description: 'Create, edit, and monitor support tickets.',
    badge:       'Planned',
    path:        null,
  },
  {
    title:       'Notifications & Alerts',
    description: 'Receive alerts for login, transfer, and account events.',
    badge:       'Planned',
    path:        null,
  },
];

const SECURITY_ITEMS = [
  'Password + OTP two-step authentication',
  'Dual asymmetric encryption (RSA + ECC)',
  'HMAC-SHA256 integrity on every field',
  'HTTP-only refresh session cookie',
  'Short-lived access token (Bearer)',
  'Idle timeout protection',
];

/* ── Loading skeleton ───────────────────────────────────────────────────────── */
const DashboardSkeleton = () => (
  <DashboardLayout>
    <div className="-m-8 min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="h-64 animate-pulse rounded-3xl bg-slate-300" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-3xl bg-slate-200" />
          ))}
        </div>
      </div>
    </div>
  </DashboardLayout>
);

/* ─────────────────────────────────────────────────────────────────────────── */

const DashboardPage = () => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recentNotifications, setRecentNotifications] = useState([]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = isAdmin
        ? await getAdminDashboard()
        : await getUserDashboard();
      setData(res.data?.data ?? null);
    } catch (err) {
      toast.error(
        err.response?.data?.message || 'Failed to load dashboard. Please refresh.'
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const fetchRecentNotifications = useCallback(async () => {
    try {
      const res = await getMyNotifications();
      const list = res.data?.data?.notifications || [];
  
      setRecentNotifications(list.slice(0, 3));
    } catch {
      setRecentNotifications([]);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    fetchRecentNotifications();
  }, [fetchDashboard, fetchRecentNotifications]);

  if (loading) return <DashboardSkeleton />;

  /* ── Live values from backend (with safe fallbacks) ─────────────────────── */
  const profile      = data?.profile;
  const account      = data?.account;
  const transactions = data?.transactions;
  const recentTxns   = transactions?.available ? (transactions.transactions ?? []) : [];
  const notifications = data?.notifications;
  const latestNotification = recentNotifications.length > 0 ? recentNotifications[0] : null;
  const tickets = data?.tickets;
  const quickActions = (data?.quickActions ?? []).map((qa) => ({
    title:       qa.label,
    description: qa.description,
    icon:        ICON_MAP[qa.id] ?? '⚡',
    path:        qa.id === 'transfer' ? '/transfer'
               : qa.id === 'history'  ? '/transactions'
               : qa.available ? qa.path : null,
  }));

  /* Admin values */
  const userStats    = data?.userStats;
  const ticketStats  = data?.ticketStats;
  const alertStats   = data?.alertStats;
  const adminActions = data?.adminActions ?? [];

  const displayName = profile?.fullName || profile?.username || 'Authenticated User';

  const balanceCards = [
    {
      label:      'Total Balance',
      value:      account?.available ? formatCurrency(account.totalBalance)    : 'BDT 0',
      subtext:    account?.available ? `As of ${account.asOf ? new Date(account.asOf).toLocaleTimeString('en-BD') : '—'}` : 'Account module loading…',
      colorClass: 'from-blue-700 to-blue-900',
    },
    {
      label:      'Available Balance',
      value:      account?.available ? formatCurrency(account.availableBalance) : 'BDT 0',
      subtext:    account?.available ? 'Ready to use immediately' : 'Account module loading…',
      colorClass: 'from-emerald-600 to-emerald-800',
    },
    {
      label:      'Pending Transfers',
      value:      account?.available ? formatCurrency(account.pendingAmount ?? 0) : 'BDT 0',
      subtext:    account?.available ? 'Transfers being processed' : 'Available after Transfer module',
      colorClass: 'from-amber-500 to-orange-600',
    },
  ];

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <DashboardLayout>
      <div className="-m-8 min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">

          {/* ── Hero banner ───────────────────────────────────────────────── */}
          <section className="overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 shadow-soft">
            <div className="grid gap-6 px-6 py-8 lg:grid-cols-[1.5fr_0.8fr] lg:px-8 lg:py-10">

              {/* Left */}
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-blue-100 ring-1 ring-white/10">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Secure banking session active
                </div>

                <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                  Welcome back{profile?.fullName ? `, ${profile.fullName.split(' ')[0]}` : ''}
                </h1>

                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                  {isAdmin
                    ? 'You are logged in as an administrator. Manage users, support tickets, and system alerts from your dashboard.'
                    : 'Your secure banking dashboard — profile management and account balance are live. Transfers and more features are coming soon.'}
                </p>

                {/* Balance cards */}
                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  {balanceCards.map((card) => (
                    <BalanceCard key={card.label} {...card} />
                  ))}
                </div>

                {/* View Balance link */}
                {!isAdmin && (
                  <div className="mt-5">
                    <Link
                      to="/account-balance"
                      className="inline-flex items-center gap-2 rounded-2xl bg-white/20 px-5 py-2.5 text-sm font-bold text-white ring-1 ring-white/30 transition hover:bg-white/30"
                    >
                      💰 View Full Balance
                    </Link>
                  </div>
                )}
              </div>

              {/* Right — profile card */}
              <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-sm">
                <p className="text-sm font-medium text-slate-300">Customer Profile</p>

                <div className="mt-5 flex items-center gap-4">
                  <Avatar name={displayName} />

                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-white">
                      {displayName}
                    </h2>
                    <p className="mt-1 truncate text-sm text-slate-400">
                      {profile?.email || '—'}
                    </p>
                    <p className="mt-1 text-xs capitalize text-slate-400">
                      Role:{' '}
                      <span className="font-semibold text-blue-300">
                        {currentUser?.role || 'user'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
                    <p className="text-xs uppercase tracking-wide text-slate-300">Account Type</p>
                    <p className="mt-2 font-semibold text-white">
                      {account?.available ? account.accountType : 'Savings'}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
                    <p className="text-xs uppercase tracking-wide text-slate-300">Account Number</p>
                    <p className="mt-2 font-mono font-semibold text-white">
                      {account?.available
                        ? account.accountNumber
                            ?.replace(/\S{4}(?=\S)/g, '•••• ')
                            .slice(0, -4) + (account.accountNumber?.slice(-4) ?? '')
                        : '•••• •••• •••• ——'}
                    </p>
                  </div>

                  {/* Recent notification */}
<Link
  to="/notifications"
  className="block rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-400/20 transition hover:bg-emerald-500/20"
>
  <div className="flex items-center justify-between gap-3">
    <p className="text-xs uppercase tracking-wide text-emerald-200">
      Notifications
    </p>

    {notifications?.available && notifications.unreadCount > 0 && (
      <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
        {notifications.unreadCount}
      </span>
    )}
  </div>

  {latestNotification ? (
    <>
      <p className="mt-2 line-clamp-1 font-semibold text-emerald-100">
        {latestNotification.title}
      </p>

      <p className="mt-1 line-clamp-2 text-xs leading-5 text-emerald-100/80">
        {latestNotification.message}
      </p>

      <p className="mt-2 text-xs font-semibold text-emerald-200">
        View all notifications →
      </p>
    </>
  ) : (
    <>
      <p className="mt-2 font-semibold text-emerald-100">
        Secure session verified
      </p>

      <p className="mt-1 text-xs text-emerald-100/70">
        Recent alerts will appear here.
      </p>
    </>
  )}
</Link>
                </div>
              </div>
            </div>
          </section>

          {/* ── Admin stats (admin only) ───────────────────────────────────── */}
          {isAdmin && (
            <section>
              <div className="mb-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-purple-700">
                  Administration
                </p>
                <h2 className="text-2xl font-extrabold text-slate-900">
                  System Overview
                </h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <AdminStatCard
                  label="Total Users"
                  value={userStats?.totalUsers ?? 0}
                  icon="👥"
                  available={userStats?.available ?? false}
                />
                <AdminStatCard
                  label="Open Tickets"
                  value={ticketStats?.openCount ?? 0}
                  icon="🎫"
                  available={ticketStats?.available ?? false}
                />
                <AdminStatCard
                  label="In Progress"
                  value={ticketStats?.inProgressCount ?? 0}
                  icon="🔧"
                  available={ticketStats?.available ?? false}
                />
                <AdminStatCard
                  label="Pending Alerts"
                  value={alertStats?.pendingNotifications ?? 0}
                  icon="🔔"
                  available={alertStats?.available ?? false}
                />
              </div>

              {/* Admin quick actions */}
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {adminActions.map((action) => (
                  <QuickActionCard
                    key={action.id}
                    title={action.label}
                    description={action.description}
                    icon={ICON_MAP[action.id] ?? '⚙️'}
                    path={action.available ? action.path : null}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Quick actions (user) ──────────────────────────────────────── */}
          {!isAdmin && (
            <section>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                    Quick Actions
                  </p>
                  <h2 className="text-2xl font-extrabold text-slate-900">Banking shortcuts</h2>
                </div>
                <p className="max-w-2xl text-sm text-slate-500">
                  Active when the corresponding feature is implemented.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {(quickActions.length > 0 ? quickActions : [
                  { title: 'Transfer Money',       description: 'Send money securely.',              icon: '💸', path: null },
                  { title: 'Add Beneficiary',      description: 'Save trusted accounts.',            icon: '👥', path: null },
                  { title: 'Transaction History',  description: 'View and filter activity.',         icon: '📄', path: null },
                  { title: 'Support Ticket',       description: 'Create and track requests.',        icon: '🎧', path: null },
                ]).map((action) => (
                  <QuickActionCard key={action.title} {...action} />
                ))}
              </div>
            </section>
          )}

          {/* ── Middle section ─────────────────────────────────────────────── */}
          <section className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">

            {/* Banking modules grid */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
              <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                    Banking Modules
                  </p>
                  <h2 className="text-2xl font-extrabold text-slate-900">
                    {isAdmin ? 'All Features' : 'Available Features'}
                  </h2>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                    Live
                  </span>
                  = ready to use
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {FEATURE_MODULES.map((mod) => (
                  <ModuleCard key={mod.title} {...mod} />
                ))}
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6">

              {/* ── Recent transactions (live) ────────────────────────── */}
              {!isAdmin && (
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-500">Recent Activity</p>
                      <h2 className="mt-1 text-xl font-extrabold text-slate-900">Transactions</h2>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-xl ring-1 ring-indigo-100">
                      📄
                    </div>
                  </div>

                  <div className="mt-5 space-y-2">
                    {recentTxns.length === 0 ? (
                      <p className="py-4 text-center text-sm text-slate-400">
                        No transactions yet. <Link to="/transfer" className="font-semibold text-blue-600 hover:underline">Make your first transfer →</Link>
                      </p>
                    ) : (
                      recentTxns.slice(0, 5).map((txn) => {
                        const isDebit = txn.transactionType === 'DEBIT';
                        return (
                          <div key={txn.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${isDebit ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                              {isDebit ? '↑' : '↓'}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-slate-800">
                                {isDebit ? `→ ${txn.toAccount?.replace(/\S{4}(?=\S)/g, '•••• ').slice(0,-4)}${txn.toAccount?.slice(-4) ?? ''}` : `← ${txn.fromAccount?.slice(-4) ?? ''}`}
                              </p>
                              <p className="text-[10px] text-slate-400">{txn.reference}</p>
                            </div>
                            <span className={`text-sm font-bold ${isDebit ? 'text-red-600' : 'text-emerald-600'}`}>
                              {isDebit ? '−' : '+'}{formatCurrency(txn.amount)}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="mt-4">
                    <Link
                      to="/transactions"
                      className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
                    >
                      📜 View Full History
                    </Link>
                  </div>
                </div>
              )}

              {/* Support ticket summary */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-500">Support Center</p>
                    <h2 className="mt-1 text-xl font-extrabold text-slate-900">Your Tickets</h2>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-xl ring-1 ring-blue-100">
                    🎫
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {[
                    { label: 'Open',    value: tickets?.openCount    ?? 0, color: 'bg-blue-500'   },
                    { label: 'Pending', value: tickets?.pendingCount  ?? 0, color: 'bg-amber-500'  },
                    { label: 'Closed',  value: tickets?.closedCount   ?? 0, color: 'bg-emerald-500'},
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
                        <span className="text-sm font-medium text-slate-700">{label}</span>
                      </div>
                      <span className="text-sm font-bold text-slate-900">
                        {tickets?.available ? value : '—'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-5">
                  <button
                    type="button"
                    disabled
                    className="w-full cursor-not-allowed rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-400"
                  >
                    Open Support Ticket — Coming Soon
                  </button>
                </div>
              </div>

              {/* Security center */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-500">Security Center</p>
                    <h2 className="mt-1 text-xl font-extrabold text-slate-900">Session & Access</h2>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-xl ring-1 ring-emerald-100">
                    🔐
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {SECURITY_ITEMS.map((item) => (
                    <SecurityItem key={item} text={item} />
                  ))}
                </div>
              </div>

              {/* Last updated note */}
              {data?.generatedAt && (
                <p className="text-center text-xs text-slate-400">
                  Dashboard data as of {formatDate(data.generatedAt)}
                </p>
              )}
            </div>
          </section>

        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;
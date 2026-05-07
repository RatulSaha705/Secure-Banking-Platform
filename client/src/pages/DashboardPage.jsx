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

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(amount || 0);

const Avatar = ({ name }) => {
  const initials = (name || 'User')
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-xl font-extrabold text-white shadow-lg ring-2 ring-blue-500/30">
      {initials || 'U'}
    </div>
  );
};

const DashboardCard = ({ label, value, subtext, colorClass }) => {
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${colorClass} p-5 shadow-lg`}>
      <p className="text-sm font-medium text-white/80">{label}</p>
      <p className="mt-3 text-2xl font-extrabold text-white">{value}</p>
      {subtext && (
        <p className="mt-2 text-xs leading-5 text-white/70">{subtext}</p>
      )}
    </div>
  );
};

const QuickActionCard = ({ title, description, icon, path }) => {
  return (
    <Link
      to={path}
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl ring-1 ring-blue-100">
        {icon}
      </div>

      <h3 className="mt-5 text-lg font-bold text-slate-900">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-slate-500">
        {description}
      </p>

      <div className="mt-6">
        <span className="inline-flex items-center rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
          Open
        </span>
      </div>
    </Link>
  );
};

const DashboardSkeleton = () => {
  return (
    <DashboardLayout>
      <div className="-m-8 min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="h-64 animate-pulse rounded-3xl bg-slate-300" />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="h-48 animate-pulse rounded-3xl bg-slate-200" />
            <div className="h-48 animate-pulse rounded-3xl bg-slate-200" />
            <div className="h-48 animate-pulse rounded-3xl bg-slate-200" />
            <div className="h-48 animate-pulse rounded-3xl bg-slate-200" />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

const ICON_MAP = {
  transfer: '💸',
  beneficiaries: '👥',
  history: '📄',
  support: '🎧',
  profile: '👤',
  notifications: '🔔',
  admin: '🛡️',
  tickets: '🎫',
  users: '👥',
};

const USER_FALLBACK_ACTIONS = [
  {
    title: 'Transfer Money',
    description: 'Send money to a saved beneficiary.',
    icon: '💸',
    path: '/transfer',
  },
  {
    title: 'Manage Beneficiaries',
    description: 'Add, edit, or remove saved accounts.',
    icon: '👥',
    path: '/transfer',
  },
  {
    title: 'Transaction History',
    description: 'View and filter past transactions.',
    icon: '📄',
    path: '/transactions',
  },
  {
    title: 'My Profile',
    description: 'View and update personal information.',
    icon: '👤',
    path: '/profile',
  },
];

const ADMIN_QUICK_ACTIONS = [
  {
    title: 'Admin Panel',
    description: 'Manage users and system-level controls.',
    icon: '🛡️',
    path: '/admin',
  },
  {
    title: 'Admin Tickets',
    description: 'Review and manage user support tickets.',
    icon: '🎫',
    path: '/admin/support-tickets',
  },
  {
    title: 'Notifications',
    description: 'View security alerts and system notifications.',
    icon: '🔔',
    path: '/notifications',
  },
  {
    title: 'My Profile',
    description: 'View and update administrator profile details.',
    icon: '👤',
    path: '/profile',
  },
];

const DashboardPage = () => {
  const { currentUser } = useAuth();

  const isAdmin = currentUser?.role === 'admin';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recentNotifications, setRecentNotifications] = useState([]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);

    try {
      let response;

      if (isAdmin) {
        response = await getAdminDashboard();
      } else {
        response = await getUserDashboard();
      }

      setData(response.data?.data || null);
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Failed to load dashboard. Please refresh.'
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const fetchRecentNotifications = useCallback(async () => {
    try {
      const response = await getMyNotifications();
      const list = response.data?.data?.notifications || [];
      setRecentNotifications(list.slice(0, 3));
    } catch {
      setRecentNotifications([]);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    fetchRecentNotifications();
  }, [fetchDashboard, fetchRecentNotifications]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  const profile = data?.profile;
  const account = data?.account;
  const notifications = data?.notifications;

  const userStats = data?.userStats;
  const ticketStats = data?.ticketStats;
  const transactionStats = data?.transactionStats;

  const latestNotification =
    recentNotifications.length > 0 ? recentNotifications[0] : null;

  const displayName =
    profile?.fullName ||
    profile?.username ||
    currentUser?.fullName ||
    currentUser?.name ||
    currentUser?.username ||
    currentUser?.email ||
    'User';

  const firstName = displayName.split(' ')[0];

  const userBalanceCards = [
    {
      label: 'Total Balance',
      value: account?.available
        ? formatCurrency(account.totalBalance)
        : 'BDT 0',
      subtext: account?.available
        ? `As of ${
            account.asOf
              ? new Date(account.asOf).toLocaleTimeString('en-BD')
              : '—'
          }`
        : 'Account module loading...',
      colorClass: 'from-blue-700 to-blue-900',
    },
    {
      label: 'Available Balance',
      value: account?.available
        ? formatCurrency(account.availableBalance)
        : 'BDT 0',
      subtext: account?.available
        ? 'Ready to use immediately'
        : 'Account module loading...',
      colorClass: 'from-emerald-600 to-emerald-800',
    },
    {
      label: 'Pending Transfers',
      value: account?.available
        ? formatCurrency(account.pendingAmount || 0)
        : 'BDT 0',
      subtext: account?.available
        ? 'Transfers being processed'
        : 'Available after Transfer module',
      colorClass: 'from-amber-500 to-orange-600',
    },
  ];

  const adminDashboardCards = [
    {
      label: 'Total Users',
      value: userStats?.available ? userStats.totalUsers || 0 : 0,
      subtext: 'Registered secure banking users',
      colorClass: 'from-blue-700 to-blue-900',
    },
    {
      label: 'Unresolved Tickets',
      value: ticketStats?.available ? ticketStats.unresolvedCount || 0 : 0,
      subtext: 'Tickets not resolved or closed',
      colorClass: 'from-emerald-600 to-emerald-800',
    },
    {
      label: 'Transactions Today',
      value: transactionStats?.available ? transactionStats.todayCount || 0 : 0,
      subtext: 'Total transaction records created today',
      colorClass: 'from-amber-500 to-orange-600',
    },
  ];

  const dashboardCards = isAdmin ? adminDashboardCards : userBalanceCards;

  const userQuickActionsFromBackend = (data?.quickActions || [])
    .filter((action) => action.available === true && action.path)
    .map((action) => {
      let finalPath = action.path;

      if (action.id === 'transfer') {
        finalPath = '/transfer';
      } else if (action.id === 'history') {
        finalPath = '/transactions';
      } else if (action.id === 'profile') {
        finalPath = '/profile';
      }

      return {
        title: action.label,
        description: action.description,
        icon: ICON_MAP[action.id] || '⚡',
        path: finalPath,
      };
    });

  const quickActions = isAdmin
    ? ADMIN_QUICK_ACTIONS
    : userQuickActionsFromBackend.length > 0
      ? userQuickActionsFromBackend
      : USER_FALLBACK_ACTIONS;

  const maskedAccountNumber =
    account?.available && account.accountNumber
      ? account.accountNumber
          .replace(/\S{4}(?=\S)/g, '•••• ')
          .slice(0, -4) + account.accountNumber.slice(-4)
      : '•••• •••• •••• ——';

  return (
    <DashboardLayout>
      <div className="-m-8 min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">

          <section className="overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 shadow-soft">
            <div className="grid gap-6 px-6 py-8 lg:grid-cols-[1.5fr_0.8fr] lg:px-8 lg:py-10">

              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-blue-100 ring-1 ring-white/10">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Secure banking session active
                </div>

                <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                  Welcome back, {firstName}
                </h1>

                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                  {isAdmin
                    ? 'Your administrator dashboard is active. Use quick actions to manage users, tickets, transactions, alerts, and your profile.'
                    : 'Your secure banking dashboard — profile management, balance, transfer, and transaction history are ready to use.'}
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  {dashboardCards.map((card) => (
                    <DashboardCard
                      key={card.label}
                      label={card.label}
                      value={card.value}
                      subtext={card.subtext}
                      colorClass={card.colorClass}
                    />
                  ))}
                </div>

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

                {isAdmin && (
                  <div className="mt-5">
                    <Link
                      to="/admin"
                      className="inline-flex items-center gap-2 rounded-2xl bg-white/20 px-5 py-2.5 text-sm font-bold text-white ring-1 ring-white/30 transition hover:bg-white/30"
                    >
                      🛡️ Open Admin Panel
                    </Link>
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-sm">
                <p className="text-sm font-medium text-slate-300">
                  {isAdmin ? 'Administrator Profile' : 'Customer Profile'}
                </p>

                <div className="mt-5 flex items-center gap-4">
                  <Avatar name={displayName} />

                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-white">
                      {displayName}
                    </h2>

                    <p className="mt-1 truncate text-sm text-slate-400">
                      {profile?.email || currentUser?.email || '—'}
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
                    <p className="text-xs uppercase tracking-wide text-slate-300">
                      {isAdmin ? 'Access Level' : 'Account Type'}
                    </p>

                    <p className="mt-2 font-semibold text-white">
                      {isAdmin
                        ? 'Administrator'
                        : account?.available
                          ? account.accountType
                          : 'Savings'}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
                    <p className="text-xs uppercase tracking-wide text-slate-300">
                      {isAdmin ? 'Security Status' : 'Account Number'}
                    </p>

                    <p className="mt-2 font-mono font-semibold text-white">
                      {isAdmin ? 'Session Verified' : maskedAccountNumber}
                    </p>
                  </div>

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
                        <p className="mt-2 truncate font-semibold text-emerald-100">
                          {latestNotification.title}
                        </p>

                        <p className="mt-1 text-xs leading-5 text-emerald-100/80">
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

          <section>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                  Quick Actions
                </p>

                <h2 className="text-2xl font-extrabold text-slate-900">
                  {isAdmin ? 'Admin shortcuts' : 'Banking shortcuts'}
                </h2>
              </div>

              
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {quickActions.map((action) => (
                <QuickActionCard
                  key={action.title}
                  title={action.title}
                  description={action.description}
                  icon={action.icon}
                  path={action.path}
                />
              ))}
            </div>
          </section>

        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;
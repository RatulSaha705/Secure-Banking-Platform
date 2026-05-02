import React from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(amount);
};

const DashboardPage = () => {
  const { currentUser } = useAuth();

  const quickActions = [
    {
      title: 'Transfer Money',
      description: 'Send money securely to your saved beneficiaries.',
      icon: '💸',
      path: null,
    },
    {
      title: 'Add Beneficiary',
      description: 'Save trusted people and accounts for future transfers.',
      icon: '👥',
      path: null,
    },
    {
      title: 'Transaction History',
      description: 'View and filter your banking activity.',
      icon: '📄',
      path: null,
    },
    {
      title: 'Support Ticket',
      description: 'Create and track banking support requests.',
      icon: '🎧',
      path: null,
    },
  ];

  const featureModules = [
    {
      title: 'Profile Management',
      description: 'View and update encrypted personal information.',
      badge: 'Live',
      path: '/profile',
    },
    {
      title: 'Account Details',
      description: 'View account type, account number, and account status.',
      badge: 'Planned',
      path: null,
    },
    {
      title: 'Account Balance',
      description: 'Display current and available balance securely.',
      badge: 'Planned',
      path: null,
    },
    {
      title: 'Beneficiary Management',
      description: 'Add, edit, and manage beneficiaries.',
      badge: 'Planned',
      path: null,
    },
    {
      title: 'Money Transfer',
      description: 'Transfer money with secure validation and integrity checks.',
      badge: 'Planned',
      path: null,
    },
    {
      title: 'Transaction History',
      description: 'Check previous transfers and account activity.',
      badge: 'Planned',
      path: null,
    },
    {
      title: 'Support Ticket System',
      description: 'Create, edit, and monitor support tickets.',
      badge: 'Planned',
      path: null,
    },
    {
      title: 'Notifications & Alerts',
      description: 'Receive alerts for login, transfer, and account events.',
      badge: 'Planned',
      path: null,
    },
  ];

  const accountCards = [
    {
      label: 'Total Balance',
      value: formatCurrency(0),
      subtext: 'Ready to connect with account API',
      color: 'from-blue-700 to-blue-900',
    },
    {
      label: 'Available Balance',
      value: formatCurrency(0),
      subtext: 'For future real-time balance data',
      color: 'from-emerald-600 to-emerald-800',
    },
    {
      label: 'Pending Transfers',
      value: '0',
      subtext: 'Will update after transfer module',
      color: 'from-amber-500 to-orange-600',
    },
  ];

  const recentUpdates = [
    {
      title: 'Secure login completed',
      time: 'Current session',
      desc: 'Password and OTP verification passed successfully.',
    },
    {
      title: 'Session protection active',
      time: 'Now',
      desc: 'Short-lived access token, refresh session, and idle timeout are enabled.',
    },
    {
      title: 'Dashboard prepared',
      time: 'Development phase',
      desc: 'This dashboard is ready for upcoming banking features.',
    },
  ];

  const securityItems = [
    'Password verification enabled',
    'OTP verification enabled',
    'HTTP-only refresh session active',
    'Short-lived access token active',
    'Idle timeout protection active',
  ];

  return (
    <DashboardLayout>
      <div className="-m-8 min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">
          {/* Hero */}
          <section className="overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 shadow-soft">
            <div className="grid gap-6 px-6 py-8 lg:grid-cols-[1.5fr_0.8fr] lg:px-8 lg:py-10">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-blue-100 ring-1 ring-white/10">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Secure banking session active
                </div>

                <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                  Welcome back to SecureBank
                </h1>

                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                  A fresh banking dashboard prepared for your upcoming modules —
                  account balance, account details, beneficiaries, transfers,
                  transactions, support tickets, notifications, and admin tools.
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  {accountCards.map((item) => (
                    <div
                      key={item.label}
                      className={`rounded-2xl bg-gradient-to-br ${item.color} p-5 shadow-lg`}
                    >
                      <p className="text-sm font-medium text-white/80">{item.label}</p>
                      <p className="mt-3 text-2xl font-extrabold text-white">
                        {item.value}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-white/75">
                        {item.subtext}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-sm">
                <p className="text-sm font-medium text-slate-300">Customer Profile</p>

                <div className="mt-5 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-xl font-bold text-white ring-1 ring-white/10">
                    {(currentUser?.role || 'U').charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-white">
                      {currentUser?.id || 'Authenticated User'}
                    </h2>
                    <p className="mt-1 text-sm capitalize text-slate-300">
                      Role: {currentUser?.role || 'user'}
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
                    <p className="text-xs uppercase tracking-wide text-slate-300">
                      Account Type
                    </p>
                    <p className="mt-2 font-semibold text-white">Primary Savings</p>
                  </div>

                  <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
                    <p className="text-xs uppercase tracking-wide text-slate-300">
                      Account Number
                    </p>
                    <p className="mt-2 font-semibold text-white">•••• •••• •••• 4821</p>
                  </div>

                  <div className="rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-400/20">
                    <p className="text-xs uppercase tracking-wide text-emerald-200">
                      Status
                    </p>
                    <p className="mt-2 font-semibold text-emerald-100">
                      Secure session verified
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Quick actions */}
          <section>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                  Quick Actions
                </p>
                <h2 className="text-2xl font-extrabold text-slate-900">
                  Banking shortcuts
                </h2>
              </div>

              <p className="max-w-2xl text-sm text-slate-500">
                These action buttons are already designed. When you implement a
                feature, just add its route path in the array and the button will
                become active.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {quickActions.map((action) => {
                const cardContent = (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl ring-1 ring-blue-100">
                      {action.icon}
                    </div>

                    <h3 className="mt-5 text-lg font-bold text-slate-900">
                      {action.title}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {action.description}
                    </p>

                    <div className="mt-6">
                      {action.path ? (
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

                return action.path ? (
                  <Link
                    key={action.title}
                    to={action.path}
                    className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl"
                  >
                    {cardContent}
                  </Link>
                ) : (
                  <div
                    key={action.title}
                    className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card"
                  >
                    {cardContent}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Middle section */}
          <section className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
            {/* Planned modules */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
              <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                    Banking Modules
                  </p>
                  <h2 className="text-2xl font-extrabold text-slate-900">
                    Ready for future features
                  </h2>
                </div>

                <div className="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
                  Add feature route to activate button
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {featureModules.map((module) => (
                  <div
                    key={module.title}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-blue-200 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">
                          {module.title}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          {module.description}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                          module.badge === 'Live'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {module.badge}
                      </span>
                    </div>

                    <div className="mt-5">
                      {module.path ? (
                        <Link
                          to={module.path}
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
                          Button activates when route is added
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right side */}
            <div className="space-y-6">
              {/* Security */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-500">
                      Security Center
                    </p>
                    <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                      Session & Access
                    </h2>
                  </div>

                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-xl ring-1 ring-emerald-100">
                    🔐
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {securityItems.map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3"
                    >
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <span className="text-sm font-medium text-slate-700">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent updates */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
                <p className="text-sm font-semibold text-slate-500">
                  Recent Activity
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                  System updates
                </h2>

                <div className="mt-6 space-y-5">
                  {recentUpdates.map((item, index) => (
                    <div key={item.title} className="flex gap-4">
                      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                        {index + 1}
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          {item.title}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-slate-500">
                          {item.desc}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          {item.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Help card */}
              <div className="rounded-3xl bg-gradient-to-br from-blue-700 to-slate-900 p-6 text-white shadow-soft">
                <p className="text-sm font-medium text-blue-100">Developer Note</p>
                <h2 className="mt-2 text-xl font-extrabold">
                  How to enable a module button
                </h2>

                <div className="mt-5 space-y-3 text-sm leading-6 text-slate-200">
                  <p>1. Build the feature page.</p>
                  <p>2. Add the route in your App router.</p>
                  <p>3. Put the route path in the dashboard array.</p>
                  <p>4. The disabled button will automatically become active.</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;
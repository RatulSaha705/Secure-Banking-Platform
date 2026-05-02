import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import {
  getAdminOverview,
  getAdminUsers,
  banAdminUser,
  unbanAdminUser,
  updateAdminUserRole,
  getAdminTransactions,
} from '../services/adminPanelService';

const TABS = {
  OVERVIEW: 'OVERVIEW',
  USERS: 'USERS',
  TRANSACTIONS: 'TRANSACTIONS',
};

const ROLE_OPTIONS = [
  { value: '', label: 'All Roles' },
  { value: 'USER', label: 'User' },
  { value: 'ADMIN', label: 'Admin' },
];

const ACTIVE_OPTIONS = [
  { value: '', label: 'All Users' },
  { value: 'true', label: 'Active Users' },
  { value: 'false', label: 'Banned Users' },
];

const normalizeRole = (role) => {
  return String(role || '').trim().toLowerCase();
};

const getApiError = (err, fallback) => {
  return err?.response?.data?.message || err?.message || fallback;
};

const formatDate = (value) => {
  if (!value) {
    return '—';
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const formatMoney = (value) => {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount)) {
    return 'BDT 0';
  }

  return `BDT ${amount.toLocaleString()}`;
};

const shortId = (value) => {
  const text = String(value || '');

  if (!text) {
    return '—';
  }

  if (text.length <= 12) {
    return text;
  }

  return `${text.slice(0, 6)}...${text.slice(-4)}`;
};

const roleClass = (role) => {
  const clean = String(role || '').toUpperCase();

  if (clean === 'ADMIN') {
    return 'bg-purple-100 text-purple-700';
  }

  return 'bg-blue-100 text-blue-700';
};

const activeClass = (isActive) => {
  if (isActive === false) {
    return 'bg-red-100 text-red-700';
  }

  return 'bg-emerald-100 text-emerald-700';
};

const statusClass = (status) => {
  const clean = String(status || '').toUpperCase();

  if (clean === 'COMPLETED' || clean === 'SUCCESS') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (clean === 'PENDING') {
    return 'bg-amber-100 text-amber-700';
  }

  if (clean === 'FAILED' || clean === 'REJECTED') {
    return 'bg-red-100 text-red-700';
  }

  return 'bg-slate-100 text-slate-700';
};

const Badge = ({ children, className }) => {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${className}`}>
      {children}
    </span>
  );
};

const AdminAccessDenied = () => {
  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="rounded-2xl bg-white p-8 text-center shadow">
          <div className="text-5xl">⛔</div>

          <h1 className="mt-4 text-2xl font-bold text-red-600">
            Admin access required
          </h1>

          <p className="mt-2 text-gray-600">
            Only administrators can open the Admin Panel.
          </p>

          <Link
            to="/dashboard"
            className="mt-5 inline-block rounded-xl bg-blue-700 px-5 py-3 font-bold text-white"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
};

const StatCard = ({ title, value, icon, tone }) => {
  return (
    <div className="rounded-2xl bg-white p-5 shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-gray-500">
            {title}
          </p>

          <p className="mt-2 text-2xl font-extrabold text-gray-900">
            {value}
          </p>
        </div>

        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${tone}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

const TabButton = ({ active, children, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
        active
          ? 'bg-blue-700 text-white'
          : 'bg-white text-gray-700 hover:bg-blue-50'
      }`}
    >
      {children}
    </button>
  );
};

const OverviewTab = ({ overview, loading }) => {
  const summary = overview?.summary || {};
  const recentUsers = overview?.recentUsers || [];
  const recentTransactions = overview?.recentTransactions || [];

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        <div className="h-28 animate-pulse rounded-2xl bg-gray-200" />
        <div className="h-28 animate-pulse rounded-2xl bg-gray-200" />
        <div className="h-28 animate-pulse rounded-2xl bg-gray-200" />
        <div className="h-28 animate-pulse rounded-2xl bg-gray-200" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Users"
          value={summary.totalUsers || 0}
          icon="👥"
          tone="bg-blue-50"
        />

        <StatCard
          title="Active Users"
          value={summary.activeUsers || 0}
          icon="✅"
          tone="bg-emerald-50"
        />

        <StatCard
          title="Banned Users"
          value={summary.bannedUsers || 0}
          icon="🚫"
          tone="bg-red-50"
        />

        <StatCard
          title="Transactions"
          value={summary.totalTransactions || 0}
          icon="💸"
          tone="bg-emerald-50"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow">
          <h2 className="text-xl font-bold text-gray-900">Recent Users</h2>

          <div className="mt-4 space-y-3">
            {recentUsers.length === 0 ? (
              <p className="text-sm text-gray-500">No users found.</p>
            ) : (
              recentUsers.map((user) => (
                <div key={user.id} className="rounded-xl bg-gray-50 p-3">
                  <p className="font-bold text-gray-900">
                    {user.fullName || user.username || 'Unnamed User'}
                  </p>

                  <p className="text-sm text-gray-500">{user.email}</p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge className={roleClass(user.role)}>{user.role}</Badge>
                    <Badge className={activeClass(user.isActive)}>
                      {user.isActive ? 'ACTIVE' : 'BANNED'}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow">
          <h2 className="text-xl font-bold text-gray-900">Recent Transactions</h2>

          <div className="mt-4 space-y-3">
            {recentTransactions.length === 0 ? (
              <p className="text-sm text-gray-500">No transactions found.</p>
            ) : (
              recentTransactions.map((txn) => (
                <div key={txn.id} className="rounded-xl bg-gray-50 p-3">
                  <p className="font-bold text-gray-900">
                    {formatMoney(txn.amount)}
                  </p>

                  <p className="text-sm text-gray-500">
                    Ref: {txn.reference || shortId(txn.id)}
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    {formatDate(txn.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow">
        <h2 className="text-xl font-bold text-gray-900">Security Integrity Monitor</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-sm font-bold text-gray-500">Tampered User Records</p>
            <p className="mt-2 text-2xl font-extrabold text-red-600">
              {summary.tamperedUserRecords || 0}
            </p>
          </div>

          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-sm font-bold text-gray-500">Tampered Transaction Records</p>
            <p className="mt-2 text-2xl font-extrabold text-red-600">
              {summary.tamperedTransactionRecords || 0}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const UsersTab = ({
  usersData,
  loading,
  userFilters,
  setUserFilters,
  onRefresh,
}) => {
  const users = usersData?.users || [];

  const handleBan = async (user) => {
    const reason = window.prompt('Enter ban reason:', 'Suspicious activity detected');

    if (reason === null) {
      return;
    }

    try {
      await banAdminUser(user.id, { reason });
      toast.success('User banned successfully.');
      await onRefresh();
    } catch (err) {
      toast.error(getApiError(err, 'Failed to ban user.'));
    }
  };

  const handleUnban = async (user) => {
    const reason = window.prompt('Enter unban reason:', 'Account reviewed and restored');

    if (reason === null) {
      return;
    }

    try {
      await unbanAdminUser(user.id, { reason });
      toast.success('User unbanned successfully.');
      await onRefresh();
    } catch (err) {
      toast.error(getApiError(err, 'Failed to unban user.'));
    }
  };

  const handleRoleChange = async (user, role) => {
    try {
      await updateAdminUserRole(user.id, { role });
      toast.success('User role updated successfully.');
      await onRefresh();
    } catch (err) {
      toast.error(getApiError(err, 'Failed to update user role.'));
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-5 shadow">
        <div className="grid gap-4 md:grid-cols-3">
          <input
            type="text"
            value={userFilters.search}
            onChange={(e) =>
              setUserFilters((prev) => ({
                ...prev,
                search: e.target.value,
                page: 1,
              }))
            }
            className="rounded-xl border border-gray-300 px-4 py-3"
            placeholder="Search user"
          />

          <select
            value={userFilters.role}
            onChange={(e) =>
              setUserFilters((prev) => ({
                ...prev,
                role: e.target.value,
                page: 1,
              }))
            }
            className="rounded-xl border border-gray-300 px-4 py-3"
          >
            {ROLE_OPTIONS.map((item) => (
              <option key={item.label} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <select
            value={userFilters.isActive}
            onChange={(e) =>
              setUserFilters((prev) => ({
                ...prev,
                isActive: e.target.value,
                page: 1,
              }))
            }
            className="rounded-xl border border-gray-300 px-4 py-3"
          >
            {ACTIVE_OPTIONS.map((item) => (
              <option key={item.label} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-2xl bg-white shadow">
        <div className="border-b border-gray-100 p-5">
          <h2 className="text-xl font-bold text-gray-900">
            User Management
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Total: {usersData?.total || 0}
          </p>
        </div>

        {loading ? (
          <div className="p-5">
            <div className="h-40 animate-pulse rounded-2xl bg-gray-200" />
          </div>
        ) : users.length === 0 ? (
          <p className="p-5 text-gray-500">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-bold text-gray-900">
                        {user.fullName || user.username || 'Unnamed User'}
                      </p>

                      <p className="text-xs text-gray-400">{shortId(user.id)}</p>
                    </td>

                    <td className="px-5 py-4">
                      <p className="text-gray-800">{user.email || '—'}</p>
                      <p className="text-xs text-gray-500">{user.phone || user.contact || '—'}</p>
                    </td>

                    <td className="px-5 py-4">
                      <select
                        value={String(user.role || 'USER').toUpperCase()}
                        onChange={(e) => handleRoleChange(user, e.target.value)}
                        className="rounded-xl border border-gray-300 px-3 py-2"
                      >
                        <option value="USER">USER</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </td>

                    <td className="px-5 py-4">
                      <Badge className={activeClass(user.isActive)}>
                        {user.isActive ? 'ACTIVE' : 'BANNED'}
                      </Badge>
                    </td>

                    <td className="px-5 py-4 text-gray-500">
                      {formatDate(user.createdAt)}
                    </td>

                    <td className="px-5 py-4">
                      {user.isActive ? (
                        <button
                          type="button"
                          onClick={() => handleBan(user)}
                          className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-700"
                        >
                          Ban
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleUnban(user)}
                          className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700"
                        >
                          Unban
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 p-5">
          <button
            type="button"
            disabled={userFilters.page <= 1}
            onClick={() =>
              setUserFilters((prev) => ({
                ...prev,
                page: Math.max(prev.page - 1, 1),
              }))
            }
            className="rounded-xl bg-gray-800 px-4 py-2 font-bold text-white disabled:opacity-40"
          >
            Previous
          </button>

          <p className="text-sm font-bold text-gray-600">
            Page {usersData?.page || 1} of {usersData?.totalPages || 1}
          </p>

          <button
            type="button"
            disabled={(usersData?.page || 1) >= (usersData?.totalPages || 1)}
            onClick={() =>
              setUserFilters((prev) => ({
                ...prev,
                page: prev.page + 1,
              }))
            }
            className="rounded-xl bg-gray-800 px-4 py-2 font-bold text-white disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

const TransactionsTab = ({
  transactionsData,
  loading,
  transactionFilters,
  setTransactionFilters,
}) => {
  const transactions = transactionsData?.transactions || [];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-5 shadow">
        <div className="grid gap-4 md:grid-cols-3">
          <input
            type="text"
            value={transactionFilters.search}
            onChange={(e) =>
              setTransactionFilters((prev) => ({
                ...prev,
                search: e.target.value,
                page: 1,
              }))
            }
            className="rounded-xl border border-gray-300 px-4 py-3"
            placeholder="Search transaction"
          />

          <input
            type="text"
            value={transactionFilters.userId}
            onChange={(e) =>
              setTransactionFilters((prev) => ({
                ...prev,
                userId: e.target.value,
                page: 1,
              }))
            }
            className="rounded-xl border border-gray-300 px-4 py-3"
            placeholder="Filter by user id"
          />

          <input
            type="text"
            value={transactionFilters.status}
            onChange={(e) =>
              setTransactionFilters((prev) => ({
                ...prev,
                status: e.target.value,
                page: 1,
              }))
            }
            className="rounded-xl border border-gray-300 px-4 py-3"
            placeholder="Status"
          />
        </div>
      </div>

      <div className="rounded-2xl bg-white shadow">
        <div className="border-b border-gray-100 p-5">
          <h2 className="text-xl font-bold text-gray-900">
            Transaction Monitoring
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Total: {transactionsData?.total || 0}
          </p>
        </div>

        {loading ? (
          <div className="p-5">
            <div className="h-40 animate-pulse rounded-2xl bg-gray-200" />
          </div>
        ) : transactions.length === 0 ? (
          <p className="p-5 text-gray-500">No transactions found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-3">Reference</th>
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">To Account</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {transactions.map((txn) => (
                  <tr key={txn.id}>
                    <td className="px-5 py-4 font-bold text-gray-900">
                      {txn.reference || shortId(txn.id)}
                    </td>

                    <td className="px-5 py-4 text-gray-500">
                      {shortId(txn.userId)}
                    </td>

                    <td className="px-5 py-4 font-bold text-gray-900">
                      {formatMoney(txn.amount)}
                    </td>

                    <td className="px-5 py-4 text-gray-500">
                      {txn.toAccount || '—'}
                    </td>

                    <td className="px-5 py-4">
                      <Badge className={statusClass(txn.status)}>
                        {txn.status || 'UNKNOWN'}
                      </Badge>
                    </td>

                    <td className="px-5 py-4 text-gray-500">
                      {formatDate(txn.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 p-5">
          <button
            type="button"
            disabled={transactionFilters.page <= 1}
            onClick={() =>
              setTransactionFilters((prev) => ({
                ...prev,
                page: Math.max(prev.page - 1, 1),
              }))
            }
            className="rounded-xl bg-gray-800 px-4 py-2 font-bold text-white disabled:opacity-40"
          >
            Previous
          </button>

          <p className="text-sm font-bold text-gray-600">
            Page {transactionsData?.page || 1} of {transactionsData?.totalPages || 1}
          </p>

          <button
            type="button"
            disabled={(transactionsData?.page || 1) >= (transactionsData?.totalPages || 1)}
            onClick={() =>
              setTransactionFilters((prev) => ({
                ...prev,
                page: prev.page + 1,
              }))
            }
            className="rounded-xl bg-gray-800 px-4 py-2 font-bold text-white disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminPanelPage = () => {
  const { currentUser } = useAuth();
  const isAdmin = normalizeRole(currentUser?.role) === 'admin';

  const [activeTab, setActiveTab] = useState(TABS.OVERVIEW);

  const [overview, setOverview] = useState(null);
  const [usersData, setUsersData] = useState(null);
  const [transactionsData, setTransactionsData] = useState(null);

  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const [userFilters, setUserFilters] = useState({
    page: 1,
    limit: 10,
    search: '',
    role: '',
    isActive: '',
  });

  const [transactionFilters, setTransactionFilters] = useState({
    page: 1,
    limit: 10,
    search: '',
    userId: '',
    status: '',
  });

  const cleanUserFilters = useMemo(() => {
    const next = {
      page: userFilters.page,
      limit: userFilters.limit,
    };

    if (userFilters.search.trim()) {
      next.search = userFilters.search.trim();
    }

    if (userFilters.role) {
      next.role = userFilters.role;
    }

    if (userFilters.isActive) {
      next.isActive = userFilters.isActive;
    }

    return next;
  }, [userFilters]);

  const cleanTransactionFilters = useMemo(() => {
    const next = {
      page: transactionFilters.page,
      limit: transactionFilters.limit,
    };

    if (transactionFilters.search.trim()) {
      next.search = transactionFilters.search.trim();
    }

    if (transactionFilters.userId.trim()) {
      next.userId = transactionFilters.userId.trim();
    }

    if (transactionFilters.status.trim()) {
      next.status = transactionFilters.status.trim();
    }

    return next;
  }, [transactionFilters]);

  const fetchOverview = useCallback(async () => {
    if (!isAdmin) {
      setLoadingOverview(false);
      return;
    }

    setLoadingOverview(true);

    try {
      const res = await getAdminOverview();
      setOverview(res.data?.data || null);
    } catch (err) {
      toast.error(getApiError(err, 'Failed to load admin overview.'));
    } finally {
      setLoadingOverview(false);
    }
  }, [isAdmin]);

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) {
      return;
    }

    setLoadingUsers(true);

    try {
      const res = await getAdminUsers(cleanUserFilters);
      setUsersData(res.data?.data || null);
    } catch (err) {
      toast.error(getApiError(err, 'Failed to load users.'));
    } finally {
      setLoadingUsers(false);
    }
  }, [cleanUserFilters, isAdmin]);

  const fetchTransactions = useCallback(async () => {
    if (!isAdmin) {
      return;
    }

    setLoadingTransactions(true);

    try {
      const res = await getAdminTransactions(cleanTransactionFilters);
      setTransactionsData(res.data?.data || null);
    } catch (err) {
      toast.error(getApiError(err, 'Failed to load transactions.'));
    } finally {
      setLoadingTransactions(false);
    }
  }, [cleanTransactionFilters, isAdmin]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (activeTab === TABS.USERS) {
      fetchUsers();
    }
  }, [activeTab, fetchUsers]);

  useEffect(() => {
    if (activeTab === TABS.TRANSACTIONS) {
      fetchTransactions();
    }
  }, [activeTab, fetchTransactions]);

  if (!isAdmin) {
    return <AdminAccessDenied />;
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
              Feature 15 — RBAC Protected
            </p>

            <h1 className="mt-1 text-3xl font-extrabold text-gray-900">
              Admin Panel
            </h1>

            <p className="mt-1 text-gray-600">
              Manage users, monitor transactions, and restrict unsafe accounts.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/dashboard"
              className="rounded-xl bg-gray-800 px-4 py-2 font-bold text-white"
            >
              Dashboard
            </Link>

            <button
              type="button"
              onClick={() => {
                fetchOverview();
                fetchUsers();
                fetchTransactions();
              }}
              className="rounded-xl bg-blue-700 px-4 py-2 font-bold text-white"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-3 rounded-2xl bg-gray-100 p-3">
          <TabButton
            active={activeTab === TABS.OVERVIEW}
            onClick={() => setActiveTab(TABS.OVERVIEW)}
          >
            📊 Overview
          </TabButton>

          <TabButton
            active={activeTab === TABS.USERS}
            onClick={() => setActiveTab(TABS.USERS)}
          >
            👥 Users
          </TabButton>

          <TabButton
            active={activeTab === TABS.TRANSACTIONS}
            onClick={() => setActiveTab(TABS.TRANSACTIONS)}
          >
            💸 Transactions
          </TabButton>
        </div>

        {activeTab === TABS.OVERVIEW && (
          <OverviewTab
            overview={overview}
            loading={loadingOverview}
          />
        )}

        {activeTab === TABS.USERS && (
          <UsersTab
            usersData={usersData}
            loading={loadingUsers}
            userFilters={userFilters}
            setUserFilters={setUserFilters}
            onRefresh={fetchUsers}
          />
        )}

        {activeTab === TABS.TRANSACTIONS && (
          <TransactionsTab
            transactionsData={transactionsData}
            loading={loadingTransactions}
            transactionFilters={transactionFilters}
            setTransactionFilters={setTransactionFilters}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminPanelPage;
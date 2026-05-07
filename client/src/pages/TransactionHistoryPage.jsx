import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import DashboardLayout from '../components/layout/DashboardLayout';
import { getTransactionHistory } from '../services/transferService';

const fmt = (value) => {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 2,
  }).format(value ?? 0);
};

const fmtDate = (iso) => {
  if (!iso) {
    return '—';
  }

  try {
    return new Date(iso).toLocaleString('en-BD', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const fmtDateOnly = (iso) => {
  if (!iso) {
    return '';
  }

  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

const maskAccNum = (raw) => {
  if (!raw) {
    return '—';
  }

  const clean = String(raw).replace(/\s/g, '');

  if (clean.length <= 4) {
    return raw;
  }

  return (
    clean.slice(0, -4).replace(/./g, '•') + clean.slice(-4)
  ).match(/.{1,4}/g)?.join(' ') ?? raw;
};

const normalizeSearch = (value) => {
  return String(value || '').toLowerCase();
};

const getTxnType = (txn) => {
  return txn.transactionType || txn.type || '—';
};

const getFromAccount = (txn) => {
  return (
    txn.fromAccount ||
    txn.senderAccountNumber ||
    txn.fromAccountNumber ||
    '—'
  );
};

const getToAccount = (txn) => {
  return (
    txn.toAccount ||
    txn.receiverAccountNumber ||
    txn.toAccountNumber ||
    '—'
  );
};

const StatusPill = ({ status }) => {
  const map = {
    completed: 'bg-emerald-900/50 text-emerald-400',
    pending: 'bg-amber-900/50 text-amber-400',
    failed: 'bg-red-900/50 text-red-400',
  };

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
        map[String(status || '').toLowerCase()] || 'bg-slate-700 text-slate-300'
      }`}
    >
      {status || '—'}
    </span>
  );
};

const TypeChip = ({ type }) => {
  const cleanType = String(type || '').toUpperCase();
  const isDebit = cleanType === 'DEBIT';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
        isDebit
          ? 'bg-red-500/15 text-red-400'
          : 'bg-emerald-500/15 text-emerald-400'
      }`}
    >
      {isDebit ? '↑' : '↓'} {cleanType || '—'}
    </span>
  );
};

const EmptyState = ({ filtered }) => {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="text-5xl">{filtered ? '🔍' : '📭'}</span>

      <p className="text-base font-bold text-slate-300">
        {filtered ? 'No matching transactions' : 'No transactions yet'}
      </p>

      <p className="text-sm text-slate-500">
        {filtered ? (
          'Try adjusting your filters or search term.'
        ) : (
          <>
            Make your first transfer on the{' '}
            <Link to="/transfer" className="text-blue-400 underline">
              Transfer page
            </Link>
            .
          </>
        )}
      </p>
    </div>
  );
};

const SkeletonRow = () => {
  return (
    <tr>
      {[...Array(8)].map((_, index) => (
        <td key={index} className="px-4 py-3">
          <div className="h-4 w-full animate-pulse rounded-lg bg-slate-700" />
        </td>
      ))}
    </tr>
  );
};

const initFilters = () => {
  return {
    search: '',
    type: 'ALL',
    status: 'ALL',
    dateFrom: '',
    dateTo: '',
    amtMin: '',
    amtMax: '',
  };
};

const PAGE_SIZE = 15;

const TransactionHistoryPage = () => {
  const [allTxns, setAllTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(initFilters());
  const [page, setPage] = useState(1);

  const fetchAll = useCallback(async () => {
    setLoading(true);

    try {
      // IMPORTANT:
      // Admins must use the same personal transaction-history endpoint as normal users.
      // This endpoint returns only req.user.id transactions.
      // All-user transaction monitoring remains only in Admin Panel → Transactions tab.
      const res = await getTransactionHistory(1, 200);

      const data = res.data?.data || {};
      setAllTxns(data.transactions || []);
    } catch {
      toast.error('Failed to load transaction history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = allTxns.filter((txn) => {
    const {
      search,
      type,
      status,
      dateFrom,
      dateTo,
      amtMin,
      amtMax,
    } = filters;

    const transactionType = getTxnType(txn);

    if (type !== 'ALL' && transactionType !== type) {
      return false;
    }

    if (
      status !== 'ALL' &&
      String(txn.status || '').toLowerCase() !== status
    ) {
      return false;
    }

    if (dateFrom) {
      if (!txn.createdAt || new Date(txn.createdAt) < new Date(dateFrom)) {
        return false;
      }
    }

    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);

      if (!txn.createdAt || new Date(txn.createdAt) > end) {
        return false;
      }
    }

    const amount = Number(txn.amount || 0);

    if (amtMin && amount < Number(amtMin)) {
      return false;
    }

    if (amtMax && amount > Number(amtMax)) {
      return false;
    }

    if (search) {
      const q = normalizeSearch(search);

      const haystack = [
        txn.id,
        txn.reference,
        getFromAccount(txn),
        getToAccount(txn),
        txn.receiverName,
        txn.beneficiaryName,
        txn.description,
        txn.status,
        txn.amount,
      ].join(' ').toLowerCase();

      if (!haystack.includes(q)) {
        return false;
      }
    }

    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const setFilter = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));

    setPage(1);
  };

  const clearFilters = () => {
    setFilters(initFilters());
    setPage(1);
  };

  const hasActiveFilters = Object.values(filters).some(
    (value) => value !== '' && value !== 'ALL'
  );

  const totalDebit = filtered
    .filter((txn) => getTxnType(txn) === 'DEBIT')
    .reduce((sum, txn) => sum + Number(txn.amount || 0), 0);

  const totalCredit = filtered
    .filter((txn) => getTxnType(txn) === 'CREDIT')
    .reduce((sum, txn) => sum + Number(txn.amount || 0), 0);

  return (
    <DashboardLayout>
      <div className="-m-8 min-h-screen bg-slate-950 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <nav className="flex items-center gap-2 text-sm text-slate-500">
            <Link
              to="/dashboard"
              className="transition-colors hover:text-blue-400"
            >
              Dashboard
            </Link>

            <span>/</span>

            <span className="font-semibold text-slate-300">
              Transaction History
            </span>
          </nav>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              

              <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white">
                Transaction History
              </h1>

              
            </div>

            <div className="flex gap-3">
              <Link
                to="/transfer"
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-blue-500"
              >
                💸 New Transfer
              </Link>

              <button
                type="button"
                onClick={fetchAll}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-700"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: 'Transactions',
                value: filtered.length,
                icon: '📄',
                grad: 'from-indigo-800 to-indigo-950',
              },
              {
                label: 'Total Debited',
                value: fmt(totalDebit),
                icon: '↑',
                grad: 'from-red-800 to-red-950',
              },
              {
                label: 'Total Credited',
                value: fmt(totalCredit),
                icon: '↓',
                grad: 'from-emerald-800 to-emerald-950',
              },
            ].map((card) => (
              <div
                key={card.label}
                className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${card.grad} p-5 shadow-lg`}
              >
                <span className="pointer-events-none absolute -right-3 -top-3 select-none text-7xl opacity-10">
                  {card.icon}
                </span>

                <p className="text-xs font-semibold text-white/70">
                  {card.label}
                </p>

                <p className="mt-2 text-2xl font-extrabold tracking-tight text-white">
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-lg">
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-[180px] flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Search
                </label>

                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilter('search', e.target.value)}
                  placeholder="Reference, account number, amount, description..."
                  className="form-input text-sm"
                />
              </div>

              <div className="min-w-[120px]">
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Type
                </label>

                <select
                  value={filters.type}
                  onChange={(e) => setFilter('type', e.target.value)}
                  className="form-input text-sm"
                >
                  <option value="ALL">All Types</option>
                  <option value="DEBIT">Debit</option>
                  <option value="CREDIT">Credit</option>
                </select>
              </div>

              <div className="min-w-[120px]">
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Status
                </label>

                <select
                  value={filters.status}
                  onChange={(e) => setFilter('status', e.target.value)}
                  className="form-input text-sm"
                >
                  <option value="ALL">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              <div className="min-w-[140px]">
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Date From
                </label>

                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilter('dateFrom', e.target.value)}
                  className="form-input text-sm"
                />
              </div>

              <div className="min-w-[140px]">
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Date To
                </label>

                <input
                  type="date"
                  value={filters.dateTo}
                  max={fmtDateOnly(new Date().toISOString())}
                  onChange={(e) => setFilter('dateTo', e.target.value)}
                  className="form-input text-sm"
                />
              </div>

              <div className="min-w-[110px]">
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Min Amount
                </label>

                <input
                  type="number"
                  min="0"
                  value={filters.amtMin}
                  onChange={(e) => setFilter('amtMin', e.target.value)}
                  placeholder="0"
                  className="form-input text-sm"
                />
              </div>

              <div className="min-w-[110px]">
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Max Amount
                </label>

                <input
                  type="number"
                  min="0"
                  value={filters.amtMax}
                  onChange={(e) => setFilter('amtMax', e.target.value)}
                  placeholder="∞"
                  className="form-input text-sm"
                />
              </div>

              {hasActiveFilters && (
                <div className="self-end">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-xl bg-slate-700 px-4 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-slate-600"
                  >
                    ✕ Clear
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800/60">
                    {[
                      'Type',
                      'Reference',
                      'Sender Account',
                      'Receiver Account',
                      'Description',
                      'Amount',
                      'Status',
                      'Date',
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800">
                  {loading ? (
                    [...Array(6)].map((_, index) => (
                      <SkeletonRow key={index} />
                    ))
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <EmptyState filtered={hasActiveFilters} />
                      </td>
                    </tr>
                  ) : (
                    paginated.map((txn) => {
                      const type = getTxnType(txn);
                      const isDebit = type === 'DEBIT';

                      return (
                        <tr
                          key={txn.id}
                          className="transition hover:bg-slate-800/50"
                        >
                          <td className="px-4 py-3">
                            <TypeChip type={type} />
                          </td>

                          <td className="px-4 py-3 font-mono text-xs text-slate-300">
                            {txn.reference || '—'}
                          </td>

                          <td className="px-4 py-3 font-mono text-xs text-slate-400">
                            {maskAccNum(getFromAccount(txn))}
                          </td>

                          <td className="px-4 py-3 font-mono text-xs text-slate-400">
                            {maskAccNum(getToAccount(txn))}
                          </td>

                          <td className="max-w-[180px] px-4 py-3">
                            <p className="truncate text-xs text-slate-400">
                              {txn.description ||
                                txn.receiverName ||
                                txn.beneficiaryName ||
                                '—'}
                            </p>
                          </td>

                          <td
                            className={`px-4 py-3 text-sm font-extrabold ${
                              isDebit ? 'text-red-400' : 'text-emerald-400'
                            }`}
                          >
                            {isDebit ? '−' : '+'}
                            {fmt(txn.amount)}
                          </td>

                          <td className="px-4 py-3">
                            <StatusPill status={txn.status} />
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                            {fmtDate(txn.createdAt)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {!loading && filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-slate-700 px-5 py-3">
                <span className="text-xs text-slate-500">
                  Showing {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filtered.length)} of{' '}
                  {filtered.length}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((prev) => prev - 1)}
                    className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 disabled:opacity-40"
                  >
                    ← Prev
                  </button>

                  <span className="text-xs font-semibold text-slate-400">
                    {safePage} / {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((prev) => prev + 1)}
                    className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-emerald-800/40 bg-emerald-950/30 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-900/50 text-xl">
                🔐
              </div>

              <div>
                <h3 className="font-bold text-emerald-300">
                  Security Notice
                </h3>

                <p className="mt-1 text-xs leading-5 text-emerald-400/80">
                  Every transaction record is encrypted at rest using RSA + ECC
                  dual-asymmetric encryption. Each field carries an integrity
                  tag, and unauthorized modification is detected on read.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TransactionHistoryPage;
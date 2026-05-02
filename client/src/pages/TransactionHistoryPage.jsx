import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/layout/DashboardLayout';
import { getTransactionHistory } from '../services/transferService';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const fmt = (v) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 2 }).format(v ?? 0);

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-BD', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
};

const fmtDateOnly = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toISOString().slice(0, 10); }
  catch { return ''; }
};

const maskAccNum = (raw) => {
  if (!raw) return '—';
  const c = String(raw).replace(/\s/g, '');
  if (c.length <= 4) return raw;
  return (c.slice(0, -4).replace(/./g, '•') + c.slice(-4)).match(/.{1,4}/g)?.join(' ') ?? raw;
};

/* ── Status pill ─────────────────────────────────────────────────────────── */
const StatusPill = ({ status }) => {
  const map = {
    completed: 'bg-emerald-900/50 text-emerald-400',
    pending:   'bg-amber-900/50   text-amber-400',
    failed:    'bg-red-900/50     text-red-400',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${map[status?.toLowerCase()] ?? 'bg-slate-700 text-slate-300'}`}>
      {status ?? '—'}
    </span>
  );
};

/* ── Type chip ───────────────────────────────────────────────────────────── */
const TypeChip = ({ type }) => {
  const isDebit = type === 'DEBIT';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${isDebit ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
      {isDebit ? '↑' : '↓'} {type}
    </span>
  );
};

/* ── Empty State ─────────────────────────────────────────────────────────── */
const EmptyState = ({ filtered }) => (
  <div className="flex flex-col items-center gap-3 py-16 text-center">
    <span className="text-5xl">{filtered ? '🔍' : '📭'}</span>
    <p className="text-base font-bold text-slate-300">
      {filtered ? 'No matching transactions' : 'No transactions yet'}
    </p>
    <p className="text-sm text-slate-500">
      {filtered
        ? 'Try adjusting your filters or search term.'
        : <>Make your first transfer on the <Link to="/transfer" className="text-blue-400 underline">Transfer page</Link>.</>}
    </p>
  </div>
);

/* ── Skeleton row ────────────────────────────────────────────────────────── */
const SkeletonRow = () => (
  <tr>
    {[...Array(6)].map((_, i) => (
      <td key={i} className="px-4 py-3">
        <div className="h-4 w-full animate-pulse rounded-lg bg-slate-700" />
      </td>
    ))}
  </tr>
);

/* ── Filter defaults ─────────────────────────────────────────────────────── */
const initFilters = () => ({
  search:    '',
  type:      'ALL',    // ALL | DEBIT | CREDIT
  status:    'ALL',    // ALL | completed | pending | failed
  dateFrom:  '',
  dateTo:    '',
  amtMin:    '',
  amtMax:    '',
});

const PAGE_SIZE = 15;

/* ═══════════════════════════════════════════════════════════════════════════ */
/* Main Page                                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */
const TransactionHistoryPage = () => {
  const [allTxns,   setAllTxns]   = useState([]);   // all fetched (client-filtered)
  const [loading,   setLoading]   = useState(true);
  const [filters,   setFilters]   = useState(initFilters());
  const [page,      setPage]      = useState(1);

  /* ── Fetch ALL transactions (we do client-side filtering) ──────────────── */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch up to 200 in one shot for client-side filter UX.
      const res = await getTransactionHistory(1, 200);
      setAllTxns(res.data?.data?.transactions ?? []);
    } catch {
      toast.error('Failed to load transaction history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── Client-side filter logic ──────────────────────────────────────────── */
  const filtered = allTxns.filter((t) => {
    const { search, type, status, dateFrom, dateTo, amtMin, amtMax } = filters;

    if (type   !== 'ALL' && t.transactionType !== type)          return false;
    if (status !== 'ALL' && t.status?.toLowerCase() !== status)  return false;

    if (dateFrom) {
      if (!t.createdAt || new Date(t.createdAt) < new Date(dateFrom)) return false;
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      if (!t.createdAt || new Date(t.createdAt) > end) return false;
    }

    const amt = Number(t.amount ?? 0);
    if (amtMin && amt < Number(amtMin)) return false;
    if (amtMax && amt > Number(amtMax)) return false;

    if (search) {
      const q = search.toLowerCase();
      const haystack = [
        t.reference, t.toAccount, t.fromAccount,
        t.receiverName, t.description, t.status,
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });

  /* ── Pagination on filtered ────────────────────────────────────────────── */
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  /* ── Reset page when filters change ───────────────────────────────────── */
  const setFilter = (key, val) => {
    setFilters((prev) => ({ ...prev, [key]: val }));
    setPage(1);
  };

  const clearFilters = () => { setFilters(initFilters()); setPage(1); };

  const hasActiveFilters = Object.values(filters).some((v) => v !== '' && v !== 'ALL');

  /* ── Summary stats ─────────────────────────────────────────────────────── */
  const totalDebit  = filtered.filter((t) => t.transactionType === 'DEBIT') .reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const totalCredit = filtered.filter((t) => t.transactionType === 'CREDIT').reduce((s, t) => s + Number(t.amount ?? 0), 0);

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <DashboardLayout>
      <div className="-m-8 min-h-screen bg-slate-950 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-slate-500">
            <Link to="/dashboard" className="hover:text-blue-400 transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="font-semibold text-slate-300">Transaction History</span>
          </nav>

          {/* Header row */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
                Feature 12 — Secure Banking
              </p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white">
                Transaction History
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                All records are encrypted at rest. MAC integrity verified on every read.
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                to="/transfer"
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-blue-500"
              >
                💸 New Transfer
              </Link>
              <button
                id="btn-refresh-history" type="button" onClick={fetchAll}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-700"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* ── Summary cards ──────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Transactions', value: filtered.length, icon: '📄', grad: 'from-indigo-800 to-indigo-950' },
              { label: 'Total Debited',  value: fmt(totalDebit),  icon: '↑', grad: 'from-red-800 to-red-950'     },
              { label: 'Total Credited', value: fmt(totalCredit), icon: '↓', grad: 'from-emerald-800 to-emerald-950' },
            ].map((c) => (
              <div key={c.label} className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${c.grad} p-5 shadow-lg`}>
                <span className="pointer-events-none absolute -right-3 -top-3 text-7xl opacity-10 select-none">{c.icon}</span>
                <p className="text-xs font-semibold text-white/70">{c.label}</p>
                <p className="mt-2 text-2xl font-extrabold tracking-tight text-white">{c.value}</p>
              </div>
            ))}
          </div>

          {/* ── Filters ────────────────────────────────────────────────── */}
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-lg">
            <div className="flex flex-wrap items-center gap-4">

              {/* Search */}
              <div className="flex-1 min-w-[180px]">
                <label className="mb-1 block text-xs font-medium text-slate-400">Search</label>
                <input
                  id="filter-search" type="text"
                  value={filters.search}
                  onChange={(e) => setFilter('search', e.target.value)}
                  placeholder="Reference, account, description…"
                  className="form-input text-sm"
                />
              </div>

              {/* Type */}
              <div className="min-w-[120px]">
                <label className="mb-1 block text-xs font-medium text-slate-400">Type</label>
                <select id="filter-type" value={filters.type}
                  onChange={(e) => setFilter('type', e.target.value)}
                  className="form-input text-sm"
                >
                  <option value="ALL">All Types</option>
                  <option value="DEBIT">Debit (↑)</option>
                  <option value="CREDIT">Credit (↓)</option>
                </select>
              </div>

              {/* Status */}
              <div className="min-w-[120px]">
                <label className="mb-1 block text-xs font-medium text-slate-400">Status</label>
                <select id="filter-status" value={filters.status}
                  onChange={(e) => setFilter('status', e.target.value)}
                  className="form-input text-sm"
                >
                  <option value="ALL">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              {/* Date From */}
              <div className="min-w-[140px]">
                <label className="mb-1 block text-xs font-medium text-slate-400">Date From</label>
                <input id="filter-date-from" type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilter('dateFrom', e.target.value)}
                  className="form-input text-sm"
                />
              </div>

              {/* Date To */}
              <div className="min-w-[140px]">
                <label className="mb-1 block text-xs font-medium text-slate-400">Date To</label>
                <input id="filter-date-to" type="date"
                  value={filters.dateTo}
                  max={fmtDateOnly(new Date().toISOString())}
                  onChange={(e) => setFilter('dateTo', e.target.value)}
                  className="form-input text-sm"
                />
              </div>

              {/* Amt Min */}
              <div className="min-w-[110px]">
                <label className="mb-1 block text-xs font-medium text-slate-400">Min Amount</label>
                <input id="filter-amt-min" type="number" min="0"
                  value={filters.amtMin}
                  onChange={(e) => setFilter('amtMin', e.target.value)}
                  placeholder="0"
                  className="form-input text-sm"
                />
              </div>

              {/* Amt Max */}
              <div className="min-w-[110px]">
                <label className="mb-1 block text-xs font-medium text-slate-400">Max Amount</label>
                <input id="filter-amt-max" type="number" min="0"
                  value={filters.amtMax}
                  onChange={(e) => setFilter('amtMax', e.target.value)}
                  placeholder="∞"
                  className="form-input text-sm"
                />
              </div>

              {/* Clear */}
              {hasActiveFilters && (
                <div className="self-end">
                  <button id="btn-clear-filters" type="button" onClick={clearFilters}
                    className="rounded-xl bg-slate-700 px-4 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-slate-600"
                  >
                    ✕ Clear
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Table ──────────────────────────────────────────────────── */}
          <div className="rounded-3xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800/60">
                    {['Type', 'Reference', 'From / To Account', 'Description', 'Amount', 'Status', 'Date'].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {loading ? (
                    [...Array(6)].map((_, i) => <SkeletonRow key={i} />)
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState filtered={hasActiveFilters} />
                      </td>
                    </tr>
                  ) : (
                    paginated.map((txn) => {
                      const isDebit = txn.transactionType === 'DEBIT';
                      return (
                        <tr key={txn.id}
                          className="transition hover:bg-slate-800/50"
                        >
                          <td className="px-4 py-3">
                            <TypeChip type={txn.transactionType} />
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-300">
                            {txn.reference ?? '—'}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">
                            {isDebit
                              ? <span>→ {maskAccNum(txn.toAccount)}</span>
                              : <span>← {maskAccNum(txn.fromAccount)}</span>}
                          </td>
                          <td className="px-4 py-3 max-w-[160px]">
                            <p className="truncate text-xs text-slate-400">
                              {txn.description || txn.receiverName || '—'}
                            </p>
                          </td>
                          <td className={`px-4 py-3 text-sm font-extrabold ${isDebit ? 'text-red-400' : 'text-emerald-400'}`}>
                            {isDebit ? '−' : '+'}{fmt(txn.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill status={txn.status} />
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                            {fmtDate(txn.createdAt)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            {!loading && filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-slate-700 px-5 py-3">
                <span className="text-xs text-slate-500">
                  Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div className="flex items-center gap-2">
                  <button id="btn-prev-page" type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs font-semibold text-slate-400">
                    {safePage} / {totalPages}
                  </span>
                  <button id="btn-next-page" type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Security notice */}
          <div className="rounded-3xl border border-emerald-800/40 bg-emerald-950/30 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-900/50 text-xl">🔐</div>
              <div>
                <h3 className="font-bold text-emerald-300">Security Notice</h3>
                <p className="mt-1 text-xs leading-5 text-emerald-400/80">
                  Every transaction record is encrypted at rest using <strong>RSA + ECC dual-asymmetric encryption</strong>.
                  Each field carries an <strong>HMAC-SHA256 integrity tag</strong> — any unauthorized modification is
                  detected on read. Data is only decrypted inside your authenticated session and never stored in plaintext.
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

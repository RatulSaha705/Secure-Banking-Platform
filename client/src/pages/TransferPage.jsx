import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/layout/DashboardLayout';
import { initiateTransfer, getTransactionHistory } from '../services/transferService';
import { getAccountBalance } from '../services/accountService';

/* ─────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

const formatCurrency = (v) =>
  new Intl.NumberFormat('en-BD', {
    style: 'currency', currency: 'BDT', maximumFractionDigits: 2,
  }).format(v ?? 0);

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-BD', {
      month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
};

const maskAccountNumber = (raw) => {
  if (!raw) return '—';
  const cleaned = String(raw).replace(/\s/g, '');
  if (cleaned.length <= 4) return raw;
  const masked = cleaned.slice(0, -4).replace(/./g, '•');
  const full   = masked + cleaned.slice(-4);
  return full.match(/.{1,4}/g)?.join(' ') ?? full;
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* Sub-components                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */

/** Status badge for a transaction */
const TxnStatusBadge = ({ status }) => {
  const cfg = {
    completed: { bg: 'bg-emerald-900/50', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Completed' },
    pending:   { bg: 'bg-amber-900/50',   text: 'text-amber-400',   dot: 'bg-amber-400',   label: 'Pending'   },
    failed:    { bg: 'bg-red-900/50',     text: 'text-red-400',     dot: 'bg-red-400',     label: 'Failed'    },
  }[status?.toLowerCase()] ?? { bg: 'bg-slate-700', text: 'text-slate-300', dot: 'bg-slate-400', label: status ?? '—' };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

/** Single transaction row in the history list */
const TxnRow = ({ txn }) => {
  const isDebit = txn.transactionType === 'DEBIT';
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-800/70 px-4 py-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${isDebit ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
        {isDebit ? '↑' : '↓'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-100">
          {isDebit ? `To ${maskAccountNumber(txn.toAccount)}` : `From ${maskAccountNumber(txn.fromAccount)}`}
        </p>
        <p className="truncate text-xs text-slate-400">
          {txn.reference} · {formatDate(txn.createdAt)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-bold ${isDebit ? 'text-red-400' : 'text-emerald-400'}`}>
          {isDebit ? '−' : '+'}{formatCurrency(txn.amount)}
        </p>
        <TxnStatusBadge status={txn.status} />
      </div>
    </div>
  );
};

/* ── Receipt Modal ─────────────────────────────────────────────────────────── */
const ReceiptModal = ({ receipt, onClose }) => {
  if (!receipt) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">

        {/* Success header */}
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 px-6 py-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-4xl">
            ✅
          </div>
          <h2 className="mt-4 text-2xl font-extrabold text-white">Transfer Successful!</h2>
          <p className="mt-1 text-sm text-emerald-200">
            Your money is on its way.
          </p>
        </div>

        {/* Receipt body */}
        <div className="space-y-3 px-6 py-6">
          {[
            { label: 'Reference',     value: receipt.reference,     mono: true  },
            { label: 'Amount',        value: formatCurrency(receipt.amount)      },
            { label: 'To Account',    value: maskAccountNumber(receipt.toAccount), mono: true },
            { label: 'Receiver',      value: receipt.receiverName ?? '—'         },
            { label: 'Bank',          value: receipt.receiverBank  ?? '—'         },
            { label: 'New Balance',   value: formatCurrency(receipt.newBalance)   },
            { label: 'Status',        value: <TxnStatusBadge status={receipt.status} /> },
          ].map(({ label, value, mono }) => (
            <div key={label} className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-2.5">
              <span className="text-xs font-medium text-slate-400">{label}</span>
              <span className={`text-sm font-bold text-slate-100 ${mono ? 'font-mono' : ''}`}>{value}</span>
            </div>
          ))}
        </div>

        <div className="px-6 pb-6">
          <button
            id="btn-close-receipt"
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition hover:bg-blue-500 active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Transfer Form ─────────────────────────────────────────────────────────── */
const TRANSFER_TYPES = [
  { value: 'SAME_BANK',  label: '🏦 Same Bank',   hint: 'To another SecureBank account' },
  { value: 'OTHER_BANK', label: '🏢 Other Bank',  hint: 'External bank transfer'        },
];

const initForm = () => ({
  toAccountNumber: '',
  amount:          '',
  receiverName:    '',
  receiverBank:    '',
  description:     '',
  transferType:    'SAME_BANK',
});

/* ─────────────────────────────────────────────────────────────────────────── */
/* Main Page                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

const TransferPage = () => {
  const [balance,    setBalance]    = useState(null);
  const [form,       setForm]       = useState(initForm());
  const [errors,     setErrors]     = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [receipt,    setReceipt]    = useState(null);
  const [history,    setHistory]    = useState([]);
  const [histPage,   setHistPage]   = useState(1);
  const [histMeta,   setHistMeta]   = useState({ totalPages: 1, totalCount: 0 });
  const [histLoading,setHistLoading]= useState(false);
  const amountRef = useRef(null);

  // ── Load balance ──────────────────────────────────────────────────────────
  const fetchBalance = useCallback(async () => {
    try {
      const res = await getAccountBalance();
      setBalance(res.data?.data ?? null);
    } catch {/* silent */}
  }, []);

  // ── Load history ──────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async (page = 1) => {
    setHistLoading(true);
    try {
      const res = await getTransactionHistory(page, 8);
      const d   = res.data?.data;
      setHistory(d?.transactions ?? []);
      setHistMeta({ totalPages: d?.totalPages ?? 1, totalCount: d?.totalCount ?? 0 });
      setHistPage(page);
    } catch {
      toast.error('Failed to load transaction history.');
    } finally {
      setHistLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
    fetchHistory(1);
  }, [fetchBalance, fetchHistory]);

  // ── Form handling ─────────────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!form.toAccountNumber.trim()) errs.toAccountNumber = 'Recipient account number is required';
    const amt = Number(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) errs.amount = 'Enter a valid positive amount';
    if (amt > 1_000_000) errs.amount = 'Single transfer limit is BDT 10,00,000';
    if (balance && amt > balance.availableBalance) {
      errs.amount = `Insufficient balance (available: ${formatCurrency(balance.availableBalance)})`;
    }
    if (form.transferType === 'OTHER_BANK' && !form.receiverBank.trim()) {
      errs.receiverBank = 'Bank name is required for external transfers';
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fieldErrs = validate();
    if (Object.keys(fieldErrs).length > 0) { setErrors(fieldErrs); return; }

    setSubmitting(true);
    try {
      const payload = {
        toAccountNumber: form.toAccountNumber.trim(),
        amount:          Number(form.amount),
        receiverName:    form.receiverName.trim()  || null,
        receiverBank:    form.receiverBank.trim()  || null,
        description:     form.description.trim()   || null,
        transferType:    form.transferType,
      };

      const res = await initiateTransfer(payload);
      const rec = res.data?.data;

      setReceipt(rec);
      setForm(initForm());
      setErrors({});
      // Refresh balance and history
      await fetchBalance();
      await fetchHistory(1);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseReceipt = () => setReceipt(null);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      {/* Receipt modal */}
      <ReceiptModal receipt={receipt} onClose={handleCloseReceipt} />

      <div className="-m-8 min-h-screen bg-slate-950 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">

          {/* ── Breadcrumb ─────────────────────────────────────────────── */}
          <nav className="flex items-center gap-2 text-sm text-slate-500">
            <Link to="/dashboard" className="hover:text-blue-400 transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="font-semibold text-slate-300">Money Transfer</span>
          </nav>

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
              Feature 10 — Secure Banking
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white">
              Money Transfer
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Send money securely. All transfer data is encrypted at rest with HMAC-SHA256 integrity.
            </p>
          </div>

          {/* ── Balance strip ──────────────────────────────────────────── */}
          {balance && (
            <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-r from-blue-900/50 to-indigo-900/50 border border-blue-800/50 px-5 py-4">
              <div>
                <p className="text-xs font-medium text-blue-300">Available Balance</p>
                <p className="text-2xl font-extrabold text-white">{formatCurrency(balance.availableBalance)}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-slate-400">Account</p>
                <p className="font-mono text-sm font-bold text-slate-300">{maskAccountNumber(balance.accountNumber)}</p>
              </div>
            </div>
          )}

          {/* ── Two-column layout ──────────────────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">

            {/* ── LEFT: Transfer Form ────────────────────────────────── */}
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-xl">💸</div>
                <div>
                  <h2 className="text-lg font-bold text-white">New Transfer</h2>
                  <p className="text-xs text-slate-400">Fill in the details below</p>
                </div>
              </div>

              {/* Transfer type selector */}
              <div className="mb-5 grid grid-cols-2 gap-3">
                {TRANSFER_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    id={`btn-transfer-type-${t.value.toLowerCase()}`}
                    onClick={() => setForm((prev) => ({ ...prev, transferType: t.value }))}
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                      form.transferType === t.value
                        ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <span className="font-semibold">{t.label}</span>
                    <br />
                    <span className="text-xs opacity-75">{t.hint}</span>
                  </button>
                ))}
              </div>

              <form id="transfer-form" onSubmit={handleSubmit} noValidate className="space-y-4">

                {/* Recipient account number */}
                <div>
                  <label htmlFor="toAccountNumber" className="form-label">
                    Recipient Account Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="toAccountNumber"
                    name="toAccountNumber"
                    type="text"
                    value={form.toAccountNumber}
                    onChange={handleChange}
                    placeholder="e.g. 1234 5678 9012 3456"
                    className="form-input mt-1"
                    autoComplete="off"
                  />
                  {errors.toAccountNumber && (
                    <p className="mt-1 text-xs text-red-400">{errors.toAccountNumber}</p>
                  )}
                </div>

                {/* Amount */}
                <div>
                  <label htmlFor="amount" className="form-label">
                    Amount (BDT) <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    min="1"
                    step="0.01"
                    ref={amountRef}
                    value={form.amount}
                    onChange={handleChange}
                    placeholder="0.00"
                    className="form-input mt-1"
                  />
                  {errors.amount && (
                    <p className="mt-1 text-xs text-red-400">{errors.amount}</p>
                  )}
                </div>

                {/* Receiver name */}
                <div>
                  <label htmlFor="receiverName" className="form-label">Receiver Name (optional)</label>
                  <input
                    id="receiverName"
                    name="receiverName"
                    type="text"
                    value={form.receiverName}
                    onChange={handleChange}
                    placeholder="e.g. Jane Doe"
                    className="form-input mt-1"
                    autoComplete="off"
                  />
                </div>

                {/* Receiver bank — only for OTHER_BANK */}
                {form.transferType === 'OTHER_BANK' && (
                  <div>
                    <label htmlFor="receiverBank" className="form-label">
                      Receiver Bank Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="receiverBank"
                      name="receiverBank"
                      type="text"
                      value={form.receiverBank}
                      onChange={handleChange}
                      placeholder="e.g. Dutch-Bangla Bank"
                      className="form-input mt-1"
                      autoComplete="off"
                    />
                    {errors.receiverBank && (
                      <p className="mt-1 text-xs text-red-400">{errors.receiverBank}</p>
                    )}
                  </div>
                )}

                {/* Description */}
                <div>
                  <label htmlFor="description" className="form-label">Note / Description (optional)</label>
                  <textarea
                    id="description"
                    name="description"
                    rows={2}
                    value={form.description}
                    onChange={handleChange}
                    placeholder="e.g. Rent payment for May"
                    className="form-input mt-1 resize-none"
                  />
                </div>

                {/* Submit */}
                <button
                  id="btn-submit-transfer"
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Encrypting &amp; sending…
                    </span>
                  ) : (
                    '💸 Send Money'
                  )}
                </button>
              </form>

              {/* Security notice */}
              <div className="mt-5 rounded-2xl bg-slate-800/60 border border-slate-700 px-4 py-3">
                <p className="text-xs leading-5 text-slate-400">
                  🔐 All transfer data is encrypted with <strong className="text-slate-200">RSA + ECC</strong> before
                  storage. MAC integrity (<strong className="text-slate-200">HMAC-SHA256</strong>) is verified on
                  every read. Your balance is updated atomically.
                </p>
              </div>
            </div>

            {/* ── RIGHT: Transaction History ─────────────────────────── */}
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20 text-xl">📄</div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Transaction History</h2>
                    <p className="text-xs text-slate-400">{histMeta.totalCount} total records</p>
                  </div>
                </div>
                <button
                  id="btn-refresh-history"
                  type="button"
                  onClick={() => fetchHistory(histPage)}
                  className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700"
                >
                  🔄 Refresh
                </button>
              </div>

              {histLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-800" />
                  ))}
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                  <span className="text-5xl">📭</span>
                  <p className="text-sm font-semibold text-slate-400">No transactions yet.</p>
                  <p className="text-xs text-slate-500">Your first transfer will appear here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((txn) => (
                    <TxnRow key={txn.id} txn={txn} />
                  ))}
                </div>
              )}

              {/* Pagination */}
              {histMeta.totalPages > 1 && (
                <div className="mt-5 flex items-center justify-between">
                  <button
                    id="btn-history-prev"
                    type="button"
                    disabled={histPage <= 1}
                    onClick={() => fetchHistory(histPage - 1)}
                    className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-slate-400">
                    Page {histPage} of {histMeta.totalPages}
                  </span>
                  <button
                    id="btn-history-next"
                    type="button"
                    disabled={histPage >= histMeta.totalPages}
                    onClick={() => fetchHistory(histPage + 1)}
                    className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
};

export default TransferPage;

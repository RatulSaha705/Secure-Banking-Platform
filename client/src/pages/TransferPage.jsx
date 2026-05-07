import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { initiateTransfer } from '../services/transferService';
import { getAccountBalance } from '../services/accountService';
import {
  getMyBeneficiaries,
  addBeneficiary,
  deleteBeneficiary,
} from '../services/beneficiaryService';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const formatCurrency = (v) =>
  new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 2,
  }).format(v ?? 0);

const maskAccNum = (raw) => {
  if (!raw) return '—';

  const c = String(raw).replace(/\s/g, '');

  if (c.length <= 4) return raw;

  return (
    c.slice(0, -4).replace(/./g, '•') + c.slice(-4)
  ).match(/.{1,4}/g)?.join(' ') ?? raw;
};

const normalise = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const MAX = 5;

/* ── Receipt Modal ───────────────────────────────────────────────────────── */
const ReceiptModal = ({ receipt, onClose }) => {
  if (!receipt) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 px-6 py-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-4xl">
            ✅
          </div>

          <h2 className="mt-4 text-2xl font-extrabold text-white">
            Transfer Successful!
          </h2>

          <p className="mt-1 text-sm text-emerald-200">
            Your money is on its way.
          </p>
        </div>

        <div className="space-y-3 px-6 py-6">
          {[
            {
              label: 'Reference',
              value: receipt.reference,
              mono: true,
            },
            {
              label: 'Amount',
              value: formatCurrency(receipt.amount),
            },
            {
              label: 'To Account',
              value: maskAccNum(receipt.toAccount),
              mono: true,
            },
            {
              label: 'Receiver',
              value: receipt.receiverName ?? '—',
            },
            {
              label: 'New Balance',
              value: formatCurrency(receipt.newBalance),
            },
            {
              label: 'Status',
              value: (
                <span className="font-semibold text-emerald-400">
                  Completed
                </span>
              ),
            },
          ].map(({ label, value, mono }) => (
            <div
              key={label}
              className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-2.5"
            >
              <span className="text-xs font-medium text-slate-400">
                {label}
              </span>

              <span
                className={`text-sm font-bold text-slate-100 ${
                  mono ? 'font-mono' : ''
                }`}
              >
                {value}
              </span>
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

/* ── Beneficiary Card ────────────────────────────────────────────────────── */
const BeneficiaryCard = ({ ben, onSelect, onDelete, deleting }) => (
  <div className="group flex items-center gap-3 rounded-2xl border border-slate-700/50 bg-slate-800/80 px-4 py-3 transition hover:border-blue-600/40">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600/20 text-base font-extrabold text-blue-300">
      {(ben.nickname || ben.beneficiaryName || 'B')[0].toUpperCase()}
    </div>

    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-bold text-slate-100">
        {ben.nickname ? `${ben.nickname}` : ben.beneficiaryName}
      </p>

      <p className="font-mono text-xs text-slate-400">
        {maskAccNum(ben.beneficiaryAccountNumber)}
      </p>
    </div>

    <div className="flex shrink-0 items-center gap-2 opacity-0 transition group-hover:opacity-100">
      <button
        id={`btn-select-beneficiary-${ben.id}`}
        type="button"
        onClick={() => onSelect(ben)}
        className="rounded-lg bg-blue-600/20 px-2.5 py-1 text-xs font-bold text-blue-300 transition hover:bg-blue-600/40"
      >
        Use
      </button>

      <button
        id={`btn-delete-beneficiary-${ben.id}`}
        type="button"
        disabled={deleting === ben.id}
        onClick={() => onDelete(ben.id)}
        className="rounded-lg bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-400 transition hover:bg-red-500/20 disabled:opacity-40"
      >
        {deleting === ben.id ? '…' : '✕'}
      </button>
    </div>
  </div>
);

/* ── Add Beneficiary Mini-form ───────────────────────────────────────────── */
const AddBeneficiaryForm = ({ accountNumber, onSaved, onCancel, isFull }) => {
  const [name, setName] = useState('');
  const [nick, setNick] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);

    try {
      await addBeneficiary({
        beneficiaryName: name.trim(),
        beneficiaryAccountNumber: accountNumber,
        nickname: nick.trim() || null,
      });

      toast.success('Beneficiary saved!');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save beneficiary');
    } finally {
      setSaving(false);
    }
  };

  if (isFull) {
    return (
      <div className="mt-3 rounded-xl border border-amber-700/40 bg-amber-900/30 px-4 py-3">
        <p className="text-xs font-semibold text-amber-400">
          ⚠️ Beneficiary list is full ({MAX}/{MAX}). Remove one to add this
          account.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-blue-600/40 bg-slate-800 px-4 py-4">
      <p className="text-xs font-semibold text-blue-300">
        💾 Save as Beneficiary
      </p>

      <input
        type="text"
        placeholder="Name *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="form-input text-sm"
        autoComplete="off"
      />

      <input
        type="text"
        placeholder="Nickname (optional, e.g. Mom)"
        value={nick}
        onChange={(e) => setNick(e.target.value)}
        className="form-input text-sm"
        autoComplete="off"
      />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white transition hover:bg-blue-500 disabled:opacity-60"
        >
          {saving ? 'Saving…' : '✓ Save'}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

/* ── initForm ────────────────────────────────────────────────────────────── */
const initForm = () => ({
  toAccountNumber: '',
  amount: '',
  receiverName: '',
  description: '',
});

/* ═══════════════════════════════════════════════════════════════════════════ */
/* Main Page                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */
const TransferPage = () => {
  const { currentUser } = useAuth();

  const role = normalizeRole(currentUser?.role);
  const isAdmin = role === 'admin';

  const [balance, setBalance] = useState(null);
  const [form, setForm] = useState(initForm());
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);

  // Beneficiaries are for regular users only.
  // Admins must not add/manage beneficiaries.
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [benLoading, setBenLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const amountRef = useRef(null);

  const isAlreadySaved =
    !isAdmin &&
    beneficiaries.some(
      (b) =>
        normalise(b.beneficiaryAccountNumber) ===
        normalise(form.toAccountNumber)
    );

  const showSavePrompt =
    !isAdmin &&
    form.toAccountNumber.trim().length >= 8 &&
    !isAlreadySaved &&
    !showAddForm;

  const fetchBalance = useCallback(async () => {
    try {
      const res = await getAccountBalance();
      setBalance(res.data?.data ?? null);
    } catch {
      // Silent fail. Transfer validation will still handle missing balance safely.
    }
  }, []);

  const fetchBeneficiaries = useCallback(async () => {
    if (isAdmin) {
      setBeneficiaries([]);
      setBenLoading(false);
      return;
    }

    setBenLoading(true);

    try {
      const res = await getMyBeneficiaries();
      setBeneficiaries(res.data?.data?.beneficiaries ?? []);
    } catch {
      toast.error('Failed to load beneficiaries.');
    } finally {
      setBenLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchBalance();
    fetchBeneficiaries();
  }, [fetchBalance, fetchBeneficiaries]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: null,
      }));
    }

    if (name === 'toAccountNumber') {
      setShowAddForm(false);
    }
  };

  const validate = () => {
    const errs = {};

    if (!form.toAccountNumber.trim()) {
      errs.toAccountNumber = 'Recipient account number is required';
    }

    const amt = Number(form.amount);

    if (!form.amount || Number.isNaN(amt) || amt <= 0) {
      errs.amount = 'Enter a valid positive amount';
    }

    if (amt > 1_000_000) {
      errs.amount = 'Single transfer limit is BDT 10,00,000';
    }

    if (balance && amt > balance.availableBalance) {
      errs.amount = `Insufficient balance (available: ${formatCurrency(
        balance.availableBalance
      )})`;
    }

    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const fieldErrs = validate();

    if (Object.keys(fieldErrs).length > 0) {
      setErrors(fieldErrs);
      return;
    }

    setSubmitting(true);

    try {
      const res = await initiateTransfer({
        toAccountNumber: form.toAccountNumber.trim(),
        amount: Number(form.amount),
        receiverName: form.receiverName.trim() || null,
        description: form.description.trim() || null,
        transferType: 'SAME_BANK',
      });

      setReceipt(res.data?.data);
      setForm(initForm());
      setErrors({});
      setShowAddForm(false);

      await fetchBalance();
    } catch (err) {
      toast.error(
        err.response?.data?.message || 'Transfer failed. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectBeneficiary = (ben) => {
    if (isAdmin) return;

    setForm((prev) => ({
      ...prev,
      toAccountNumber: ben.beneficiaryAccountNumber ?? '',
      receiverName: ben.nickname || ben.beneficiaryName || '',
    }));

    setErrors({});
    setShowAddForm(false);
  };

  const handleDelete = async (id) => {
    if (isAdmin) return;

    setDeleting(id);

    try {
      await deleteBeneficiary(id);

      setBeneficiaries((prev) => prev.filter((b) => b.id !== id));

      toast.success('Beneficiary removed.');
    } catch (err) {
      toast.error(
        err.response?.data?.message || 'Could not remove beneficiary.'
      );
    } finally {
      setDeleting(null);
    }
  };

  const handleBenSaved = () => {
    if (isAdmin) return;

    setShowAddForm(false);
    fetchBeneficiaries();
  };

  return (
    <DashboardLayout>
      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />

      <div className="-m-8 min-h-screen bg-slate-950 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <nav className="flex items-center gap-2 text-sm text-slate-500">
            <Link
              to="/dashboard"
              className="transition-colors hover:text-blue-400"
            >
              Dashboard
            </Link>

            <span>/</span>

            <span className="font-semibold text-slate-300">
              Money Transfer
            </span>
          </nav>

          <div>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white">
              Money Transfer
            </h1>
          </div>

          {balance && (
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-blue-800/50 bg-gradient-to-r from-blue-900/50 to-indigo-900/50 px-5 py-4">
              <div>
                <p className="text-xs font-medium text-blue-300">
                  Available Balance
                </p>

                <p className="text-2xl font-extrabold text-white">
                  {formatCurrency(balance.availableBalance)}
                </p>
              </div>

              <div className="ml-auto text-right">
                <p className="text-xs text-slate-400">Account</p>

                <p className="font-mono text-sm font-bold text-slate-300">
                  {maskAccNum(balance.accountNumber)}
                </p>
              </div>
            </div>
          )}

          <div
            className={
              isAdmin
                ? 'grid gap-6'
                : 'grid gap-6 lg:grid-cols-[1.1fr_0.9fr]'
            }
          >
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-xl">
                  💸
                </div>

                <div>
                  <h2 className="text-lg font-bold text-white">
                    New Transfer
                  </h2>

                  <p className="text-xs text-slate-400">
                    Fill in the details below
                  </p>
                </div>
              </div>

     

              <form
                id="transfer-form"
                onSubmit={handleSubmit}
                noValidate
                className="space-y-4"
              >
                <div>
                  <label htmlFor="toAccountNumber" className="form-label">
                    Recipient Account Number{' '}
                    <span className="text-red-400">*</span>
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
                    <p className="mt-1 text-xs text-red-400">
                      {errors.toAccountNumber}
                    </p>
                  )}

                  {showSavePrompt && (
                    <button
                      id="btn-show-add-beneficiary"
                      type="button"
                      onClick={() => setShowAddForm(true)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600/20 px-3 py-1.5 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-600/30"
                    >
                      ⭐ Save to Beneficiaries
                    </button>
                  )}

                  {isAlreadySaved &&
                    form.toAccountNumber.trim().length >= 8 && (
                      <p className="mt-1.5 text-xs text-emerald-400">
                        ✓ This account is already in your beneficiaries
                      </p>
                    )}

                  {!isAdmin && showAddForm && (
                    <AddBeneficiaryForm
                      accountNumber={form.toAccountNumber.trim()}
                      onSaved={handleBenSaved}
                      onCancel={() => setShowAddForm(false)}
                      isFull={beneficiaries.length >= MAX}
                    />
                  )}
                </div>

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
                    <p className="mt-1 text-xs text-red-400">
                      {errors.amount}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="receiverName" className="form-label">
                    Receiver Name (optional)
                  </label>

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

                <div>
                  <label htmlFor="description" className="form-label">
                    Note / Description (optional)
                  </label>

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

                <button
                  id="btn-submit-transfer"
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
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

              <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-800/60 px-4 py-3" />
            </div>

            {!isAdmin && (
              <div className="flex flex-col rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600/20 text-xl">
                      ⭐
                    </div>

                    <div>
                      <h2 className="text-lg font-bold text-white">
                        Beneficiaries
                      </h2>

                      <p className="text-xs text-slate-400">
                        {beneficiaries.length}/{MAX} saved
                      </p>
                    </div>
                  </div>

                  <button
                    id="btn-refresh-beneficiaries"
                    type="button"
                    onClick={fetchBeneficiaries}
                    className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700"
                  >
                    🔄
                  </button>
                </div>

                <div className="mb-4">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Slots used
                    </span>

                    <span className="text-xs font-bold text-slate-400">
                      {beneficiaries.length} / {MAX}
                    </span>
                  </div>

                  <div className="h-1.5 w-full rounded-full bg-slate-700">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        beneficiaries.length >= MAX
                          ? 'bg-red-500'
                          : 'bg-blue-500'
                      }`}
                      style={{
                        width: `${(beneficiaries.length / MAX) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto">
                  {benLoading ? (
                    [...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="h-14 animate-pulse rounded-2xl bg-slate-800"
                      />
                    ))
                  ) : beneficiaries.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-10 text-center">
                      <span className="text-5xl">👥</span>

                      <p className="text-sm font-semibold text-slate-400">
                        No beneficiaries yet.
                      </p>
                    </div>
                  ) : (
                    beneficiaries.map((ben) => (
                      <BeneficiaryCard
                        key={ben.id}
                        ben={ben}
                        onSelect={handleSelectBeneficiary}
                        onDelete={handleDelete}
                        deleting={deleting}
                      />
                    ))
                  )}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-800/60 px-4 py-3" />
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TransferPage;
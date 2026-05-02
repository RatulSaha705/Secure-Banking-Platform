import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/layout/DashboardLayout';
import { initiateTransfer } from '../services/transferService';
import { getAccountBalance } from '../services/accountService';
import {
  getMyBeneficiaries,
  addBeneficiary,
  deleteBeneficiary,
} from '../services/beneficiaryService';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const formatCurrency = (v) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 2 }).format(v ?? 0);

const maskAccNum = (raw) => {
  if (!raw) return '—';
  const c = String(raw).replace(/\s/g, '');
  if (c.length <= 4) return raw;
  return (c.slice(0, -4).replace(/./g, '•') + c.slice(-4)).match(/.{1,4}/g)?.join(' ') ?? raw;
};

const normalise = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();

const MAX = 5;

/* ── Receipt Modal ───────────────────────────────────────────────────────── */
const ReceiptModal = ({ receipt, onClose }) => {
  if (!receipt) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 px-6 py-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-4xl">✅</div>
          <h2 className="mt-4 text-2xl font-extrabold text-white">Transfer Successful!</h2>
          <p className="mt-1 text-sm text-emerald-200">Your money is on its way.</p>
        </div>
        <div className="space-y-3 px-6 py-6">
          {[
            { label: 'Reference',   value: receipt.reference,                         mono: true },
            { label: 'Amount',      value: formatCurrency(receipt.amount)                        },
            { label: 'To Account',  value: maskAccNum(receipt.toAccount),             mono: true },
            { label: 'Receiver',    value: receipt.receiverName ?? '—'                           },
            { label: 'New Balance', value: formatCurrency(receipt.newBalance)                    },
            { label: 'Status',      value: <span className="text-emerald-400 font-semibold">Completed</span> },
          ].map(({ label, value, mono }) => (
            <div key={label} className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-2.5">
              <span className="text-xs font-medium text-slate-400">{label}</span>
              <span className={`text-sm font-bold text-slate-100 ${mono ? 'font-mono' : ''}`}>{value}</span>
            </div>
          ))}
        </div>
        <div className="px-6 pb-6">
          <button id="btn-close-receipt" type="button" onClick={onClose}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition hover:bg-blue-500 active:scale-95">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Beneficiary Card ────────────────────────────────────────────────────── */
const BeneficiaryCard = ({ ben, onSelect, onDelete, deleting }) => (
  <div className="flex items-center gap-3 rounded-2xl bg-slate-800/80 px-4 py-3 border border-slate-700/50 hover:border-blue-600/40 transition group">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600/20 text-base font-extrabold text-blue-300">
      {(ben.nickname || ben.beneficiaryName || 'B')[0].toUpperCase()}
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-bold text-slate-100">
        {ben.nickname ? `${ben.nickname}` : ben.beneficiaryName}
      </p>
      <p className="font-mono text-xs text-slate-400">{maskAccNum(ben.beneficiaryAccountNumber)}</p>
    </div>
    <div className="flex shrink-0 items-center gap-2 opacity-0 group-hover:opacity-100 transition">
      <button
        id={`btn-select-beneficiary-${ben.id}`}
        type="button"
        onClick={() => onSelect(ben)}
        className="rounded-lg bg-blue-600/20 px-2.5 py-1 text-xs font-bold text-blue-300 hover:bg-blue-600/40 transition"
      >
        Use
      </button>
      <button
        id={`btn-delete-beneficiary-${ben.id}`}
        type="button"
        disabled={deleting === ben.id}
        onClick={() => onDelete(ben.id)}
        className="rounded-lg bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-400 hover:bg-red-500/20 transition disabled:opacity-40"
      >
        {deleting === ben.id ? '…' : '✕'}
      </button>
    </div>
  </div>
);

/* ── Add Beneficiary Mini-form ───────────────────────────────────────────── */
const AddBeneficiaryForm = ({ accountNumber, onSaved, onCancel, isFull }) => {
  const [name,    setName]    = useState('');
  const [nick,    setNick]    = useState('');
  const [saving,  setSaving]  = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await addBeneficiary({
        beneficiaryName:          name.trim(),
        beneficiaryAccountNumber: accountNumber,
        nickname:                 nick.trim() || null,
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
      <div className="mt-3 rounded-xl bg-amber-900/30 border border-amber-700/40 px-4 py-3">
        <p className="text-xs font-semibold text-amber-400">
          ⚠️ Beneficiary list is full ({MAX}/{MAX}). Remove one to add this account.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl bg-slate-800 border border-blue-600/40 px-4 py-4 space-y-3">
      <p className="text-xs font-semibold text-blue-300">💾 Save as Beneficiary</p>
      <input
        type="text" placeholder="Name *" value={name}
        onChange={(e) => setName(e.target.value)}
        className="form-input text-sm"
        autoComplete="off"
      />
      <input
        type="text" placeholder="Nickname (optional, e.g. Mom)" value={nick}
        onChange={(e) => setNick(e.target.value)}
        className="form-input text-sm"
        autoComplete="off"
      />
      <div className="flex gap-2">
        <button type="button" disabled={saving} onClick={handleSave}
          className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white transition hover:bg-blue-500 disabled:opacity-60">
          {saving ? 'Saving…' : '✓ Save'}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-600 transition">
          Cancel
        </button>
      </div>
    </div>
  );
};

/* ── initForm ────────────────────────────────────────────────────────────── */
const initForm = () => ({ toAccountNumber: '', amount: '', receiverName: '', description: '' });

/* ═══════════════════════════════════════════════════════════════════════════ */
/* Main Page                                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */
const TransferPage = () => {
  const [balance,       setBalance]       = useState(null);
  const [form,          setForm]          = useState(initForm());
  const [errors,        setErrors]        = useState({});
  const [submitting,    setSubmitting]    = useState(false);
  const [receipt,       setReceipt]       = useState(null);

  // Beneficiaries
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [benLoading,    setBenLoading]    = useState(false);
  const [deleting,      setDeleting]      = useState(null);   // id being deleted
  const [showAddForm,   setShowAddForm]   = useState(false);  // "save account" prompt

  const amountRef = useRef(null);

  /* ── Check if the typed account is already saved ───────────────────────── */
  const isAlreadySaved = beneficiaries.some(
    (b) => normalise(b.beneficiaryAccountNumber) === normalise(form.toAccountNumber)
  );

  const showSavePrompt =
    form.toAccountNumber.trim().length >= 8 && !isAlreadySaved && !showAddForm;

  /* ── Fetch balance ─────────────────────────────────────────────────────── */
  const fetchBalance = useCallback(async () => {
    try {
      const res = await getAccountBalance();
      setBalance(res.data?.data ?? null);
    } catch { /* silent */ }
  }, []);

  /* ── Fetch beneficiaries ───────────────────────────────────────────────── */
  const fetchBeneficiaries = useCallback(async () => {
    setBenLoading(true);
    try {
      const res = await getMyBeneficiaries();
      setBeneficiaries(res.data?.data?.beneficiaries ?? []);
    } catch {
      toast.error('Failed to load beneficiaries.');
    } finally {
      setBenLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
    fetchBeneficiaries();
  }, [fetchBalance, fetchBeneficiaries]);

  /* ── Form handlers ─────────────────────────────────────────────────────── */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
    if (name === 'toAccountNumber') setShowAddForm(false);
  };

  const validate = () => {
    const errs = {};
    if (!form.toAccountNumber.trim()) errs.toAccountNumber = 'Recipient account number is required';
    const amt = Number(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) errs.amount = 'Enter a valid positive amount';
    if (amt > 1_000_000) errs.amount = 'Single transfer limit is BDT 10,00,000';
    if (balance && amt > balance.availableBalance)
      errs.amount = `Insufficient balance (available: ${formatCurrency(balance.availableBalance)})`;
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fieldErrs = validate();
    if (Object.keys(fieldErrs).length > 0) { setErrors(fieldErrs); return; }

    setSubmitting(true);
    try {
      const res = await initiateTransfer({
        toAccountNumber: form.toAccountNumber.trim(),
        amount:          Number(form.amount),
        receiverName:    form.receiverName.trim() || null,
        description:     form.description.trim()  || null,
        transferType:    'SAME_BANK',
      });
      setReceipt(res.data?.data);
      setForm(initForm());
      setErrors({});
      setShowAddForm(false);
      await fetchBalance();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Select beneficiary → pre-fill form ───────────────────────────────── */
  const handleSelectBeneficiary = (ben) => {
    setForm((prev) => ({
      ...prev,
      toAccountNumber: ben.beneficiaryAccountNumber ?? '',
      receiverName:    ben.nickname || ben.beneficiaryName || '',
    }));
    setErrors({});
    setShowAddForm(false);
  };

  /* ── Delete beneficiary ────────────────────────────────────────────────── */
  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await deleteBeneficiary(id);
      setBeneficiaries((prev) => prev.filter((b) => b.id !== id));
      toast.success('Beneficiary removed.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not remove beneficiary.');
    } finally {
      setDeleting(null);
    }
  };

  /* ── On beneficiary saved ──────────────────────────────────────────────── */
  const handleBenSaved = () => {
    setShowAddForm(false);
    fetchBeneficiaries();
  };

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <DashboardLayout>
      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />

      <div className="-m-8 min-h-screen bg-slate-950 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-slate-500">
            <Link to="/dashboard" className="hover:text-blue-400 transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="font-semibold text-slate-300">Money Transfer</span>
          </nav>

          {/* Header */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
              Features 10 &amp; 11 — Secure Banking
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white">
              Money Transfer
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Send money and manage saved beneficiaries. All data is encrypted at rest.
            </p>
          </div>

          {/* Balance strip */}
          {balance && (
            <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-r from-blue-900/50 to-indigo-900/50 border border-blue-800/50 px-5 py-4">
              <div>
                <p className="text-xs font-medium text-blue-300">Available Balance</p>
                <p className="text-2xl font-extrabold text-white">{formatCurrency(balance.availableBalance)}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-slate-400">Account</p>
                <p className="font-mono text-sm font-bold text-slate-300">{maskAccNum(balance.accountNumber)}</p>
              </div>
            </div>
          )}

          {/* Two-column layout */}
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">

            {/* ── LEFT: Transfer Form ─────────────────────────────────── */}
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-xl">💸</div>
                <div>
                  <h2 className="text-lg font-bold text-white">New Transfer</h2>
                  <p className="text-xs text-slate-400">Fill in the details below</p>
                </div>
              </div>

              <form id="transfer-form" onSubmit={handleSubmit} noValidate className="space-y-4">

                {/* Account number + save-as-beneficiary prompt */}
                <div>
                  <label htmlFor="toAccountNumber" className="form-label">
                    Recipient Account Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="toAccountNumber" name="toAccountNumber" type="text"
                    value={form.toAccountNumber} onChange={handleChange}
                    placeholder="e.g. 1234 5678 9012 3456"
                    className="form-input mt-1" autoComplete="off"
                  />
                  {errors.toAccountNumber && (
                    <p className="mt-1 text-xs text-red-400">{errors.toAccountNumber}</p>
                  )}

                  {/* "Save to beneficiaries" nudge */}
                  {showSavePrompt && (
                    <button
                      id="btn-show-add-beneficiary"
                      type="button"
                      onClick={() => setShowAddForm(true)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600/20 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/30 transition"
                    >
                      ⭐ Save to Beneficiaries
                    </button>
                  )}
                  {isAlreadySaved && form.toAccountNumber.trim().length >= 8 && (
                    <p className="mt-1.5 text-xs text-emerald-400">✓ This account is already in your beneficiaries</p>
                  )}

                  {/* Inline Add form */}
                  {showAddForm && (
                    <AddBeneficiaryForm
                      accountNumber={form.toAccountNumber.trim()}
                      onSaved={handleBenSaved}
                      onCancel={() => setShowAddForm(false)}
                      isFull={beneficiaries.length >= MAX}
                    />
                  )}
                </div>

                {/* Amount */}
                <div>
                  <label htmlFor="amount" className="form-label">
                    Amount (BDT) <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="amount" name="amount" type="number" min="1" step="0.01"
                    ref={amountRef} value={form.amount} onChange={handleChange}
                    placeholder="0.00" className="form-input mt-1"
                  />
                  {errors.amount && <p className="mt-1 text-xs text-red-400">{errors.amount}</p>}
                </div>

                {/* Receiver Name */}
                <div>
                  <label htmlFor="receiverName" className="form-label">Receiver Name (optional)</label>
                  <input
                    id="receiverName" name="receiverName" type="text"
                    value={form.receiverName} onChange={handleChange}
                    placeholder="e.g. Jane Doe" className="form-input mt-1" autoComplete="off"
                  />
                </div>

                {/* Note */}
                <div>
                  <label htmlFor="description" className="form-label">Note / Description (optional)</label>
                  <textarea
                    id="description" name="description" rows={2}
                    value={form.description} onChange={handleChange}
                    placeholder="e.g. Rent payment for May"
                    className="form-input mt-1 resize-none"
                  />
                </div>

                <button
                  id="btn-submit-transfer" type="submit" disabled={submitting}
                  className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Encrypting &amp; sending…
                    </span>
                  ) : '💸 Send Money'}
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

            {/* ── RIGHT: Beneficiary Management ──────────────────────── */}
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-xl flex flex-col">

              {/* Header */}
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600/20 text-xl">⭐</div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Beneficiaries</h2>
                    <p className="text-xs text-slate-400">
                      {beneficiaries.length}/{MAX} saved
                    </p>
                  </div>
                </div>
                <button
                  id="btn-refresh-beneficiaries" type="button"
                  onClick={fetchBeneficiaries}
                  className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700"
                >
                  🔄
                </button>
              </div>

              {/* Capacity bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">Slots used</span>
                  <span className="text-xs font-bold text-slate-400">{beneficiaries.length} / {MAX}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-700">
                  <div
                    className={`h-1.5 rounded-full transition-all ${beneficiaries.length >= MAX ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${(beneficiaries.length / MAX) * 100}%` }}
                  />
                </div>
              </div>

              {/* List */}
              <div className="flex-1 space-y-2 overflow-y-auto">
                {benLoading ? (
                  [...Array(3)].map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-800" />
                  ))
                ) : beneficiaries.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <span className="text-5xl">👥</span>
                    <p className="text-sm font-semibold text-slate-400">No beneficiaries yet.</p>
                    <p className="text-xs text-slate-500 leading-5">
                      Type an account number on the left<br />and tap <strong className="text-indigo-400">⭐ Save to Beneficiaries</strong>.
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

              {/* Info tip */}
              <div className="mt-5 rounded-2xl bg-slate-800/60 border border-slate-700 px-4 py-3">
                <p className="text-xs leading-5 text-slate-400">
                  🔐 Beneficiary account numbers are encrypted with
                  <strong className="text-slate-200"> RSA + ECC</strong> and
                  integrity-checked with <strong className="text-slate-200">HMAC-SHA256</strong>.
                  Click <strong className="text-blue-300">Use</strong> on any entry to pre-fill the transfer form.
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TransferPage;

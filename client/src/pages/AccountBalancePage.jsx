import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/layout/DashboardLayout';
import { getAccountBalance } from '../services/accountService';

/* ─────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-BD', {
    style:               'currency',
    currency:            'BDT',
    maximumFractionDigits: 2,
  }).format(amount ?? 0);

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-BD', {
      year: 'numeric', month: 'long', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return iso;
  }
};

/** Mask all but the last 4 characters of an account number. */
const maskAccountNumber = (raw) => {
  if (!raw) return '•••• •••• •••• ——';
  const cleaned = String(raw).replace(/\s/g, '');
  if (cleaned.length <= 4) return raw;
  const visible = cleaned.slice(-4);
  const masked  = cleaned.slice(0, -4).replace(/./g, '•');
  // Re-inject group spacing every 4 chars
  const full = masked + visible;
  return full.match(/.{1,4}/g)?.join(' ') ?? full;
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* Sub-components                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */

/** Animated number counter */
const AnimatedBalance = ({ value, prefix = '৳' }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    let start = 0;
    const end = value;
    const duration = 900;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setDisplay(end); clearInterval(timer); }
      else { setDisplay(Math.floor(start)); }
    }, 16);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <span>
      {prefix} {display.toLocaleString('en-BD')}
    </span>
  );
};

/** Status pill */
const StatusPill = ({ status }) => {
  const config = {
    active:  { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Active' },
    frozen:  { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'Frozen' },
    closed:  { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'Closed' },
  }[status?.toLowerCase()] ?? {
    bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400', label: status ?? 'Unknown',
  };

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${config.bg} ${config.text}`}>
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
};

/** Metric card used in the grid */
const MetricCard = ({ label, value, subtext, icon, colorFrom, colorTo }) => (
  <div
    className="relative overflow-hidden rounded-3xl p-6 shadow-lg"
    style={{ background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})` }}
  >
    {/* Background watermark icon */}
    <span className="pointer-events-none absolute -right-4 -top-4 text-[7rem] leading-none opacity-10 select-none">
      {icon}
    </span>

    <p className="text-sm font-medium text-white/80">{label}</p>
    <p className="mt-3 text-3xl font-extrabold tracking-tight text-white">{value}</p>
    {subtext && (
      <p className="mt-2 text-xs leading-5 text-white/70">{subtext}</p>
    )}
  </div>
);

/** Detail row in the account info card */
const DetailRow = ({ label, value, mono }) => (
  <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
    <span className="text-sm font-medium text-slate-500">{label}</span>
    <span className={`text-sm font-bold text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────── */
/* Skeleton                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

const Skeleton = () => (
  <DashboardLayout>
    <div className="-m-8 min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="h-16 w-64 animate-pulse rounded-2xl bg-slate-300" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-3xl bg-slate-300" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-3xl bg-slate-200" />
      </div>
    </div>
  </DashboardLayout>
);

/* ─────────────────────────────────────────────────────────────────────────── */
/* Main Page                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

const AccountBalancePage = () => {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [masked,  setMasked]  = useState(true);

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAccountBalance();
      setData(res.data?.data ?? null);
    } catch (err) {
      toast.error(
        err.response?.data?.message || 'Failed to load account balance. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  if (loading) return <Skeleton />;

  const total     = data?.totalBalance     ?? 0;
  const available = data?.availableBalance ?? 0;
  const pending   = data?.pendingAmount    ?? 0;

  const metricCards = [
    {
      label:     'Total Balance',
      value:     <AnimatedBalance value={total} />,
      subtext:   'All funds including holds',
      icon:      '💰',
      colorFrom: '#1d4ed8',
      colorTo:   '#1e3a8a',
    },
    {
      label:     'Available Balance',
      value:     <AnimatedBalance value={available} />,
      subtext:   'Ready to use immediately',
      icon:      '✅',
      colorFrom: '#059669',
      colorTo:   '#065f46',
    },
    {
      label:     'Pending Amount',
      value:     <AnimatedBalance value={pending} />,
      subtext:   'Transfers being processed',
      icon:      '⏳',
      colorFrom: '#d97706',
      colorTo:   '#92400e',
    },
  ];

  return (
    <DashboardLayout>
      <div className="-m-8 min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-8">

          {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
          <nav className="flex items-center gap-2 text-sm text-slate-500">
            <Link to="/dashboard" className="hover:text-blue-600 transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="font-semibold text-slate-800">Account Balance</span>
          </nav>

          {/* ── Page header ────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                Feature 8 — Secure Banking
              </p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
                Account Balance
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Your financial summary — all data is encrypted at rest and decrypted only for this
                authenticated session.
              </p>
            </div>

            <button
              id="btn-refresh-balance"
              type="button"
              onClick={fetchBalance}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-blue-800 active:scale-95"
            >
              🔄 Refresh
            </button>
          </div>

          {/* ── Balance metric cards ──────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-3">
            {metricCards.map((card) => (
              <MetricCard key={card.label} {...card} />
            ))}
          </div>

          {/* ── Account info card ─────────────────────────────────────────── */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">Account Information</p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900">Details</h2>
              </div>

              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-xl ring-1 ring-blue-100">
                🏦
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {/* Account number with toggle mask */}
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <span className="text-sm font-medium text-slate-500">Account Number</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-slate-900">
                    {masked ? maskAccountNumber(data?.accountNumber) : (data?.accountNumber ?? '—')}
                  </span>
                  <button
                    id="btn-toggle-account-mask"
                    type="button"
                    onClick={() => setMasked((v) => !v)}
                    className="text-xs font-semibold text-blue-600 transition hover:text-blue-800"
                  >
                    {masked ? '👁 Show' : '🙈 Hide'}
                  </button>
                </div>
              </div>

              <DetailRow label="Account Type"   value={data?.accountType   ?? '—'} />
              <DetailRow label="Account Status" value={<StatusPill status={data?.accountStatus} />} />
              <DetailRow label="Branch"         value={data?.branchName    ?? '—'} />
              {data?.routingNumber && (
                <DetailRow label="Routing Number" value={data.routingNumber} mono />
              )}
            </div>
          </div>

          {/* ── Security notice ───────────────────────────────────────────── */}
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-xl">
                🔐
              </div>
              <div>
                <h3 className="font-bold text-emerald-900">Security Notice</h3>
                <p className="mt-1 text-sm leading-6 text-emerald-800">
                  Your balance and account details are encrypted at rest using dual-asymmetric
                  encryption (RSA + ECC). Every field is protected with an HMAC-SHA256 integrity
                  tag. This data is only decrypted inside your current secure session — it is
                  never stored in plaintext.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                  {[
                    'AES-256-GCM ciphertext',
                    'HMAC-SHA256 integrity',
                    'RSA + ECC dual encryption',
                    'Bearer token access',
                  ].map((tag) => (
                    <span key={tag} className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 ring-1 ring-emerald-200">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Last updated ──────────────────────────────────────────────── */}
          {data?.asOf && (
            <p className="text-center text-xs text-slate-400">
              Balance as of {formatDate(data.asOf)}
            </p>
          )}

        </div>
      </div>
    </DashboardLayout>
  );
};

export default AccountBalancePage;

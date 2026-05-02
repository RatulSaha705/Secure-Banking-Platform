import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import {
  adminGetAllSupportTickets,
  adminManageSupportTicket,
} from '../services/supportTicketService';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'WAITING_USER', label: 'Waiting User' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const MANAGE_STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'WAITING_USER', label: 'Waiting User' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const MANAGE_PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const FORM_INITIAL = {
  status: 'OPEN',
  priority: 'MEDIUM',
  comment: '',
};

const selectStyle = {
  color: '#0f172a',
  backgroundColor: '#ffffff',
};

const optionStyle = {
  color: '#0f172a',
  backgroundColor: '#ffffff',
};

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

const statusLabel = (status) => {
  const clean = String(status || '').toUpperCase();

  if (clean === 'OPEN') return 'Open';
  if (clean === 'IN_PROGRESS') return 'In Progress';
  if (clean === 'WAITING_USER') return 'Waiting User';
  if (clean === 'RESOLVED') return 'Resolved';
  if (clean === 'CLOSED') return 'Closed';

  return clean || 'Unknown';
};

const statusClass = (status) => {
  const clean = String(status || '').toUpperCase();

  if (clean === 'OPEN') return 'bg-blue-100 text-blue-800 ring-blue-200';
  if (clean === 'IN_PROGRESS') return 'bg-amber-100 text-amber-800 ring-amber-200';
  if (clean === 'WAITING_USER') return 'bg-purple-100 text-purple-800 ring-purple-200';
  if (clean === 'RESOLVED') return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
  if (clean === 'CLOSED') return 'bg-slate-200 text-slate-800 ring-slate-300';

  return 'bg-slate-100 text-slate-800 ring-slate-200';
};

const priorityClass = (priority) => {
  const clean = String(priority || '').toUpperCase();

  if (clean === 'LOW') return 'bg-slate-100 text-slate-800 ring-slate-200';
  if (clean === 'MEDIUM') return 'bg-blue-100 text-blue-800 ring-blue-200';
  if (clean === 'HIGH') return 'bg-orange-100 text-orange-800 ring-orange-200';
  if (clean === 'URGENT') return 'bg-red-100 text-red-800 ring-red-200';

  return 'bg-slate-100 text-slate-800 ring-slate-200';
};

const shortId = (value) => {
  const text = String(value || '');

  if (!text) {
    return '—';
  }

  if (text.length <= 14) {
    return text;
  }

  return `${text.slice(0, 6)}...${text.slice(-4)}`;
};

const Badge = ({ children, className }) => {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold ring-1 ${className}`}>
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
            Only admins can review support tickets.
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

const TicketCard = ({ ticket, selected, onSelect }) => {
  return (
    <button
      type="button"
      onClick={() => onSelect(ticket)}
      className={`w-full rounded-2xl border p-4 text-left transition hover:border-blue-500 hover:bg-blue-50 ${
        selected ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'
      }`}
    >
      <h3 className="font-extrabold text-gray-950">
        {ticket.title || 'Untitled Ticket'}
      </h3>

      <p className="mt-1 text-sm font-medium text-gray-600">
        User ID: {shortId(ticket.userId)}
      </p>

      <p className="mt-2 line-clamp-2 text-sm text-gray-700">
        {ticket.message || ticket.description || 'No message'}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge className={statusClass(ticket.status)}>
          {statusLabel(ticket.status)}
        </Badge>

        <Badge className={priorityClass(ticket.priority)}>
          {ticket.priority || 'MEDIUM'}
        </Badge>
      </div>
    </button>
  );
};

const TicketComments = ({ comments }) => {
  const safeComments = Array.isArray(comments) ? comments : [];

  if (safeComments.length === 0) {
    return (
      <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
        No comments yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {safeComments.map((comment, index) => (
        <div
          key={`${comment.createdAt || 'comment'}-${index}`}
          className="rounded-xl bg-gray-50 p-4"
        >
          <p className="text-xs font-extrabold uppercase text-gray-500">
            {comment.authorRole || 'USER'} • {formatDate(comment.createdAt)}
          </p>

          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
            {comment.message}
          </p>
        </div>
      ))}
    </div>
  );
};

const AdminTicketDetails = ({
  ticket,
  form,
  setForm,
  saving,
  quickSaving,
  onSave,
  onQuickStatus,
}) => {
  if (!ticket) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow">
        <p className="text-lg font-semibold text-gray-600">
          Select a ticket to manage.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-wide text-blue-700">
            Admin Ticket Control
          </p>

          <h2 className="mt-1 text-2xl font-extrabold text-gray-950">
            {ticket.title}
          </h2>

          <p className="mt-2 text-sm font-medium text-gray-600">
            User ID: {ticket.userId}
          </p>

          <p className="mt-1 text-sm text-gray-500">
            Updated: {formatDate(ticket.updatedAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge className={statusClass(ticket.status)}>
            {statusLabel(ticket.status)}
          </Badge>

          <Badge className={priorityClass(ticket.priority)}>
            {ticket.priority}
          </Badge>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-gray-50 p-4">
        <p className="text-xs font-extrabold uppercase text-gray-500">
          User Message
        </p>

        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-gray-800">
          {ticket.message || ticket.description}
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <p className="mb-3 text-sm font-extrabold uppercase tracking-wide text-blue-800">
          Quick Marking
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={quickSaving || ticket.status === 'OPEN'}
            onClick={() => onQuickStatus('OPEN')}
            className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reopen
          </button>

          <button
            type="button"
            disabled={quickSaving || ticket.status === 'IN_PROGRESS'}
            onClick={() => onQuickStatus('IN_PROGRESS')}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mark In Progress
          </button>

          <button
            type="button"
            disabled={quickSaving || ticket.status === 'WAITING_USER'}
            onClick={() => onQuickStatus('WAITING_USER')}
            className="rounded-xl bg-purple-700 px-4 py-2 text-sm font-bold text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mark Waiting User
          </button>

          <button
            type="button"
            disabled={quickSaving || ticket.status === 'RESOLVED'}
            onClick={() => onQuickStatus('RESOLVED')}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mark Resolved
          </button>

          <button
            type="button"
            disabled={quickSaving || ticket.status === 'CLOSED'}
            onClick={() => onQuickStatus('CLOSED')}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Close Ticket
          </button>
        </div>
      </div>

      <form onSubmit={onSave} className="mt-6 space-y-4 rounded-2xl border border-gray-200 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-extrabold text-gray-800">
              Status
            </label>

            <select
              value={form.status}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  status: e.target.value,
                }))
              }
              style={selectStyle}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              {MANAGE_STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value} style={optionStyle}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-extrabold text-gray-800">
              Priority
            </label>

            <select
              value={form.priority}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  priority: e.target.value,
                }))
              }
              style={selectStyle}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              {MANAGE_PRIORITY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value} style={optionStyle}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-extrabold text-gray-800">
            Admin Comment Optional
          </label>

          <textarea
            value={form.comment}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                comment: e.target.value,
              }))
            }
            className="min-h-28 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            placeholder="Optional admin reply"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-blue-700 px-5 py-3 font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Manual Update'}
        </button>
      </form>

      <div className="mt-6">
        <h3 className="mb-3 text-lg font-extrabold text-gray-950">
          Comments
        </h3>

        <TicketComments comments={ticket.comments} />
      </div>
    </div>
  );
};

const AdminSupportTicketsPage = () => {
  const { currentUser } = useAuth();
  const isAdmin = normalizeRole(currentUser?.role) === 'admin';

  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [form, setForm] = useState(FORM_INITIAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);

  const filters = useMemo(() => {
    const next = {};

    if (statusFilter) {
      next.status = statusFilter;
    }

    if (priorityFilter) {
      next.priority = priorityFilter;
    }

    return next;
  }, [statusFilter, priorityFilter]);

  const selectTicket = useCallback((ticket) => {
    setSelectedTicket(ticket);

    setForm({
      status: ticket.status || 'OPEN',
      priority: ticket.priority || 'MEDIUM',
      comment: '',
    });
  }, []);

  const fetchTickets = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const res = await adminGetAllSupportTickets(filters);
      const list = res.data?.data?.tickets || [];

      setTickets(list);

      if (selectedTicket) {
        const refreshed = list.find((ticket) => ticket.id === selectedTicket.id);

        if (refreshed) {
          selectTicket(refreshed);
        } else {
          setSelectedTicket(null);
        }
      }
    } catch (err) {
      toast.error(getApiError(err, 'Failed to load support tickets.'));
    } finally {
      setLoading(false);
    }
  }, [filters, isAdmin, selectedTicket, selectTicket]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const updateTicketLocally = (updatedTicket) => {
    setSelectedTicket(updatedTicket);

    setForm({
      status: updatedTicket.status || 'OPEN',
      priority: updatedTicket.priority || 'MEDIUM',
      comment: '',
    });

    setTickets((prev) =>
      prev.map((ticket) => {
        if (ticket.id === updatedTicket.id) {
          return updatedTicket;
        }

        return ticket;
      })
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!selectedTicket) {
      return;
    }

    setSaving(true);

    try {
      const payload = {
        status: form.status,
        priority: form.priority,
      };

      if (form.comment.trim()) {
        payload.comment = form.comment.trim();
      }

      const res = await adminManageSupportTicket(selectedTicket.id, payload);
      const updatedTicket = res.data?.data;

      toast.success('Ticket updated. User will be notified if marking changed.');

      if (updatedTicket) {
        updateTicketLocally(updatedTicket);
      }

      await fetchTickets();
    } catch (err) {
      toast.error(getApiError(err, 'Failed to update ticket.'));
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatus = async (status) => {
    if (!selectedTicket) {
      return;
    }

    setQuickSaving(true);

    try {
      const res = await adminManageSupportTicket(selectedTicket.id, {
        status,
        priority: selectedTicket.priority || 'MEDIUM',
      });

      const updatedTicket = res.data?.data;

      toast.success(`Ticket marked as ${statusLabel(status)}. User notification created.`);

      if (updatedTicket) {
        updateTicketLocally(updatedTicket);
      }

      await fetchTickets();
    } catch (err) {
      toast.error(getApiError(err, 'Failed to mark ticket.'));
    } finally {
      setQuickSaving(false);
    }
  };

  if (!isAdmin) {
    return <AdminAccessDenied />;
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-wide text-blue-700">
              Admin Tickets
            </p>

            <h1 className="mt-1 text-3xl font-extrabold text-white">
              Manage Support Tickets
            </h1>

            <p className="mt-2 text-gray-400">
              Review tickets, mark progress, resolve issues, and notify users automatically.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/admin"
              className="rounded-xl bg-gray-800 px-4 py-2 font-bold text-white hover:bg-gray-900"
            >
              Admin Panel
            </Link>

            <button
              type="button"
              onClick={fetchTickets}
              className="rounded-xl bg-blue-700 px-4 py-2 font-bold text-white hover:bg-blue-800"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={selectStyle}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          >
            {STATUS_OPTIONS.map((item) => (
              <option key={item.label} value={item.value} style={optionStyle}>
                {item.label}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            style={selectStyle}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          >
            {PRIORITY_OPTIONS.map((item) => (
              <option key={item.label} value={item.value} style={optionStyle}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-6 xl:grid-cols-[440px_1fr]">
          <div className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-2xl font-extrabold text-gray-950">
              Tickets ({tickets.length})
            </h2>

            <div className="mt-5">
              {loading ? (
                <div className="h-40 animate-pulse rounded-2xl bg-gray-200" />
              ) : tickets.length === 0 ? (
                <p className="text-gray-500">No support tickets found.</p>
              ) : (
                <div className="space-y-3">
                  {tickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      selected={selectedTicket?.id === ticket.id}
                      onSelect={selectTicket}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <AdminTicketDetails
            ticket={selectedTicket}
            form={form}
            setForm={setForm}
            saving={saving}
            quickSaving={quickSaving}
            onSave={handleSave}
            onQuickStatus={handleQuickStatus}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminSupportTicketsPage;
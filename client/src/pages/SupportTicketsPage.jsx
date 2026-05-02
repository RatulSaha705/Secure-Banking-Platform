import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import {
  createSupportTicket,
  getMySupportTickets,
  updateMySupportTicket,
  addSupportTicketComment,
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

const CREATE_FORM_INITIAL = {
  title: '',
  message: '',
  priority: 'MEDIUM',
};

const EDIT_FORM_INITIAL = {
  title: '',
  message: '',
  priority: 'MEDIUM',
};

const getApiError = (err, fallback) =>
  err?.response?.data?.message || err?.message || fallback;

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const formatDate = (iso) => {
  if (!iso) return '—';

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

const statusClass = (status) => {
  const value = String(status || '').toUpperCase();

  if (value === 'OPEN') return 'bg-blue-100 text-blue-700';
  if (value === 'IN_PROGRESS') return 'bg-amber-100 text-amber-700';
  if (value === 'WAITING_USER') return 'bg-purple-100 text-purple-700';
  if (value === 'RESOLVED') return 'bg-emerald-100 text-emerald-700';
  if (value === 'CLOSED') return 'bg-slate-200 text-slate-700';

  return 'bg-slate-100 text-slate-700';
};

const priorityClass = (priority) => {
  const value = String(priority || '').toUpperCase();

  if (value === 'LOW') return 'bg-slate-100 text-slate-700';
  if (value === 'MEDIUM') return 'bg-blue-100 text-blue-700';
  if (value === 'HIGH') return 'bg-orange-100 text-orange-700';
  if (value === 'URGENT') return 'bg-red-100 text-red-700';

  return 'bg-slate-100 text-slate-700';
};

const TicketBadge = ({ children, className }) => (
  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${className}`}>
    {children}
  </span>
);

const EmptyState = ({ onCreateClick }) => (
  <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-3xl">
      🎧
    </div>
    <h3 className="mt-5 text-xl font-extrabold text-slate-900">No support tickets yet</h3>
    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
      Create a ticket for account, transfer, login, profile, or security-related problems.
      Ticket content is stored encrypted on the backend.
    </p>
    <button
      type="button"
      onClick={onCreateClick}
      className="mt-6 inline-flex items-center rounded-2xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-blue-800 active:scale-95"
    >
      Create First Ticket
    </button>
  </div>
);

const TicketCard = ({ ticket, selected, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(ticket)}
    className={`w-full rounded-3xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
      selected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'
    }`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="truncate text-base font-extrabold text-slate-900">
          {ticket.title || 'Untitled Ticket'}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">
          {ticket.message || ticket.description || 'No message'}
        </p>
      </div>
      <span className="shrink-0 text-xl">🎫</span>
    </div>

    <div className="mt-4 flex flex-wrap items-center gap-2">
      <TicketBadge className={statusClass(ticket.status)}>
        {ticket.status || 'UNKNOWN'}
      </TicketBadge>
      <TicketBadge className={priorityClass(ticket.priority)}>
        {ticket.priority || 'MEDIUM'}
      </TicketBadge>
    </div>

    <p className="mt-4 text-xs font-medium text-slate-400">
      Updated: {formatDate(ticket.updatedAt)}
    </p>
  </button>
);

const TicketComments = ({ comments }) => {
  const safeComments = Array.isArray(comments) ? comments : [];

  if (safeComments.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
        No comments yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {safeComments.map((comment, index) => {
        const role = String(comment.authorRole || 'USER').toUpperCase();
        const isAdmin = role === 'ADMIN';

        return (
          <div
            key={`${comment.createdAt || 'comment'}-${index}`}
            className={`rounded-2xl border px-4 py-3 ${
              isAdmin
                ? 'border-purple-100 bg-purple-50'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                {isAdmin ? 'Admin Reply' : 'User Comment'}
              </span>
              <span className="text-xs text-slate-400">
                {formatDate(comment.createdAt)}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {comment.message}
            </p>
          </div>
        );
      })}
    </div>
  );
};

const CreateTicketForm = ({ form, setForm, submitting, onSubmit }) => (
  <form onSubmit={onSubmit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          New Support Ticket
        </p>
        <h2 className="mt-1 text-xl font-extrabold text-slate-900">
          Create a problem request
        </h2>
      </div>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-xl">
        ✍️
      </div>
    </div>

    <div className="mt-6 space-y-4">
      <div>
        <label htmlFor="ticket-title" className="text-sm font-bold text-slate-700">
          Title
        </label>
        <input
          id="ticket-title"
          name="title"
          type="text"
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          placeholder="Example: Transfer receipt missing"
          maxLength="120"
          required
        />
      </div>

      <div>
        <label htmlFor="ticket-priority" className="text-sm font-bold text-slate-700">
          Priority
        </label>
        <select
          id="ticket-priority"
          name="priority"
          value={form.priority}
          onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        >
          {PRIORITY_OPTIONS.filter((item) => item.value).map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="ticket-message" className="text-sm font-bold text-slate-700">
          Message
        </label>
        <textarea
          id="ticket-message"
          name="message"
          value={form.message}
          onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
          className="mt-2 min-h-36 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          placeholder="Write the issue clearly. Do not include passwords or OTP codes."
          maxLength="3000"
          required
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-2xl bg-blue-700 px-5 py-3 text-sm font-extrabold text-white shadow transition hover:bg-blue-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Creating Ticket...' : 'Create Ticket'}
      </button>
    </div>
  </form>
);

const TicketDetails = ({
  ticket,
  editForm,
  setEditForm,
  comment,
  setComment,
  editing,
  setEditing,
  saving,
  commenting,
  onUpdate,
  onComment,
}) => {
  if (!ticket) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
          👈
        </div>
        <h2 className="mt-4 text-xl font-extrabold text-slate-900">Select a ticket</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Open a ticket from the left side to view, edit, or add comments.
        </p>
      </div>
    );
  }

  const isLocked = ['RESOLVED', 'CLOSED'].includes(String(ticket.status || '').toUpperCase());

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Ticket Details
          </p>
          <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
            {ticket.title}
          </h2>
          <p className="mt-2 text-xs font-medium text-slate-400">
            Created: {formatDate(ticket.createdAt)} • Updated: {formatDate(ticket.updatedAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <TicketBadge className={statusClass(ticket.status)}>
            {ticket.status}
          </TicketBadge>
          <TicketBadge className={priorityClass(ticket.priority)}>
            {ticket.priority}
          </TicketBadge>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Message</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">
          {ticket.message || ticket.description}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setEditing((prev) => !prev)}
          disabled={isLocked}
          className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {editing ? 'Cancel Edit' : 'Edit Ticket'}
        </button>
      </div>

      {isLocked && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          This ticket is resolved or closed, so user editing is disabled.
        </div>
      )}

      {editing && !isLocked && (
        <form onSubmit={onUpdate} className="mt-6 space-y-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
          <div>
            <label htmlFor="edit-ticket-title" className="text-sm font-bold text-slate-700">
              Title
            </label>
            <input
              id="edit-ticket-title"
              type="text"
              value={editForm.title}
              onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              required
              maxLength="120"
            />
          </div>

          <div>
            <label htmlFor="edit-ticket-priority" className="text-sm font-bold text-slate-700">
              Priority
            </label>
            <select
              id="edit-ticket-priority"
              value={editForm.priority}
              onChange={(e) => setEditForm((prev) => ({ ...prev, priority: e.target.value }))}
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              {PRIORITY_OPTIONS.filter((item) => item.value).map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="edit-ticket-message" className="text-sm font-bold text-slate-700">
              Message
            </label>
            <textarea
              id="edit-ticket-message"
              value={editForm.message}
              onChange={(e) => setEditForm((prev) => ({ ...prev, message: e.target.value }))}
              className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              required
              maxLength="3000"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      )}

      <div className="mt-8">
        <h3 className="text-lg font-extrabold text-slate-900">Comments</h3>
        <div className="mt-4">
          <TicketComments comments={ticket.comments} />
        </div>
      </div>

      <form onSubmit={onComment} className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <label htmlFor="ticket-comment" className="text-sm font-bold text-slate-700">
          Add Comment
        </label>
        <textarea
          id="ticket-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="mt-2 min-h-24 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          placeholder="Add more information for support."
          maxLength="2000"
          required
        />
        <button
          type="submit"
          disabled={commenting || String(ticket.status || '').toUpperCase() === 'CLOSED'}
          className="mt-3 rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {commenting ? 'Adding...' : 'Add Comment'}
        </button>
      </form>
    </div>
  );
};

const SupportTicketsPage = () => {
  const { currentUser } = useAuth();
  const isAdmin = normalizeRole(currentUser?.role) === 'admin';

  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [editing, setEditing] = useState(false);

  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [createForm, setCreateForm] = useState(CREATE_FORM_INITIAL);
  const [editForm, setEditForm] = useState(EDIT_FORM_INITIAL);
  const [comment, setComment] = useState('');

  const selectedTicketId = selectedTicket?.id;

  const filters = useMemo(() => {
    const next = {};

    if (statusFilter) next.status = statusFilter;
    if (priorityFilter) next.priority = priorityFilter;

    return next;
  }, [statusFilter, priorityFilter]);

  const selectTicket = useCallback((ticket) => {
    setSelectedTicket(ticket);
    setEditForm({
      title: ticket.title || '',
      message: ticket.message || ticket.description || '',
      priority: ticket.priority || 'MEDIUM',
    });
    setComment('');
    setEditing(false);
  }, []);

  const fetchTickets = useCallback(async () => {
    setLoading(true);

    try {
      const res = await getMySupportTickets(filters);
      const list = res.data?.data?.tickets || [];

      setTickets(list);

      if (selectedTicketId) {
        const refreshedSelected = list.find((ticket) => ticket.id === selectedTicketId);

        if (refreshedSelected) {
          selectTicket(refreshedSelected);
        } else {
          setSelectedTicket(null);
          setEditing(false);
        }
      }
    } catch (err) {
      toast.error(getApiError(err, 'Failed to load support tickets.'));
    } finally {
      setLoading(false);
    }
  }, [filters, selectedTicketId, selectTicket]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await createSupportTicket({
        title: createForm.title.trim(),
        message: createForm.message.trim(),
        priority: createForm.priority,
      });

      const created = res.data?.data;
      toast.success('Support ticket created successfully.');
      setCreateForm(CREATE_FORM_INITIAL);
      await fetchTickets();

      if (created) {
        selectTicket(created);
      }
    } catch (err) {
      toast.error(getApiError(err, 'Failed to create support ticket.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTicket = async (e) => {
    e.preventDefault();

    if (!selectedTicket) return;

    setSaving(true);

    try {
      const res = await updateMySupportTicket(selectedTicket.id, {
        title: editForm.title.trim(),
        message: editForm.message.trim(),
        priority: editForm.priority,
      });

      const updated = res.data?.data;
      toast.success('Support ticket updated.');

      if (updated) {
        selectTicket(updated);
        setTickets((prev) => prev.map((ticket) => (ticket.id === updated.id ? updated : ticket)));
      }

      setEditing(false);
    } catch (err) {
      toast.error(getApiError(err, 'Failed to update support ticket.'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();

    if (!selectedTicket) return;

    setCommenting(true);

    try {
      const res = await addSupportTicketComment(selectedTicket.id, {
        message: comment.trim(),
      });

      const updated = res.data?.data;
      toast.success('Comment added.');
      setComment('');

      if (updated) {
        selectTicket(updated);
        setTickets((prev) => prev.map((ticket) => (ticket.id === updated.id ? updated : ticket)));
      }
    } catch (err) {
      toast.error(getApiError(err, 'Failed to add comment.'));
    } finally {
      setCommenting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="-m-8 min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <nav className="flex items-center gap-2 text-sm text-slate-500">
            <Link to="/dashboard" className="hover:text-blue-600 transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <span className="font-semibold text-slate-800">Support Tickets</span>
          </nav>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                Feature 13 — Encrypted Post Equivalent
              </p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
                Support Ticket System
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Create, view, edit, and comment on support tickets. The backend stores ticket
                content through the encrypted storage layer using ECC and MAC integrity checks.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {isAdmin && (
                <Link
                  to="/admin/support-tickets"
                  className="inline-flex items-center rounded-2xl bg-purple-700 px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-purple-800 active:scale-95"
                >
                  Admin Review
                </Link>
              )}

              <button
                type="button"
                onClick={fetchTickets}
                className="inline-flex items-center rounded-2xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-blue-800 active:scale-95"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <div className="space-y-6">
              <CreateTicketForm
                form={createForm}
                setForm={setCreateForm}
                submitting={submitting}
                onSubmit={handleCreateTicket}
              />

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">My Tickets</h2>
                    <p className="mt-1 text-sm text-slate-500">{tickets.length} ticket(s)</p>
                  </div>
                  <span className="text-2xl">📬</span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    {STATUS_OPTIONS.map((item) => (
                      <option key={item.label} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    {PRIORITY_OPTIONS.map((item) => (
                      <option key={item.label} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, index) => (
                    <div key={index} className="h-36 animate-pulse rounded-3xl bg-slate-300" />
                  ))}
                </div>
              ) : tickets.length === 0 ? (
                <EmptyState onCreateClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
              ) : (
                <div className="space-y-4">
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

            <TicketDetails
              ticket={selectedTicket}
              editForm={editForm}
              setEditForm={setEditForm}
              comment={comment}
              setComment={setComment}
              editing={editing}
              setEditing={setEditing}
              saving={saving}
              commenting={commenting}
              onUpdate={handleUpdateTicket}
              onComment={handleAddComment}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SupportTicketsPage;
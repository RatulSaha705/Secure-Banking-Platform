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

const getApiError = (err, fallback) => {
  return err?.response?.data?.message || err?.message || fallback;
};

const normalizeRole = (role) => {
  return String(role || '').trim().toLowerCase();
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

const AdminSupportTicketsPage = () => {
  const { currentUser } = useAuth();

  const isAdmin = normalizeRole(currentUser?.role) === 'admin';

  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [manageForm, setManageForm] = useState({
    status: 'OPEN',
    priority: 'MEDIUM',
    comment: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const selectTicket = (ticket) => {
    setSelectedTicket(ticket);

    setManageForm({
      status: ticket.status || 'OPEN',
      priority: ticket.priority || 'MEDIUM',
      comment: '',
    });
  };

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
        const updatedSelected = list.find((ticket) => ticket.id === selectedTicket.id);

        if (updatedSelected) {
          setSelectedTicket(updatedSelected);
        } else {
          setSelectedTicket(null);
        }
      }
    } catch (err) {
      toast.error(getApiError(err, 'Failed to load support tickets.'));
    } finally {
      setLoading(false);
    }
  }, [filters, isAdmin, selectedTicket]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleManageSubmit = async (e) => {
    e.preventDefault();

    if (!selectedTicket) {
      return;
    }

    setSaving(true);

    try {
      const payload = {
        status: manageForm.status,
        priority: manageForm.priority,
      };

      if (manageForm.comment.trim()) {
        payload.comment = manageForm.comment.trim();
      }

      const res = await adminManageSupportTicket(selectedTicket.id, payload);
      const updatedTicket = res.data?.data;

      toast.success('Ticket updated successfully.');

      if (updatedTicket) {
        setSelectedTicket(updatedTicket);

        setTickets((prev) =>
          prev.map((ticket) => {
            if (ticket.id === updatedTicket.id) {
              return updatedTicket;
            }

            return ticket;
          })
        );

        setManageForm({
          status: updatedTicket.status || 'OPEN',
          priority: updatedTicket.priority || 'MEDIUM',
          comment: '',
        });
      }
    } catch (err) {
      toast.error(getApiError(err, 'Failed to update ticket.'));
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="rounded-2xl bg-white p-6 shadow">
            <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
            <p className="mt-2 text-gray-600">
              Only admins can view this page.
            </p>

            <Link
              to="/support-tickets"
              className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-2 text-white"
            >
              Go to My Tickets
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Admin Support Tickets
            </h1>
            <p className="mt-1 text-gray-600">
              Review and manage user support tickets.
            </p>
          </div>

          <Link
            to="/support-tickets"
            className="rounded-xl bg-gray-800 px-4 py-2 text-white"
          >
            My Tickets
          </Link>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-gray-300 px-4 py-3"
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
            className="rounded-xl border border-gray-300 px-4 py-3"
          >
            {PRIORITY_OPTIONS.map((item) => (
              <option key={item.label} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 shadow">
            <h2 className="mb-4 text-xl font-bold">
              Tickets ({tickets.length})
            </h2>

            {loading ? (
              <p>Loading tickets...</p>
            ) : tickets.length === 0 ? (
              <p className="text-gray-500">No tickets found.</p>
            ) : (
              <div className="space-y-3">
                {tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => selectTicket(ticket)}
                    className={`w-full rounded-xl border p-4 text-left ${
                      selectedTicket?.id === ticket.id
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <h3 className="font-bold text-gray-900">
                      {ticket.title}
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      User ID: {ticket.userId}
                    </p>

                    <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                      {ticket.message || ticket.description}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">
                        {ticket.status}
                      </span>

                      <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-700">
                        {ticket.priority}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white p-5 shadow">
            {!selectedTicket ? (
              <p className="text-gray-500">Select a ticket to manage.</p>
            ) : (
              <>
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedTicket.title}
                </h2>

                <p className="mt-2 text-sm text-gray-500">
                  Created: {formatDate(selectedTicket.createdAt)}
                </p>

                <div className="mt-4 rounded-xl bg-gray-50 p-4">
                  <p className="whitespace-pre-wrap text-gray-700">
                    {selectedTicket.message || selectedTicket.description}
                  </p>
                </div>

                <form onSubmit={handleManageSubmit} className="mt-5 space-y-4">
                  <div>
                    <label className="mb-2 block font-semibold">
                      Status
                    </label>

                    <select
                      value={manageForm.status}
                      onChange={(e) =>
                        setManageForm((prev) => ({
                          ...prev,
                          status: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    >
                      {MANAGE_STATUS_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block font-semibold">
                      Priority
                    </label>

                    <select
                      value={manageForm.priority}
                      onChange={(e) =>
                        setManageForm((prev) => ({
                          ...prev,
                          priority: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    >
                      {MANAGE_PRIORITY_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block font-semibold">
                      Admin Comment
                    </label>

                    <textarea
                      value={manageForm.comment}
                      onChange={(e) =>
                        setManageForm((prev) => ({
                          ...prev,
                          comment: e.target.value,
                        }))
                      }
                      className="min-h-28 w-full rounded-xl border border-gray-300 px-4 py-3"
                      placeholder="Optional admin reply"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : 'Save Update'}
                  </button>
                </form>

                <div className="mt-6">
                  <h3 className="mb-3 font-bold">Comments</h3>

                  {Array.isArray(selectedTicket.comments) &&
                  selectedTicket.comments.length > 0 ? (
                    <div className="space-y-3">
                      {selectedTicket.comments.map((comment, index) => (
                        <div
                          key={`${comment.createdAt || 'comment'}-${index}`}
                          className="rounded-xl bg-gray-50 p-3"
                        >
                          <p className="text-xs font-bold text-gray-500">
                            {comment.authorRole || 'USER'} • {formatDate(comment.createdAt)}
                          </p>

                          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                            {comment.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No comments yet.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminSupportTicketsPage;
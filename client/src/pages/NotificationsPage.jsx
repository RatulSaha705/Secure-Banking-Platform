import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import {
  getMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  adminSendAccountNumberNotification,
} from '../services/notificationService';

const READ_OPTIONS = [
  { value: '', label: 'All Notifications' },
  { value: 'false', label: 'Unread Only' },
  { value: 'true', label: 'Read Only' },
];

const ADMIN_FORM_INITIAL = {
  accountNumber: '',
  title: '',
  message: '',
  body: '',
};

const deepSelectStyle = {
  color: '#0f172a',
  backgroundColor: '#ffffff',
  fontWeight: '700',
};

const deepOptionStyle = {
  color: '#0f172a',
  backgroundColor: '#ffffff',
  fontWeight: '700',
};

const inputClassName =
  'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-slate-950 placeholder:text-slate-400 placeholder:font-medium outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100';

const textAreaClassName =
  'min-h-24 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-slate-950 placeholder:text-slate-400 placeholder:font-medium outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100';

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

const getTypeBadgeClass = (type) => {
  const cleanType = String(type || '').toUpperCase();

  if (cleanType === 'LOGIN_ALERT') {
    return 'bg-blue-100 text-blue-700';
  }

  if (cleanType === 'TRANSACTION_ALERT') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (cleanType === 'SUPPORT_TICKET_CREATED') {
    return 'bg-purple-100 text-purple-700';
  }

  if (cleanType === 'SUPPORT_TICKET_RESOLVED') {
    return 'bg-green-100 text-green-700';
  }

  return 'bg-slate-100 text-slate-700';
};

const getTypeIcon = (type) => {
  const cleanType = String(type || '').toUpperCase();

  if (cleanType === 'LOGIN_ALERT') {
    return '🔐';
  }

  if (cleanType === 'TRANSACTION_ALERT') {
    return '💸';
  }

  if (cleanType === 'SUPPORT_TICKET_CREATED') {
    return '🎫';
  }

  if (cleanType === 'SUPPORT_TICKET_RESOLVED') {
    return '✅';
  }

  return '🔔';
};

const formatTypeLabel = (type) => {
  const cleanType = String(type || 'GENERAL_ALERT').trim();

  return cleanType
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const NotificationCard = ({ notification, onMarkRead }) => {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        notification.isRead
          ? 'border-gray-200 bg-white'
          : 'border-blue-200 bg-blue-50'
      }`}
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">
            {getTypeIcon(notification.type)}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-gray-900">
                {notification.title}
              </h3>

              {!notification.isRead && (
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                  New
                </span>
              )}
            </div>

            <p className="mt-1 text-sm font-medium text-gray-700">
              {notification.message}
            </p>

            {notification.body && (
              <p className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-3 text-sm font-medium text-gray-800">
                {notification.body}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${getTypeBadgeClass(
                  notification.type
                )}`}
              >
                {formatTypeLabel(notification.type)}
              </span>

              <span className="text-xs font-medium text-gray-400">
                {formatDate(notification.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {!notification.isRead && (
          <button
            type="button"
            onClick={() => onMarkRead(notification.id)}
            className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800"
          >
            Mark Read
          </button>
        )}
      </div>
    </div>
  );
};

const AdminSendNotificationForm = ({
  form,
  setForm,
  sending,
  onSubmit,
}) => {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-purple-100 bg-white p-5 shadow"
    >
      <div className="mb-5">
        <p className="text-sm font-bold uppercase tracking-wide text-purple-700">
          Admin Tool
        </p>

        <h2 className="text-xl font-bold text-gray-900">
          Send Notification to the User
        </h2>

       
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-bold text-gray-800">
            Target Account Number
          </label>

          <input
            type="text"
            value={form.accountNumber}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                accountNumber: e.target.value,
              }))
            }
            className={inputClassName}
            placeholder="Example: 1212 6125 1602 8111"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-gray-800">
            Title
          </label>

          <input
            type="text"
            value={form.title}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                title: e.target.value,
              }))
            }
            className={inputClassName}
            placeholder="Example: Account alert"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-gray-800">
            Message
          </label>

          <input
            type="text"
            value={form.message}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                message: e.target.value,
              }))
            }
            className={inputClassName}
            placeholder="Short notification message"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-gray-800">
            Body Optional
          </label>

          <textarea
            value={form.body}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                body: e.target.value,
              }))
            }
            className={textAreaClassName}
            placeholder="Detailed notification body"
          />
        </div>

        <button
          type="submit"
          disabled={sending}
          className="w-full rounded-xl bg-purple-700 px-5 py-3 font-bold text-white hover:bg-purple-800 disabled:opacity-60"
        >
          {sending ? 'Sending...' : 'Send Notification'}
        </button>
      </div>
    </form>
  );
};

const NotificationsPage = () => {
  const { currentUser } = useAuth();

  const isAdmin = normalizeRole(currentUser?.role) === 'admin';

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [readFilter, setReadFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [sending, setSending] = useState(false);
  const [adminForm, setAdminForm] = useState(ADMIN_FORM_INITIAL);

  const filters = useMemo(() => {
    const next = {};

    if (readFilter) {
      next.isRead = readFilter;
    }

    return next;
  }, [readFilter]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);

    try {
      const res = await getMyNotifications(filters);
      const data = res.data?.data || {};

      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      toast.error(getApiError(err, 'Failed to load notifications.'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (id) => {
    try {
      await markNotificationAsRead(id);
      toast.success('Notification marked as read.');
      await fetchNotifications();
    } catch (err) {
      toast.error(getApiError(err, 'Failed to mark notification as read.'));
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);

    try {
      await markAllNotificationsAsRead();
      toast.success('All notifications marked as read.');
      await fetchNotifications();
    } catch (err) {
      toast.error(getApiError(err, 'Failed to mark all notifications as read.'));
    } finally {
      setMarkingAll(false);
    }
  };

  const handleAdminSend = async (e) => {
    e.preventDefault();
    setSending(true);

    try {
      await adminSendAccountNumberNotification({
        accountNumber: adminForm.accountNumber.trim(),
        type: 'GENERAL_ALERT',
        title: adminForm.title.trim(),
        message: adminForm.message.trim(),
        body: adminForm.body.trim(),
      });

      toast.success('Notification sent successfully to the target user only.');

      setAdminForm(ADMIN_FORM_INITIAL);

      /*
       * Do not call fetchNotifications() here.
       * Reason:
       * - Admin is sending the notification to a target account number.
       * - Admin should not receive or display a copy.
       * - The target user will see it from their own Notifications page.
       */
    } catch (err) {
      toast.error(getApiError(err, 'Failed to send notification.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Notifications & Alerts
            </h1>

            

            <p className="mt-2 text-sm font-bold text-blue-700">
              Unread: {unreadCount}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/dashboard"
              className="rounded-xl bg-gray-800 px-4 py-2 text-white"
            >
              Dashboard
            </Link>

            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingAll || unreadCount === 0}
              className="rounded-xl bg-blue-700 px-4 py-2 font-bold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {markingAll ? 'Updating...' : 'Mark All Read'}
            </button>
          </div>
        </div>

        <div className="mb-6 max-w-md">
          <select
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value)}
            style={deepSelectStyle}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          >
            {READ_OPTIONS.map((item) => (
              <option key={item.label} value={item.value} style={deepOptionStyle}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className={isAdmin ? 'grid gap-6 lg:grid-cols-[1fr_380px]' : ''}>
          <div className="space-y-4">
            {loading ? (
              <>
                <div className="h-32 animate-pulse rounded-2xl bg-gray-200" />
                <div className="h-32 animate-pulse rounded-2xl bg-gray-200" />
                <div className="h-32 animate-pulse rounded-2xl bg-gray-200" />
              </>
            ) : notifications.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center shadow">
                <div className="text-4xl">🔕</div>

                <h2 className="mt-4 text-xl font-bold text-gray-900">
                  No notifications found
                </h2>

                <p className="mt-2 text-gray-500">
                  Login, transaction, support ticket, and admin alerts will appear here.
                </p>
              </div>
            ) : (
              notifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onMarkRead={handleMarkRead}
                />
              ))
            )}
          </div>

          {isAdmin && (
            <AdminSendNotificationForm
              form={adminForm}
              setForm={setAdminForm}
              sending={sending}
              onSubmit={handleAdminSend}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default NotificationsPage;
import api from './api';

/**
 * client/src/services/notificationService.js
 *
 * Feature 14 — Notifications and Alerts.
 */

export const getMyNotifications = (filters = {}) => {
  return api.get('/notifications', { params: filters });
};

export const getUnreadNotificationCount = () => {
  return api.get('/notifications/unread-count');
};

export const markNotificationAsRead = (id) => {
  return api.patch(`/notifications/${id}/read`);
};

export const markAllNotificationsAsRead = () => {
  return api.patch('/notifications/read-all');
};

export const adminSendUserNotification = (userId, payload) => {
  return api.post(`/notifications/admin/user/${userId}`, payload);
};
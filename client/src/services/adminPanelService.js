import api from './api';

/**
 * client/src/services/adminPanelService.js
 *
 * Feature 15 — Admin Panel client service.
 */

export const getAdminOverview = () => {
  return api.get('/admin/overview');
};

export const getAdminUsers = (filters = {}) => {
  return api.get('/admin/users', { params: filters });
};

export const getAdminUserById = (userId) => {
  return api.get(`/admin/users/${userId}`);
};

export const updateAdminUserStatus = (userId, payload) => {
  return api.patch(`/admin/users/${userId}/status`, payload);
};

export const banAdminUser = (userId, payload = {}) => {
  return api.patch(`/admin/users/${userId}/ban`, payload);
};

export const unbanAdminUser = (userId, payload = {}) => {
  return api.patch(`/admin/users/${userId}/unban`, payload);
};

export const updateAdminUserRole = (userId, payload) => {
  return api.patch(`/admin/users/${userId}/role`, payload);
};

export const getAdminTransactions = (filters = {}) => {
  return api.get('/admin/transactions', { params: filters });
};

export const getAdminTransactionById = (transactionId) => {
  return api.get(`/admin/transactions/${transactionId}`);
};

export const getAdminSupportTickets = (filters = {}) => {
  return api.get('/admin/support-tickets', { params: filters });
};

export const getAdminSupportTicketById = (ticketId) => {
  return api.get(`/admin/support-tickets/${ticketId}`);
};

export const manageAdminSupportTicket = (ticketId, payload) => {
  return api.patch(`/admin/support-tickets/${ticketId}`, payload);
};
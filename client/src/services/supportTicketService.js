import api from './api';

/**
 * client/src/services/supportTicketService.js
 *
 * Feature 13 — Support Ticket System.
 *
 * User endpoints:
 *   POST   /api/support-tickets
 *   GET    /api/support-tickets
 *   GET    /api/support-tickets/:id
 *   PATCH  /api/support-tickets/:id
 *   POST   /api/support-tickets/:id/comments
 *
 * Admin endpoints:
 *   GET    /api/support-tickets/admin/all
 *   GET    /api/support-tickets/admin/:id
 *   PATCH  /api/support-tickets/admin/:id
 */

export const createSupportTicket = (payload) =>
  api.post('/support-tickets', payload);

export const getMySupportTickets = (filters = {}) =>
  api.get('/support-tickets', { params: filters });

export const getMySupportTicketById = (id) =>
  api.get(`/support-tickets/${id}`);

export const updateMySupportTicket = (id, payload) =>
  api.patch(`/support-tickets/${id}`, payload);

export const addSupportTicketComment = (id, payload) =>
  api.post(`/support-tickets/${id}/comments`, payload);

export const adminGetAllSupportTickets = (filters = {}) =>
  api.get('/support-tickets/admin/all', { params: filters });

export const adminGetSupportTicketById = (id) =>
  api.get(`/support-tickets/admin/${id}`);

export const adminManageSupportTicket = (id, payload) =>
  api.patch(`/support-tickets/admin/${id}`, payload);
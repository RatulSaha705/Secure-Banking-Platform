import api from './api';

/**
 * client/src/services/dashboardService.js
 *
 * Thin wrappers around the Dashboard API endpoints.
 *
 *   GET /api/dashboard/summary        → getUserDashboard()
 *   GET /api/dashboard/admin/summary  → getAdminDashboard()
 */

export const getUserDashboard  = () => api.get('/dashboard/summary');
export const getAdminDashboard = () => api.get('/dashboard/admin/summary');

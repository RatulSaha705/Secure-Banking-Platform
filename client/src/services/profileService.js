import api from './api';

/**
 * client/src/services/profileService.js
 *
 * Thin wrappers around the Profile Management API endpoints.
 *
 *   GET  /api/profile/me            → getMyProfile()
 *   PUT  /api/profile/me            → updateMyProfile(data)
 *   GET  /api/profile/admin/:userId → adminGetProfile(userId)
 */

export const getMyProfile = () => api.get('/profile/me');

export const updateMyProfile = (data) => api.put('/profile/me', data);

export const adminGetProfile = (userId) =>
  api.get(`/profile/admin/${userId}`);

import api from './api';

export const registerUser = (data) => api.post('/auth/register', data);

export const verifyRegistrationOtp = (data) =>
  api.post('/auth/register/verify', data);

export const loginUser = (data) => api.post('/auth/login', data);

export const verifyLoginOtp = (data) =>
  api.post('/auth/login/verify', data);

export const refreshSession = () => api.post('/auth/refresh');

export const recordSessionActivity = () => api.post('/auth/activity');

export const logoutUser = () => api.post('/auth/logout');

export const getCurrentUser = () => api.get('/auth/me');
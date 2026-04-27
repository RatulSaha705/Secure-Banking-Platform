import api from './api';

export const registerUser = (data) => api.post('/auth/register', data);

export const verifyRegistrationOtp = (data) =>
  api.post('/auth/register/verify', data);

export const loginUser = (data) => api.post('/auth/login', data);

export const verifyLoginOtp = (data) =>
  api.post('/auth/login/verify', data);
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

let accessToken = null;
let refreshPromise = null;

export const setAccessTokenForApi = (token) => {
  accessToken = token || null;
};

export const clearAccessTokenForApi = () => {
  accessToken = null;
};

export const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh', null, { skipAuthRefresh: true })
      .then((res) => {
        const token = res.data?.accessToken;

        if (!token) {
          throw new Error('Refresh response did not include an access token');
        }

        setAccessTokenForApi(token);
        return res.data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const url = originalRequest?.url || '';

    const isAuthEndpoint = url.startsWith('/auth/');
    const shouldTryRefresh =
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.skipAuthRefresh &&
      !isAuthEndpoint;

    if (!shouldTryRefresh) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const refreshed = await refreshAccessToken();
      originalRequest.headers.Authorization = `Bearer ${refreshed.accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      clearAccessTokenForApi();
      return Promise.reject(refreshError);
    }
  }
);

export default api;
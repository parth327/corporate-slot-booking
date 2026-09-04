/**
 * The HTTP layer.
 *
 * Every method resolves to the response payload directly, and every failure
 * rejects with a normalised { message, code, status, details } so callers never
 * have to dig through axios' error shape.
 */
import axios from 'axios';

export const AUTH_STORAGE_KEY = 'gatepass.auth';

const api = axios.create({ baseURL: '/api', timeout: 20000 });

// --- token storage --------------------------------------------------------------

let memoryToken = null;

export function getStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredAuth(value) {
  try {
    if (value) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* private mode — the in-memory token still carries the session */
  }
  memoryToken = value?.token ?? null;
}

export function clearStoredAuth() {
  setStoredAuth(null);
}

export function setAuthToken(token) {
  memoryToken = token || null;
}

function currentToken() {
  return memoryToken ?? getStoredAuth()?.token ?? null;
}

// --- interceptors ----------------------------------------------------------------

api.interceptors.request.use((config) => {
  const token = currentToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
    config.__authed = true;
  }
  return config;
});

const STATUS_FALLBACK = {
  400: 'That request was not valid.',
  401: 'Please sign in to continue.',
  403: 'You do not have access to that.',
  404: 'We could not find what you were looking for.',
  409: 'That conflicts with something already in the system.',
  429: 'Too many requests — please slow down.',
  500: 'Something went wrong on our side.',
};

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error.response?.status ?? 0;
    const data = error.response?.data;

    // A 401 on an authenticated call means the session is gone. Never redirect
    // for the login request itself — the form shows the error inline.
    const isLogin = String(error.config?.url || '').includes('/auth/login');
    if (status === 401 && error.config?.__authed && !isLogin) {
      clearStoredAuth();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }

    return Promise.reject({
      message:
        data?.error ||
        (status === 0
          ? 'Network error — check your connection and try again.'
          : STATUS_FALLBACK[status] || 'Something went wrong.'),
      code: data?.code || (status === 0 ? 'NETWORK' : 'UNKNOWN'),
      status,
      details: data?.details || null,
    });
  }
);

// --- API groups ---------------------------------------------------------------------

export const authApi = {
  login: (body) => api.post('/auth/login', body),
  me: () => api.get('/auth/me'),
  changePassword: (body) => api.post('/auth/change-password', body),
};

export const publicApi = {
  authorities: () => api.get('/public/authorities'),
  rooms: () => api.get('/public/rooms'),
  submitRequest: (body) => api.post('/gatepasses/request', body),
  getReschedule: (token) => api.get(`/public/reschedule/${encodeURIComponent(token)}`),
  submitReschedule: (token, body) => api.post(`/public/reschedule/${encodeURIComponent(token)}`, body),
  health: () => api.get('/health'),
};

export const gatepassApi = {
  list: (params) => api.get('/gatepasses', { params }),
  get: (id) => api.get(`/gatepasses/${id}`),
  stats: () => api.get('/gatepasses/stats/summary'),
  approve: (id, body) => api.post(`/gatepasses/${id}/approve`, body),
  reject: (id, body) => api.post(`/gatepasses/${id}/reject`, body),
  reschedule: (id, body) => api.post(`/gatepasses/${id}/reschedule`, body),
  comment: (id, body) => api.post(`/gatepasses/${id}/comment`, body),
  switchRoom: (id, body) => api.post(`/gatepasses/${id}/switch-room`, body),
  closeEarly: (id) => api.post(`/gatepasses/${id}/close-early`),
  resendEmail: (id) => api.post(`/gatepasses/${id}/resend-email`),
};

export const roomApi = {
  list: (params) => api.get('/rooms', { params }),
  availability: (params) => api.get('/rooms/availability', { params }),
  schedule: (id, params) => api.get(`/rooms/${id}/schedule`, { params }),
  scheduleAll: (params) => api.get('/rooms/schedule', { params }),
  create: (body) => api.post('/rooms', body),
  update: (id, body) => api.put(`/rooms/${id}`, body),
  remove: (id) => api.delete(`/rooms/${id}`),
};

export const securityApi = {
  verify: (body) => api.post('/security/verify', body),
  search: (q) => api.get('/security/search', { params: { q } }),
  today: () => api.get('/security/today'),
  history: (params) => api.get('/security/history', { params }),
  get: (id) => api.get(`/security/gatepass/${id}`),
  checkIn: (id) => api.post(`/security/gatepass/${id}/check-in`),
  checkOut: (id) => api.post(`/security/gatepass/${id}/check-out`),
};

export const adminApi = {
  users: (params) => api.get('/admin/users', { params }),
  createUser: (body) => api.post('/admin/users', body),
  updateUser: (id, body) => api.put(`/admin/users/${id}`, body),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  overview: () => api.get('/admin/overview'),
  gatepasses: (params) => api.get('/admin/gatepasses', { params }),
  meetingLogs: (params) => api.get('/admin/meeting-logs', { params }),
  activity: (params) => api.get('/admin/activity', { params }),
};

export default api;

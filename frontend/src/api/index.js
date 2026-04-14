import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

/* ── AMR ── */
export const amrAPI = {
  getAll: () => api.get('/amrs'),
  getById: (id) => api.get(`/amrs/${id}`),
  create: (data) => api.post('/amrs', data),
  update: (id, data) => api.put(`/amrs/${id}`, data),
  delete: (id) => api.delete(`/amrs/${id}`),
  monitorStatus: () => api.get('/amrs/monitor/status'),
  reconnect: (amr_name) => api.post('/amrs/monitor/reconnect', { amr_name }),
  navigate: (id, dest_station) => api.post(`/amrs/${id}/navigate`, { dest_station }),
  getArmState: (id) => api.get(`/amrs/${id}/arm-state`),
};

/* ── Task ── */
export const taskAPI = {
  getAll: () => api.get('/tasks'),
  getById: (id) => api.get(`/tasks/${id}`),
  create: (data) => api.post('/tasks', data),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  delete: (id) => api.delete(`/tasks/${id}`),
};

/* ── Move Command (MES → ACS) ── */
export const moveCommandAPI = {
  send: (data) => api.post('/move_command', data),
};

/* ── Arm Command (MES → ACS) ── */
export const armCommandAPI = {
  send: (data) => api.post('/arm_command', data),
};

/* ── Arm Task State Init (MES → ACS) ── */
export const armErrorClearAPI = {
  send: (data) => api.post('/arm/task_init', data)
}

/* ── Map ── */
export const mapAPI = {
  getAll: () => api.get('/maps'),
  getById: (id) => api.get(`/maps/${id}`),
  getCurrent: () => api.get('/maps/current'),
  setCurrent: (id) => api.put(`/maps/${id}/set-current`),
  create: (data) => api.post('/maps', data),
  upload: (file) => {
    const formData = new FormData();
    formData.append('mapFile', file);
    return api.post('/maps/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  delete: (id) => api.delete(`/maps/${id}`),
  getAmrMaps: (ip) => api.get('/maps/amr-maps', { params: { ip } }),
  downloadAmrMap: (ip, map_name) => api.post('/maps/amr-download', { ip, map_name }),
};

/* ── Setting ── */
export const settingAPI = {
  getAll: () => api.get('/settings'),
  getByKey: (key) => api.get(`/settings/${key}`),
  upsert: (key, value, description) =>
    api.put(`/settings/${key}`, { value, description }),
  delete: (key) => api.delete(`/settings/${key}`),
};

/* ── User ── */
export const userAPI = {
  login: (username, password) =>
    api.post('/users/login', { username, password }),
  getAll: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

/* ── Log ── */
export const logAPI = {
  query: (params) => api.get('/logs', { params }),
};

/* ── SimAmr ── */
export const simAmrAPI = {
  getAll: () => api.get('/sim-amrs'),
  getById: (id) => api.get(`/sim-amrs/${id}`),
  create: (data) => api.post('/sim-amrs', data),
  update: (id, data) => api.put(`/sim-amrs/${id}`, data),
  delete: (id) => api.delete(`/sim-amrs/${id}`),
};

export default api;

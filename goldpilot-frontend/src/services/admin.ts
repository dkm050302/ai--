import { api } from './api';

export const adminApi = {
  getTesters: () => api.get('/api/admin/testers'),
  getTesterActions: (accountId: string, params?: { category?: string; limit?: number; offset?: number }) =>
    api.get(`/api/admin/testers/${accountId}/actions`, { params }),
  getTesterSimAccount: (accountId: string) =>
    api.get(`/api/admin/testers/${accountId}/sim-account`),
  getStats: () => api.get('/api/admin/stats'),
};

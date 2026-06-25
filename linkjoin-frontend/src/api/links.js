import { apiGet, apiPost, apiPut, apiPatch, apiDelete, apiFetch } from './client.js'

export const linksApi = {
  getAll: () => apiGet('/links'),
  create: (data) => apiPost('/links', data),
  update: (id, data) => apiPut(`/links/${id}`, data),
  delete: (id, permanent = false, type = 'link') =>
    apiFetch(`/links/${id}?permanent=${permanent}&type=${type}`, { method: 'DELETE' }),
  restore: (id, type = 'link') => apiPost(`/links/${id}/restore?type=${type}`),
  toggle: (id, active) => apiPatch(`/links/${id}/toggle`, { id, active }),
  share: (link, emails, type = 'link') => apiPost('/links/share', { link, emails, type }),
  accept: (link, accept, type = 'link') => apiPost('/links/accept', { link, accept, type }),
  addLink: (shareId) => apiGet(`/links/addlink?id=${shareId}`),
  dismissModifications: () => apiPost('/links/dismiss-modifications'),
  trackOpen: () => apiPost('/analytics', { field: 'links_opened' }),
}

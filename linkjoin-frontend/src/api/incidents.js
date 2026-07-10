import { apiGet, apiPost, apiPatch } from './client.js'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const incidentsApi = {
  getActive: () => fetch(`${BASE_URL}/incidents/active`).then(r => r.json()),
  list: (page = 1) => apiGet(`/incidents?page=${page}&limit=50`),
  create: (data) => apiPost('/incidents', data),
  update: (id, data) => apiPatch(`/incidents/${id}`, data),
  resolve: (id) => apiPost(`/incidents/${id}/resolve`, {}),
}

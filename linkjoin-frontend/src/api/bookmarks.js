import { apiGet, apiPost, apiPut } from './client.js'

export const bookmarksApi = {
  getAll: () => apiGet('/bookmarks'),
  create: (data) => apiPost('/bookmarks', data),
  update: (id, data) => apiPut(`/bookmarks/${id}`, data),
}

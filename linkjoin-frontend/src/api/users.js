import { apiGet, apiPost, apiPatch, apiFetch } from './client.js'

export const usersApi = {
  me: () => apiGet('/users/me'),
  updateTimezone: (timezone, offset) => apiPatch('/users/timezone', { timezone, offset }),
  setOffset: (offset) => apiPatch('/users/offset', { offset }),
  daylightSavings: (shift) => apiPatch('/users/daylight-savings', { shift }),
  addNumber: (number, countrycode) => apiPatch('/users/number', { number, countrycode }),
  setSort: (sort) => apiPatch('/users/sort', { sort }),
  setOpenEarly: (open) => apiPatch('/users/open-early', { open }),
  setAutoDelete: (enabled) => apiPatch('/users/auto-delete', { enabled }),
  setVacationMode: (enabled) => apiPatch('/users/vacation-mode', { enabled }),
  setShowCalendar: (enabled) => apiPatch('/users/show-calendar', { enabled }),
  setPopupCheckDone: () => apiPatch('/users/popup-check', {}),
  setTutorial: (step) => apiPatch('/users/tutorial', { step }),
  setTutorialWidget: (finished) => apiPatch('/users/tutorial-widget', { finished }),
  getNotes: () => apiGet('/users/notes'),
  saveNote: (note) => apiPost('/users/notes', note),
  markdownToHtml: (markdown) => apiPost('/users/markdown', { markdown }),
  markWhatsNewSeen: () => apiPatch('/users/whats-new-seen', {}),
  deleteAccount: () => apiFetch('/users/me', { method: 'DELETE' }),
}

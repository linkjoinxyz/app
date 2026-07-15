import { apiPost } from './client.js'

export const billingApi = {
  checkout: () => apiPost('/billing/checkout', {}),
  portal: () => apiPost('/billing/portal', {}),
}

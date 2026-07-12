import { apiPost, apiFetch } from './client.js'

export const authApi = {
  register: (data) => apiPost('/auth/register', data),
  login: (data) => apiPost('/auth/login', data),
  googleLogin: (jwt, keep) => apiPost('/auth/login', { jwt, keep }),
  googleTokenLogin: (access_token) => apiPost('/auth/google-token', { access_token }),
  googleRegister: (data) => apiPost('/auth/register', data),
  forgotPassword: (email) => apiPost('/auth/forgot-password', { email }),
  resetPassword: (token, password) => apiFetch(`/auth/reset-password/${token}`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  }),
  confirmEmail: (token) => apiFetch(`/auth/confirm?token=${token}`),
  resendConfirmation: () => apiPost('/auth/resend-confirmation', {}),
  me: () => apiFetch('/users/me'),
  verifyMfa: (mfa_session, code) => apiPost('/auth/mfa/verify', { mfa_session, code }),
  resendMfa: (mfa_session) => apiPost('/auth/mfa/resend', { mfa_session }),
}

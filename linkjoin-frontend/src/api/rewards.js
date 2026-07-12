import { apiGet } from './client.js'

export function getMyRewards() {
  return apiGet('/attendance/me/rewards')
}

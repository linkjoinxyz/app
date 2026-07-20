import { apiPost } from './client.js'

export const attendanceApi = {
  override: (classId, date, presentEmails) =>
    apiPost(`/attendance/class/${classId}/override`, {
      date,
      present_emails: presentEmails,
    }),
}

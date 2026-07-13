import { apiPost } from './client.js'

export const attendanceApi = {
  log: (linkId, classId, className, minutesLate) =>
    apiPost('/attendance', {
      link_id: linkId,
      class_id: classId,
      class_name: className || '',
      minutes_late: minutesLate,
    }),
  override: (classId, date, presentEmails) =>
    apiPost(`/attendance/class/${classId}/override`, {
      date,
      present_emails: presentEmails,
    }),
}

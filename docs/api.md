# LinkJoin API Reference

**Base URL:** `https://linkjoin.xyz`  
**Version:** v1 (unversioned path prefix)  
**Format:** JSON request/response bodies, UTF-8  
**Interactive docs:** [linkjoin.xyz/docs](https://linkjoin.xyz/docs) (Swagger) · [linkjoin.xyz/redoc](https://linkjoin.xyz/redoc)

---

## Authentication

All protected endpoints require a JWT bearer token.

### Get a token

```http
POST /auth/login
Content-Type: application/json

{
  "username": "teacher@school.edu",
  "password": "yourpassword"
}
```

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5...",
  "token_type": "bearer"
}
```

Tokens expire after **7 days**.

### Use the token

Include it in the `Authorization` header on every request:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5...
```

### Other auth endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create a new account |
| POST | `/auth/forgot-password` | Send a password reset email |
| POST | `/auth/reset-password/{token}` | Set a new password |
| GET  | `/auth/confirm` | Confirm email via `?token=` query param |
| POST | `/auth/logout` | Invalidate the current session |

---

## Versioning & Stability

All current endpoints are **v1**. There is no `/v1/` path prefix today — the unversioned endpoints are considered v1.

- **Non-breaking changes** (new optional fields, new endpoints) may be made at any time without a version bump.
- **Breaking changes** will be introduced under a `/v2/` prefix with a minimum **6-month deprecation window** and advance email notice to registered API users.
- Clients should ignore unknown JSON fields.

To register for deprecation notices: [api@linkjoin.xyz](mailto:api@linkjoin.xyz)

---

## Errors

All errors return a JSON body with a `detail` field.

```json
// 401 Unauthorized
{ "detail": "Not authenticated" }

// 403 Forbidden
{ "detail": "Access denied" }

// 404 Not Found
{ "detail": "Class not found" }

// 422 Unprocessable Entity
{
  "detail": [
    { "loc": ["body", "username"], "msg": "field required", "type": "value_error.missing" }
  ]
}
```

---

## Meeting Links

Create and manage scheduled meeting links.

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/links` | List all links for the authenticated user |
| POST   | `/links` | Create a meeting link |
| PUT    | `/links/{link_id}` | Update a meeting link |
| DELETE | `/links/{link_id}` | Delete a meeting link |
| POST   | `/links/{link_id}/open` | Record a manual open event |
| PATCH  | `/links/{link_id}/toggle` | Enable or disable |
| GET    | `/links/history` | Retrieve open history |

**Create a link:**

```json
POST /links

{
  "name": "Algebra I",
  "url": "https://zoom.us/j/123456789",
  "time": "09:00",
  "days": ["Mon", "Wed", "Fri"],
  "active": "true"
}
```

---

## Classes

Classes group students under a teacher and link to a meeting for attendance tracking.

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/classes` | List classes for the authenticated teacher |
| POST   | `/classes` | Create a class |
| GET    | `/classes/{class_id}` | Get class details and student roster |
| PUT    | `/classes/{class_id}` | Update class settings |
| DELETE | `/classes/{class_id}` | Delete a class |
| POST   | `/classes/{class_id}/students` | Add a student by email |
| DELETE | `/classes/{class_id}/students/{user_id}` | Remove a student |

---

## Attendance

Attendance records are created when a student opens their link through the LinkJoin browser extension.

| Method | Path | Description |
|--------|------|-------------|
| POST  | `/attendance` | Record an attendance event (called by the extension) |
| GET   | `/attendance/class/{class_id}` | List all records for a class |
| GET   | `/attendance/class/{class_id}/patterns` | Aggregated patterns per student |
| GET   | `/attendance/class/{class_id}/export` | Download as CSV |
| PATCH | `/attendance/{record_id}` | Correct a record (teacher/admin only) |

**Response shape:**

```json
{
  "records": [
    {
      "record_id": "abc123",
      "student_email": "student@school.edu",
      "opened_at": "2026-07-11T09:02:14Z",
      "minutes_late": 2,
      "class_id": "xyz"
    }
  ]
}
```

---

## Parent Portal

Parent accounts (`role: "parent"`) are linked to one or more student accounts.

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/parent/children` | List linked children |
| GET  | `/parent/children/{student_id}/classes` | Child's class schedule with attendance rates |
| GET  | `/parent/children/{student_id}/attendance` | Unified attendance event log (28 days) |
| POST | `/parent/notes` | Submit or update a note/excuse for an absence |
| GET  | `/parent/children/{student_id}/notes` | List all notes (parent or school staff) |

---

## Integrations

Org-level integrations require `role: "school_admin"` or `role: "district_admin"`.

### Google Classroom *(teacher-level)*

| Method | Path |
|--------|------|
| GET    | `/integrations/google/authorize-url` |
| POST   | `/integrations/google/connect` |
| POST   | `/integrations/google/sync/{class_id}` |
| DELETE | `/integrations/google/disconnect/{class_id}` |

### Canvas *(teacher-level, admin configures org credentials)*

| Method | Path |
|--------|------|
| POST   | `/integrations/canvas/org-config` |
| GET    | `/integrations/canvas/authorize-url` |
| POST   | `/integrations/canvas/connect` |
| POST   | `/integrations/canvas/sync/{class_id}` |
| DELETE | `/integrations/canvas/disconnect/{class_id}` |

### Clever *(org-level)*

| Method | Path |
|--------|------|
| GET    | `/integrations/clever/authorize-url` |
| GET    | `/integrations/clever/status?org_id=` |
| POST   | `/integrations/clever/sync/{org_id}` |
| DELETE | `/integrations/clever/disconnect/{org_id}` |

### OneRoster *(org-level — PowerSchool, Infinite Campus, Skyward)*

| Method | Path |
|--------|------|
| POST   | `/integrations/oneroster/connect` |
| GET    | `/integrations/oneroster/status?org_id=` |
| POST   | `/integrations/oneroster/sync/{org_id}` |
| DELETE | `/integrations/oneroster/disconnect/{org_id}` |

### Schoology *(org-level)*

| Method | Path |
|--------|------|
| POST   | `/integrations/schoology/connect` |
| GET    | `/integrations/schoology/status?org_id=` |
| POST   | `/integrations/schoology/sync/{org_id}` |
| DELETE | `/integrations/schoology/disconnect/{org_id}` |

---

## Support

- API questions: [api@linkjoin.xyz](mailto:api@linkjoin.xyz)
- Issues: [linkjoin.xyz/contact](https://linkjoin.xyz/contact)
- Status page: [linkjoin.xyz/status](https://linkjoin.xyz/status)

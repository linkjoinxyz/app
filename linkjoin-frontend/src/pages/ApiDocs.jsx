import NhNav from '../components/NhNav.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import '../styles/new-homepage.css'
import '../styles/privacy.css'

function Method({ m }) {
  return <span className={`pp-method pp-method--${m.toLowerCase()}`}>{m}</span>
}

function Endpoint({ method, path, desc }) {
  return (
    <div className="pp-endpoint">
      <Method m={method} />
      <span className="pp-endpoint-path">{path}</span>
      {desc && <span className="pp-endpoint-desc">{desc}</span>}
    </div>
  )
}

function Code({ children }) {
  return <pre className="pp-code">{children}</pre>
}

function IC({ children }) {
  return <code className="pp-inline-code">{children}</code>
}

export default function ApiDocs() {
  return (
    <div className="pp-page">
      <NhNav />
      <main className="pp-main">
        <div className="pp-body pp-body--wide">
          <p className="pp-eyebrow">Developers</p>
          <h1 className="pp-title">API Reference</h1>
          <p className="pp-date">LinkJoin API v1 — Base URL: <IC>https://linkjoin.xyz</IC></p>

          <div className="pp-toc">
            <div className="pp-toc-title">Contents</div>
            <ol>
              <li><a href="#authentication" className="pp-link">Authentication</a></li>
              <li><a href="#versioning" className="pp-link">Versioning &amp; stability</a></li>
              <li><a href="#errors" className="pp-link">Errors</a></li>
              <li><a href="#meetings" className="pp-link">Meeting links</a></li>
              <li><a href="#classes" className="pp-link">Classes</a></li>
              <li><a href="#attendance" className="pp-link">Attendance</a></li>
              <li><a href="#parent" className="pp-link">Parent portal</a></li>
              <li><a href="#integrations" className="pp-link">Integrations</a></li>
              <li><a href="#interactive" className="pp-link">Interactive docs</a></li>
            </ol>
          </div>

          <section className="pp-section" id="authentication">
            <h2>Authentication</h2>
            <p>
              All protected endpoints require a JWT bearer token. Obtain one by posting
              credentials to <IC>/auth/login</IC>. Tokens expire after 7 days.
            </p>
            <Code>{`POST /auth/login
Content-Type: application/json

{
  "username": "teacher@school.edu",
  "password": "yourpassword"
}

// Response
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5...",
  "token_type": "bearer"
}`}</Code>
            <p style={{ marginTop: 16 }}>
              Include the token in the <IC>Authorization</IC> header on every subsequent request:
            </p>
            <Code>{`Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5...`}</Code>
            <p style={{ marginTop: 16 }}>Other auth endpoints:</p>
            <Endpoint method="POST" path="/auth/register" desc="Create a new account" />
            <Endpoint method="POST" path="/auth/forgot-password" desc="Send a password reset email" />
            <Endpoint method="POST" path="/auth/reset-password/{token}" desc="Set a new password" />
            <Endpoint method="GET"  path="/auth/confirm" desc="Confirm email address via token query param" />
            <Endpoint method="POST" path="/auth/logout" desc="Invalidate the current session" />
          </section>

          <section className="pp-section" id="versioning">
            <h2>Versioning &amp; stability</h2>
            <p>
              All current endpoints are considered <strong>v1</strong>. The API is unversioned
              at the path level — there is no <IC>/v1/</IC> prefix today. Future breaking
              changes will be introduced under a <IC>/v2/</IC> prefix with a minimum
              6-month deprecation window and advance email notice to registered API users.
            </p>
            <p>
              Non-breaking additions (new optional fields, new endpoints) may be made at any
              time without a version bump. Clients should ignore unknown JSON fields.
            </p>
            <p>
              To register as an API user and receive deprecation notices, email{' '}
              <a href="mailto:api@linkjoin.xyz" className="pp-link">api@linkjoin.xyz</a>.
            </p>
          </section>

          <section className="pp-section" id="errors">
            <h2>Errors</h2>
            <p>
              All errors return a JSON body with a <IC>detail</IC> field describing the problem.
              HTTP status codes follow standard semantics.
            </p>
            <Code>{`// 401 Unauthorized
{ "detail": "Not authenticated" }

// 403 Forbidden
{ "detail": "Access denied" }

// 404 Not Found
{ "detail": "Class not found" }

// 422 Unprocessable Entity (validation)
{
  "detail": [
    { "loc": ["body", "username"], "msg": "field required", "type": "value_error.missing" }
  ]
}`}</Code>
          </section>

          <section className="pp-section" id="meetings">
            <h2>Meeting links</h2>
            <p>
              Create and manage the scheduled meeting links that LinkJoin opens automatically
              for students.
            </p>
            <Endpoint method="GET"    path="/links" desc="List all links for the authenticated user" />
            <Endpoint method="POST"   path="/links" desc="Create a meeting link" />
            <Endpoint method="PUT"    path="/links/{link_id}" desc="Update a meeting link" />
            <Endpoint method="DELETE" path="/links/{link_id}" desc="Delete a meeting link" />
            <Endpoint method="POST"   path="/links/{link_id}/open" desc="Record a manual open event" />
            <Endpoint method="PATCH"  path="/links/{link_id}/toggle" desc="Enable or disable a link" />
            <Endpoint method="GET"    path="/links/history" desc="Retrieve open history" />
            <Code>{`// POST /links — example body
{
  "name": "Algebra I",
  "url": "https://zoom.us/j/123456789",
  "time": "09:00",
  "days": ["Mon", "Wed", "Fri"],
  "active": "true"
}`}</Code>
          </section>

          <section className="pp-section" id="classes">
            <h2>Classes</h2>
            <p>
              Classes group students under a teacher and link to a meeting link for
              attendance tracking.
            </p>
            <Endpoint method="GET"    path="/classes" desc="List classes for the authenticated teacher" />
            <Endpoint method="POST"   path="/classes" desc="Create a class" />
            <Endpoint method="GET"    path="/classes/{class_id}" desc="Get class details including student roster" />
            <Endpoint method="PUT"    path="/classes/{class_id}" desc="Update class settings" />
            <Endpoint method="DELETE" path="/classes/{class_id}" desc="Delete a class" />
            <Endpoint method="POST"   path="/classes/{class_id}/students" desc="Add a student by email" />
            <Endpoint method="DELETE" path="/classes/{class_id}/students/{user_id}" desc="Remove a student" />
          </section>

          <section className="pp-section" id="attendance">
            <h2>Attendance</h2>
            <p>
              Attendance records are created when a student opens their meeting link through
              LinkJoin. Teachers and admins can query and export these records.
            </p>
            <Endpoint method="POST" path="/attendance" desc="Record an attendance event (called by the extension)" />
            <Endpoint method="GET"  path="/attendance/class/{class_id}" desc="List all attendance records for a class" />
            <Endpoint method="GET"  path="/attendance/class/{class_id}/patterns" desc="Aggregated attendance patterns per student" />
            <Endpoint method="GET"  path="/attendance/class/{class_id}/export" desc="Download attendance as CSV" />
            <Endpoint method="PATCH" path="/attendance/{record_id}" desc="Correct a record (admin/teacher only)" />
            <Code>{`// GET /attendance/class/{class_id} — response shape
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
}`}</Code>
          </section>

          <section className="pp-section" id="parent">
            <h2>Parent portal</h2>
            <p>
              Parent accounts are linked to one or more student accounts. All parent
              endpoints require <IC>role: "parent"</IC>.
            </p>
            <Endpoint method="GET"  path="/parent/children" desc="List linked children" />
            <Endpoint method="GET"  path="/parent/children/{student_id}/classes" desc="Child's class schedule with attendance rates" />
            <Endpoint method="GET"  path="/parent/children/{student_id}/attendance" desc="Unified attendance event log (28 days)" />
            <Endpoint method="POST" path="/parent/notes" desc="Submit or update a note/excuse for an absence" />
            <Endpoint method="GET"  path="/parent/children/{student_id}/notes" desc="List all notes for a student (parent or school staff)" />
          </section>

          <section className="pp-section" id="integrations">
            <h2>Integrations</h2>
            <p>
              LinkJoin integrates with major LMS and SIS platforms. Org-level integrations
              require <IC>role: "school_admin"</IC> or <IC>role: "district_admin"</IC>.
            </p>
            <p><strong>Google Classroom</strong> <span className="pp-badge">Teacher</span></p>
            <Endpoint method="GET"    path="/integrations/google/authorize-url" desc="Start OAuth flow" />
            <Endpoint method="POST"   path="/integrations/google/connect" desc="Link a course to a class" />
            <Endpoint method="POST"   path="/integrations/google/sync/{class_id}" desc="Push attendance grades" />
            <Endpoint method="DELETE" path="/integrations/google/disconnect/{class_id}" />

            <p style={{ marginTop: 20 }}><strong>Canvas</strong> <span className="pp-badge">Teacher</span></p>
            <Endpoint method="POST"   path="/integrations/canvas/org-config" desc="Admin: configure Canvas credentials" />
            <Endpoint method="GET"    path="/integrations/canvas/authorize-url" />
            <Endpoint method="POST"   path="/integrations/canvas/connect" />
            <Endpoint method="POST"   path="/integrations/canvas/sync/{class_id}" />
            <Endpoint method="DELETE" path="/integrations/canvas/disconnect/{class_id}" />

            <p style={{ marginTop: 20 }}><strong>Clever</strong> <span className="pp-badge">Org</span></p>
            <Endpoint method="GET"    path="/integrations/clever/authorize-url" />
            <Endpoint method="GET"    path="/integrations/clever/status" />
            <Endpoint method="POST"   path="/integrations/clever/sync/{org_id}" />
            <Endpoint method="DELETE" path="/integrations/clever/disconnect/{org_id}" />

            <p style={{ marginTop: 20 }}><strong>OneRoster</strong> <span className="pp-badge">Org</span></p>
            <Endpoint method="POST"   path="/integrations/oneroster/connect" desc="Submit credentials (PowerSchool, Infinite Campus, Skyward)" />
            <Endpoint method="GET"    path="/integrations/oneroster/status" />
            <Endpoint method="POST"   path="/integrations/oneroster/sync/{org_id}" />
            <Endpoint method="DELETE" path="/integrations/oneroster/disconnect/{org_id}" />

            <p style={{ marginTop: 20 }}><strong>Schoology</strong> <span className="pp-badge">Org</span></p>
            <Endpoint method="POST"   path="/integrations/schoology/connect" desc="Submit consumer key and secret" />
            <Endpoint method="GET"    path="/integrations/schoology/status" />
            <Endpoint method="POST"   path="/integrations/schoology/sync/{org_id}" />
            <Endpoint method="DELETE" path="/integrations/schoology/disconnect/{org_id}" />
          </section>

          <section className="pp-section" id="interactive">
            <h2>Interactive docs</h2>
            <p>
              The full interactive API reference — including request schemas, response models,
              and a built-in test console — is available at:
            </p>
            <ul>
              <li>
                <strong>Swagger UI:</strong>{' '}
                <a href="https://linkjoin.xyz/docs" className="pp-link" target="_blank" rel="noopener noreferrer">
                  linkjoin.xyz/docs
                </a>
              </li>
              <li>
                <strong>ReDoc:</strong>{' '}
                <a href="https://linkjoin.xyz/redoc" className="pp-link" target="_blank" rel="noopener noreferrer">
                  linkjoin.xyz/redoc
                </a>
              </li>
              <li>
                <strong>OpenAPI schema (JSON):</strong>{' '}
                <a href="https://linkjoin.xyz/openapi.json" className="pp-link" target="_blank" rel="noopener noreferrer">
                  linkjoin.xyz/openapi.json
                </a>
              </li>
            </ul>
            <p>
              Questions or access requests:{' '}
              <a href="mailto:api@linkjoin.xyz" className="pp-link">api@linkjoin.xyz</a>
            </p>
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}

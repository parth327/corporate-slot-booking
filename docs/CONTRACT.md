# GatePass — Build Contract (SINGLE SOURCE OF TRUTH)

Every agent MUST conform to this file exactly. Do not invent alternate paths, field
names, or response shapes. If something is missing, follow the closest documented
pattern rather than inventing a new one.

Product: **GatePass** — Visitor Management & Meeting Room Booking.

## 0. Repo layout

```
slot-booking/
  server/           Node + Express + pg (ESM, "type":"module")
  client/           React 18 + Vite + Tailwind 3 + Framer Motion + lucide-react
  docs/CONTRACT.md  this file
```

Backend runs on `PORT` (default 4000). Frontend dev server 5173 and proxies
`/api` -> `http://localhost:4000`. All backend imports use **ESM** with explicit
`.js` extensions (`import x from './utils/qr.js'`).

## 1. Environment variables (server/.env)

| var | required | notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon Postgres conn string. SSL required. |
| `JWT_SECRET` | yes | HS256 signing key for session tokens |
| `QR_SECRET` | no | falls back to `JWT_SECRET` |
| `BREVO_API_KEY` | no | if absent, mailer logs to console instead of sending (never throws) |
| `BREVO_SENDER_EMAIL` | no | default `no-reply@gatepass.local` |
| `BREVO_SENDER_NAME` | no | default `GatePass` |
| `PORT` | no | default 4000 |
| `APP_URL` | no | public client URL, default `http://localhost:5173` — used in email links |
| `TZ_OFFSET_MINUTES` | no | default 330 (IST). Used by cron to compute "now" in org-local time |
| `CORS_ORIGIN` | no | default `*` in dev |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | no | defaults `admin@gatepass.local` / `Admin@123` |
| `ENABLE_CRON` | no | default `true`; set `false` to disable reminder job |

## 2. Database schema (auto-created on boot, idempotent)

`server/src/db/schema.sql` is executed on every boot. Everything uses
`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / `DO ... END` blocks
for enum creation, so repeated boots are safe.

Enums (created via a `DO` block that catches `duplicate_object`):
- `user_role`: `ADMIN | AUTHORITY | GUARD`
- `gatepass_status`: `PENDING | APPROVED | REJECTED | RESCHEDULE_REQUESTED | CANCELLED`
- `meeting_status`: `SCHEDULED | IN_PROGRESS | COMPLETED | EARLY_CLOSED`

```
users(
  id SERIAL PK, name TEXT NOT NULL, email TEXT NOT NULL,
  password_hash TEXT NOT NULL, role user_role NOT NULL,
  mobile TEXT, department TEXT, designation TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now())
  -- email stored lowercased by the app; UNIQUE index on lower(email)

meeting_rooms(
  id SERIAL PK, name TEXT NOT NULL, building TEXT, floor TEXT,
  capacity INTEGER NOT NULL DEFAULT 0, amenities TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now())
  -- UNIQUE (name, building, floor)

gatepass_requests(
  id SERIAL PK,
  visitor_name TEXT NOT NULL, visitor_company TEXT, visitor_designation TEXT,
  visitor_mobile TEXT NOT NULL, visitor_whatsapp TEXT, visitor_email TEXT NOT NULL,
  authority_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  requested_date DATE NOT NULL, start_time TIME NOT NULL, end_time TIME NOT NULL,
  status gatepass_status NOT NULL DEFAULT 'PENDING',
  authority_comment TEXT,
  room_id INT REFERENCES meeting_rooms(id) ON DELETE SET NULL,
  qr_code_hash TEXT UNIQUE,          -- signed JWT string
  qr_short_code TEXT UNIQUE,         -- 8-char human-typeable code, uppercase
  check_in_time TIMESTAMPTZ, check_out_time TIMESTAMPTZ,
  is_closed_early BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_sent_at TIMESTAMPTZ,      -- guards the 30-min cron against duplicates
  approved_at TIMESTAMPTZ, approved_by INT REFERENCES users(id),
  reschedule_token TEXT,             -- signed JWT for public reschedule link
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now())

meeting_logs(
  id SERIAL PK,
  gatepass_id INT NOT NULL REFERENCES gatepass_requests(id) ON DELETE CASCADE,
  actual_start TIMESTAMPTZ, actual_end TIMESTAMPTZ,
  status meeting_status NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now())
  -- UNIQUE (gatepass_id): exactly one log row per gatepass, created on approval

activity_logs(
  id SERIAL PK, user_id INT REFERENCES users(id) ON DELETE SET NULL,
  actor_label TEXT,                  -- e.g. "Visitor (public)" when user_id is null
  action TEXT NOT NULL,              -- e.g. 'GATEPASS_APPROVED'
  entity_type TEXT, entity_id INT, meta JSONB,
  ip TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())
```

Indexes (all `IF NOT EXISTS`):
`users(role)`, unique `users(lower(email))`,
`gatepass_requests(authority_id)`, `(status)`, `(requested_date)`,
`(room_id, requested_date)`, `(qr_code_hash)`, `(qr_short_code)`,
`(visitor_mobile)`, `(lower(visitor_name))`,
`meeting_logs(gatepass_id)`, `(status)`,
`activity_logs(created_at DESC)`, `(user_id)`, `(entity_type, entity_id)`.

`updated_at` is maintained by app code (`SET updated_at = now()` in every UPDATE).

## 3. Room-conflict rule (THE core business rule)

A room slot is occupied by a gatepass when ALL are true:
- `room_id` matches, `requested_date` matches
- `status = 'APPROVED'`
- its meeting log status is NOT in (`COMPLETED`, `EARLY_CLOSED`) — an early-closed
  or completed meeting frees the room immediately
- `(start_time, end_time) OVERLAPS (candidate_start, candidate_end)`

Canonical SQL lives in `server/src/services/booking.js` as
`findConflict(client, {roomId, date, startTime, endTime, excludeGatepassId})`
returning `null` or:
```json
{ "gatepass_id":12, "visitor_name":"...", "visitor_company":"...",
  "authority_id":3, "authority_name":"...", "authority_email":"...",
  "start_time":"14:00", "end_time":"15:00", "room_id":2, "room_name":"..." }
```
Approve/switch-room run inside a transaction with
`SELECT ... FROM meeting_rooms WHERE id=$1 FOR UPDATE` (row lock on the room) before
the conflict check, so two concurrent approvals cannot double-book.

Validation invariants (400 on violation): `end_time > start_time`;
duration between 15 minutes and 8 hours; `requested_date` not in the past.

## 4. HTTP conventions

- Base path `/api`. JSON in, JSON out.
- Auth: `Authorization: Bearer <jwt>`. Payload `{ sub: userId, role, name, email }`, 12h expiry.
- Success: the resource object directly, or `{ items: [...], total, page, pageSize }` for lists.
- Error: **always** `{ "error": "Human readable message", "code": "MACHINE_CODE", "details": {...}? }`
  with a correct HTTP status. Codes used: `VALIDATION_ERROR`, `UNAUTHORIZED`,
  `FORBIDDEN`, `NOT_FOUND`, `ROOM_CONFLICT`, `INVALID_STATE`, `INVALID_QR`,
  `DUPLICATE`, `RATE_LIMITED`, `INTERNAL`.
- `409 ROOM_CONFLICT` additionally carries `details.conflict` = the object in §3.
- Validation is centralised in `server/src/middleware/validate.js` using a small
  hand-rolled schema validator (no external validation lib). It throws `ApiError`.
- `server/src/middleware/error.js` exports the `ApiError` class and the error handler.

### Gatepass JSON shape (returned by every gatepass endpoint)

```json
{
  "id": 1,
  "visitor_name": "...", "visitor_company": "...", "visitor_designation": "...",
  "visitor_mobile": "...", "visitor_whatsapp": "...", "visitor_email": "...",
  "authority_id": 3, "authority_name": "...", "authority_email": "...",
  "authority_mobile": "...", "authority_department": "...",
  "reason": "...",
  "requested_date": "2026-09-10",
  "start_time": "14:00",
  "end_time": "15:00",
  "status": "APPROVED",
  "display_status": "CHECKED_IN",
  "authority_comment": null,
  "room_id": 2, "room_name": "Sequoia", "room_building": "HQ", "room_floor": "3",
  "room_capacity": 8,
  "qr_short_code": "A1B2C3D4",
  "check_in_time": "2026-09-10T08:31:00.000Z",
  "check_out_time": null,
  "is_closed_early": false,
  "meeting_status": "IN_PROGRESS",
  "actual_start": null, "actual_end": null,
  "created_at": "...", "approved_at": "..."
}
```

`requested_date` is always `YYYY-MM-DD` (never a full ISO timestamp);
`start_time`/`end_time` are always `HH:mm` (seconds trimmed).

`display_status` is derived server-side in `server/src/services/gatepassSerializer.js`:
1. `status !== 'APPROVED'` -> the raw status (`PENDING`/`REJECTED`/`RESCHEDULE_REQUESTED`/`CANCELLED`)
2. `check_out_time` set OR meeting_status in (COMPLETED, EARLY_CLOSED) -> `COMPLETED`
3. `check_in_time` set -> `CHECKED_IN`
4. otherwise -> `APPROVED`

`qr_code_hash` is NEVER returned by list endpoints. It is returned only by
`GET /api/gatepasses/:id` for the owning authority/admin, and embedded in the email.

## 5. API endpoints

### Public (no auth)
| method | path | body / query | returns |
|---|---|---|---|
| GET | `/api/public/authorities` | – | `[{id,name,department,designation,email}]` (role=AUTHORITY, is_active) |
| GET | `/api/public/rooms` | – | `[{id,name,building,floor,capacity}]` active rooms (informational) |
| POST | `/api/gatepasses/request` | see below | `201 {id, status, message, visitor_name, requested_date, start_time, end_time, authority_name}` |
| GET | `/api/gatepasses/:id/qr.png` | `?token=<qr_code_hash>` | `image/png` — 404 unless `token` matches an APPROVED row's `qr_code_hash`. What email `<img>` tags point at, since `data:` URIs are stripped by Gmail/Outlook. |
| GET | `/api/public/reschedule/:token` | – | `{gatepass:{...limited...}, authority_comment}` |
| POST | `/api/public/reschedule/:token` | `{requested_date,start_time,end_time}` | `{ok:true, gatepass:{...}}`, sets status back to `PENDING` |
| GET | `/api/health` | – | `{ok:true, db:true, time:"..."}` |

`POST /api/gatepasses/request` body:
`{visitor_name*, visitor_company, visitor_designation, visitor_mobile*, visitor_whatsapp,
  visitor_email*, authority_id*, reason*, requested_date*, start_time*, end_time*}`
Rate-limited to 5 requests / 10 min per IP (in-memory limiter in `middleware/rateLimit.js`).

### Auth
| method | path | body | returns |
|---|---|---|---|
| POST | `/api/auth/login` | `{email,password}` | `{token, user:{id,name,email,role,mobile,department}}` |
| GET | `/api/auth/me` | – | `{user}` |
| POST | `/api/auth/change-password` | `{current_password,new_password}` | `{ok:true}` |

### Gatepasses (AUTHORITY + ADMIN; AUTHORITY sees only `authority_id = self`)
| method | path | body / query | returns |
|---|---|---|---|
| GET | `/api/gatepasses` | `?status=&date=&from=&to=&q=&room_id=&page=1&pageSize=20&sort=` | `{items,total,page,pageSize}` |
| GET | `/api/gatepasses/:id` | – | gatepass object incl. `qr_code_hash` |
| GET | `/api/gatepasses/stats/summary` | – | `{pending,approved_today,checked_in,completed_today,rejected,total}` |
| POST | `/api/gatepasses/:id/approve` | `{room_id, comment?}` | gatepass — 409 ROOM_CONFLICT if busy |
| POST | `/api/gatepasses/:id/reject` | `{comment*}` | gatepass |
| POST | `/api/gatepasses/:id/reschedule` | `{comment*, suggested_date?, suggested_start?, suggested_end?}` | gatepass |
| POST | `/api/gatepasses/:id/comment` | `{comment*}` | gatepass (no status change, no email) |
| POST | `/api/gatepasses/:id/switch-room` | `{room_id*}` | gatepass — only while `status=APPROVED` and meeting not started/completed; 409 on conflict |
| POST | `/api/gatepasses/:id/close-early` | – | gatepass — sets `is_closed_early`, `meeting_logs.actual_end=now()`, meeting status `EARLY_CLOSED` |
| POST | `/api/gatepasses/:id/resend-email` | – | `{ok:true}` |

### Rooms
| method | path | body / query | returns |
|---|---|---|---|
| GET | `/api/rooms` | `?active=true` | `[room]` (any authenticated role) |
| GET | `/api/rooms/availability` | `?date=&start_time=&end_time=&exclude_gatepass_id=` | `[{...room, is_available, occupied_by}]` |
| GET | `/api/rooms/:id/schedule` | `?date=` | `{room, bookings:[{gatepass_id,visitor_name,authority_name,start_time,end_time,display_status}]}` |
| POST | `/api/rooms` | ADMIN `{name*,building,floor,capacity,amenities,is_active}` | `201 room` |
| PUT | `/api/rooms/:id` | ADMIN | room |
| DELETE | `/api/rooms/:id` | ADMIN | `{ok:true}` — soft delete (`is_active=false`); hard-deletes only if never booked |

### Security (GUARD + ADMIN)
| method | path | body / query | returns |
|---|---|---|---|
| POST | `/api/security/verify` | `{token}` or `{short_code}` | `{valid:true, gatepass, checks:{is_today,within_window,already_checked_in,already_checked_out}}` or `400 INVALID_QR` |
| GET | `/api/security/search` | `?q=` (name or mobile, min 2 chars) | `{items:[gatepass]}` — today ± 1 day, APPROVED only |
| GET | `/api/security/today` | – | `{expected:[gatepass], on_premises:[gatepass], departed:[gatepass], stats:{...}}` |
| GET | `/api/security/gatepass/:id` | – | gatepass |
| POST | `/api/security/gatepass/:id/check-in` | – | gatepass — 409 INVALID_STATE if not APPROVED / already in |
| POST | `/api/security/gatepass/:id/check-out` | – | gatepass — 409 INVALID_STATE if not checked in / already out |

Check-in sets `check_in_time=now()`, `meeting_logs.actual_start=now()`, meeting status `IN_PROGRESS`.
Check-out sets `check_out_time=now()`, `meeting_logs.actual_end=now()`, meeting status `COMPLETED`
(unless already `EARLY_CLOSED`, which is preserved).

### Admin (ADMIN only)
| method | path | body / query | returns |
|---|---|---|---|
| GET | `/api/admin/users` | `?role=&q=&page=` | `{items,total,page,pageSize}` (never returns password_hash) |
| POST | `/api/admin/users` | `{name*,email*,password*,role*,mobile,department,designation}` | `201 user` |
| PUT | `/api/admin/users/:id` | partial; `password` optional | user |
| DELETE | `/api/admin/users/:id` | – | `{ok:true}` soft-deactivate; 409 if last active admin or self |
| GET | `/api/admin/overview` | – | `{counts:{users_by_role,rooms,gatepasses_by_status}, today:{expected,checked_in,completed}, upcoming:[gatepass], room_utilisation:[{room_id,room_name,bookings_today,minutes_booked}]}` |
| GET | `/api/admin/gatepasses` | same filters as `/api/gatepasses`, unscoped | `{items,total,...}` |
| GET | `/api/admin/meeting-logs` | `?from=&to=&page=` | `{items,total,...}` |
| GET | `/api/admin/activity` | `?page=&action=&user_id=` | `{items,total,...}` |

## 6. Emails (Brevo)

`server/src/services/mailer.js` exports:
`sendEmail({to, subject, html, text, attachments, cc})` — `to` is `[{email,name}]`,
`attachments` is `[{name, contentBase64}]`. Uses `POST https://api.brevo.com/v3/smtp/email`
via axios with header `api-key`. If `BREVO_API_KEY` is missing it logs
`[mailer:dry-run]` and resolves — it must NEVER throw into a request path.
All sends are fire-and-forget from controllers via `safeSend(...)` (catches + logs).

`server/src/services/templates.js` exports pure functions returning
`{subject, html, text}`, all sharing one branded responsive HTML shell:
- `newRequestToAuthority({gatepass, authority, actionUrl})`
- `approvedToVisitor({gatepass, qrImageUrl, room, authority})`  // a fetchable https URL, not a data: URI — Gmail/Outlook strip data: URIs from mail
- `approvedToAuthority({gatepass, room, visitor})`
- `rejectedToVisitor({gatepass, comment, authority})`
- `rescheduleToVisitor({gatepass, comment, rescheduleUrl, authority})`
- `roomSwitchedNotice({gatepass, oldRoom, newRoom})`
- `reminder30({gatepass, room, recipientRole})`
- `meetingClosedEarly({gatepass})`
- `visitorRescheduledToAuthority({gatepass, actionUrl})`
- `welcomeUser({user, tempPassword, loginUrl})`

`server/src/utils/ics.js` -> `buildIcs({uid, title, description, location, start, end, organizer, attendees})`
returns a raw RFC 5545 string with CRLF line endings; attached as `gatepass-<id>.ics`
(base64) on approval emails, with `METHOD:REQUEST`.

`server/src/utils/qr.js` -> `signGatepassToken(gatepassId, nonce)`, `verifyGatepassToken(token)`,
`makeShortCode()`, `renderQrDataUrl(text)` (PNG data URL — not usable in email, kept for non-mail uses),
`renderQrBuffer(text)` (raw PNG buffer — used for the email attachment and by the
`GET /api/gatepasses/:id/qr.png?token=...` image endpoint email templates link to;
unauthenticated by necessity, gated on `token` matching the row's `qr_code_hash`).

## 7. Cron (`server/src/jobs/reminders.js`)

`node-cron` every minute (`* * * * *`). Finds APPROVED gatepasses where
`reminder_sent_at IS NULL`, `requested_date = <today in org tz>` and the meeting
start is 28–32 minutes away; sends `reminder30` to visitor + authority; stamps
`reminder_sent_at`. Uses `UPDATE ... WHERE reminder_sent_at IS NULL RETURNING *`
to claim rows atomically before sending. A second job at `*/5 * * * *` marks
overdue `IN_PROGRESS` meetings past `end_time + 2h` as `COMPLETED`.
Guarded by `ENABLE_CRON !== 'false'`.

## 8. Frontend

Stack: React 18, react-router-dom v6, Tailwind 3, framer-motion, lucide-react,
html5-qrcode, axios. **No other UI libraries.**

`src/lib/api.js` — axios instance `baseURL: '/api'`, request interceptor adds
`Authorization`, response interceptor maps errors to
`{ message, code, status, details }` and on 401 clears auth + redirects to `/login`.
Exports named API groups: `authApi`, `publicApi`, `gatepassApi`, `roomApi`,
`securityApi`, `adminApi`.

`src/lib/auth.jsx` — `AuthProvider`, `useAuth()` -> `{user, token, login, logout, loading}`,
persisted in `localStorage` under key `gatepass.auth`. `<ProtectedRoute roles={[...]}>`
redirects to `/login`, and to the role's home if the role does not match.

`src/lib/toast.jsx` — `ToastProvider` + `useToast()` -> `toast.success/error/info(msg)`.
Framer-motion animated stack, top-right (bottom-center on mobile).

### Routes
```
/                        public request form         (PublicRequest)
/request/success         confirmation screen         (RequestSuccess)
/reschedule/:token       visitor reschedule form     (Reschedule)
/login                   login                       (Login)
/authority               dashboard + queue           (AuthorityDashboard)
/authority/requests/:id  detail + actions            (RequestDetail)
/authority/rooms         room schedule board         (RoomBoard)
/guard                   scanner (mobile first)      (GuardScan)
/guard/search            name/mobile search          (GuardSearch)
/guard/visitor/:id       visitor detail + in/out     (GuardVisitor)
/admin                   overview                    (AdminOverview)
/admin/users             user CRUD                   (AdminUsers)
/admin/rooms             room CRUD                   (AdminRooms)
/admin/gatepasses        all gatepasses              (AdminGatepasses)
/admin/logs              activity + meeting logs     (AdminLogs)
*                        NotFound
```
Role home: ADMIN -> `/admin`, AUTHORITY -> `/authority`, GUARD -> `/guard`.

### Design system (Tailwind, defined in `tailwind.config.js` + `src/index.css`)

Palette (Tailwind `theme.extend.colors`):
- `brand`: 50 `#eef4ff`, 100 `#dbe6ff`, 200 `#bccfff`, 300 `#93aeff`, 400 `#6b88fb`,
  500 `#4f6ef7`, 600 `#3b54e0`, 700 `#2f43b4`, 800 `#28398c`, 900 `#1b2560`
- `ink`: 50 `#f7f8fb`, 100 `#eceef3`, 200 `#d7dbe4`, 300 `#b9bfcd`, 400 `#8a93a6`,
  500 `#5a6478`, 600 `#3c4557`, 700 `#242c40`, 800 `#161d2e`, 900 `#0d1220`
- semantic: `success` `#10b981`, `warning` `#f59e0b`, `danger` `#ef4444`, `info` `#0ea5e9`
- Surfaces: page `bg-ink-50`, cards `bg-white rounded-2xl border border-ink-100 shadow-card`
- `boxShadow.card` = `0 1px 2px rgba(13,18,32,.04), 0 8px 24px -12px rgba(13,18,32,.12)`
- Font: Inter via Google Fonts link in `index.html`, fallback system stack.
- Radii: `rounded-xl` (12px) controls, `rounded-2xl` (16px) cards.

Status badge colors (single source: `src/lib/status.js` -> `statusMeta(display_status)`
returning `{label, className, Icon, dot}`):
- `PENDING` amber, `APPROVED` brand/indigo, `CHECKED_IN` emerald, `COMPLETED` slate,
  `REJECTED` red, `RESCHEDULE_REQUESTED` violet, `CANCELLED` slate.

Shared UI primitives in `src/components/ui/` — each a default export, forwarding
`className` merged via the `cn()` helper from `src/lib/cn.js`:
`Button.jsx` (`variant: primary|secondary|ghost|danger|success`, `size: sm|md|lg`,
`loading`, `icon`, `as`), `Card.jsx` (+`CardHeader/CardTitle/CardBody/CardFooter` named exports),
`Badge.jsx` (`tone`), `StatusBadge.jsx` (takes `status`), `Input.jsx`, `Textarea.jsx`,
`Select.jsx`, `Field.jsx` (label + error + hint wrapper), `Modal.jsx` (framer-motion,
focus trap, Esc to close, portal), `Drawer.jsx`, `Spinner.jsx`, `Skeleton.jsx`,
`EmptyState.jsx`, `Stat.jsx`, `Tabs.jsx`, `Pagination.jsx`, `ConfirmDialog.jsx`,
`DatePicker.jsx` (styled native date input), `TimeRangePicker.jsx`.

Layout in `src/components/layout/`: `AppShell.jsx` (sidebar desktop / bottom-nav mobile),
`TopBar.jsx`, `SideNav.jsx`, `MobileNav.jsx`, `PageHeader.jsx`, `PublicShell.jsx`.

Motion conventions (`src/lib/motion.js` exports the variants — do not redefine inline):
- `pageVariants` — fade + 8px rise, 0.22s easeOut; applied via `<AnimatePresence mode="wait">` in `App.jsx`
- `listItem` / `listContainer` — stagger 0.04s
- `modalVariants`, `backdropVariants`
- Respect `prefers-reduced-motion` (motion.js reads it once and flattens variants).

Accessibility: every interactive element keyboard reachable, `aria-label` on icon-only
buttons, `role="status"` on toasts, visible `focus-visible:ring-2 ring-brand-500` rings,
form errors linked via `aria-describedby`.

Responsiveness: mobile-first. Tables collapse to card lists below `md`. Guard UI is
designed for one-handed phone use: large tap targets (min 44px), sticky action bar.

### Client date/time helpers (`src/lib/format.js`)
`formatDate(d)` -> `10 Sep 2026`; `formatTime(t)` -> `2:00 PM`;
`formatRange(s,e)`; `formatDateTime(iso)`; `relativeTime(iso)`; `todayISO()`;
`minutesBetween(s,e)`. Times from the API are `HH:mm` strings — never pass them
through `new Date()` alone.

## 9. Conventions

- Server: ESM, async/await, no callbacks. Every route handler wrapped in
  `asyncHandler` from `middleware/asyncHandler.js`. Controllers hold logic;
  routes only wire middleware + controller.
- All SQL is parameterised (`$1, $2`) — never string interpolation.
- `pool.query` for reads; `withTransaction(async (client) => {...})` from
  `db/pool.js` for multi-statement writes.
- Passwords hashed with `bcryptjs` (cost 10).
- Client: function components + hooks only. No class components. Plain JSX, no TS.
- Every list/detail screen handles three states: loading (Skeleton), empty
  (EmptyState), error (retry affordance).

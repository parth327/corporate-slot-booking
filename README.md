# GatePass

Visitor management and meeting-room booking for workplaces that run on appointments.

A visitor requests a meeting from a public form. Their host approves it and reserves a
room — the system refuses to double-book. The visitor receives an emailed gatepass with
a QR code and a calendar invite. Security scans the QR at the gate to check them in and
out. When a meeting finishes early the host closes it and the room frees up instantly.

```
Visitor form  ──▶  Host approves + books room  ──▶  QR gatepass + .ics by email
                            │                                    │
                            │                          Guard scans at gate
                            ▼                                    ▼
                   30-min reminder (cron)              Check-in ──▶ Check-out
```

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, Tailwind CSS 3, Framer Motion, lucide-react, html5-qrcode |
| Backend | Node 18+, Express 4, ESM |
| Database | PostgreSQL (Neon.tech), `pg` driver, auto-migrating schema |
| Email | Brevo transactional REST API (`/v3/smtp/email`) + RFC 5545 `.ics` invites |
| Auth | JWT (HS256) + bcrypt, role-based access control |
| Jobs | `node-cron` — 30-minute pre-meeting alerts, overdue-meeting sweeper |

No ORM and no UI component library: the SQL and the design system are both first-party
and readable.

---

## Quick start

```bash
# 1. install (already done if you cloned with node_modules present)
npm run install:all

# 2. configure the server
cp server/.env.example server/.env
#    then edit server/.env — DATABASE_URL and JWT_SECRET are the only required values

# 3. run the API (creates tables and seeds on first boot)
npm run dev:server        # http://localhost:4000

# 4. run the UI in a second terminal
npm run dev:client        # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://localhost:4000`, so there is no CORS
configuration to do in development.

### Getting a `DATABASE_URL`

1. Create a free project at <https://console.neon.tech>.
2. Copy the **pooled** connection string from *Connection Details*.
3. Keep `?sslmode=require` on the end and paste it into `server/.env`.

The schema is created automatically on boot — there is no separate migration step to
remember. `server/src/db/schema.sql` is fully idempotent, so restarting is always safe.

### Getting a `BREVO_API_KEY` (optional)

Sign in at <https://app.brevo.com> → **SMTP & API** → **API Keys** → create a v3 key.
Set `BREVO_SENDER_EMAIL` to an address you have verified as a sender.

**Without a key the app still runs.** The mailer drops into dry-run mode and prints
every message it would have sent to the server console, so you can exercise the entire
workflow before wiring up email.

---

## Seeded accounts

Created on first boot. Change them before exposing the app to anyone.

| Role | Email | Password |
|---|---|---|
| Admin | whatever `SEED_ADMIN_EMAIL` is set to (default `admin@gatepass.local`) | `SEED_ADMIN_PASSWORD` (default `Admin@123`) |
| Authority | `asha.rao@`, `vikram.nair@`, `meera.iyer@gatepass.local` | `Passw0rd!23` |
| Guard | `ramesh.kumar@`, `sunil.yadav@gatepass.local` | `Passw0rd!23` |

The exact accounts are printed to the server console on the boot that creates them.

> **Quote passwords containing `#`.** An unquoted `#` in a `.env` file starts an inline
> comment, so `SEED_ADMIN_PASSWORD=Secret#1` silently becomes `Secret`. Write
> `SEED_ADMIN_PASSWORD="Secret#1"` instead.

The bootstrap admin is only created when no active admin exists, so changing its
password in the app is not undone by the next restart. Demo hosts, guards and rooms
appear only when `SEED_DEMO_DATA=true`; set it to `false` for a real deployment.

---

## Roles

| Role | Can do |
|---|---|
| **Visitor** *(no account)* | Submit a gatepass request; respond to a reschedule request via an emailed link |
| **Approval Authority** | Review their own queue; approve (picking a room), reject, comment, request a reschedule; switch rooms before the meeting starts; close a meeting early; contact the visitor by email, phone or WhatsApp |
| **Security Guard** | Mobile scanner; verify a QR or short code; search by name or mobile; view host, room, building and floor; check visitors in and out |
| **Admin** | Full CRUD over authorities and guards; manage rooms; system-wide view of every gatepass, room schedule, active check-in, meeting log and activity log |

---

## How the important parts work

### Room conflicts

A room is considered occupied for a candidate slot when an **approved** gatepass exists
for the same room and date, whose meeting has not been completed or closed early, and
whose time range `OVERLAPS` the candidate range. Approval and room-switching both run
inside a transaction that takes a `SELECT … FOR UPDATE` row lock on the room before
checking, so two hosts approving at the same instant cannot double-book.

When a room is busy the API answers `409` with the holder's details, and the UI names
who has the slot rather than just refusing.

### Early release

"Close meeting early" writes `meeting_logs.actual_end` and sets the log to
`EARLY_CLOSED`. The conflict query ignores `EARLY_CLOSED` and `COMPLETED` meetings, so
the room becomes bookable the moment the button is pressed — no cleanup job involved.

### QR gatepasses

On approval the server signs a JWT (`{ gid, nonce, typ: 'gatepass' }`) with `QR_SECRET`,
stores it on the row, renders it to a PNG data URI and embeds it in the visitor's email
alongside an 8-character short code for when a camera will not cooperate. Verification
checks the signature *and* that the presented token still matches the stored one, so a
regenerated pass invalidates the old one.

### Reminders

A `node-cron` job runs every minute, claims the rows whose start time is 28–32 minutes
away with an atomic `UPDATE … WHERE reminder_sent_at IS NULL RETURNING id`, and only
then sends. Claiming before sending is what stops a slow mail call from producing
duplicate alerts. A second job every five minutes closes meetings still marked in
progress more than two hours after they were due to end.

---

## Project layout

```
server/
  src/
    config/env.js          environment loading + validation
    db/                    pool, schema.sql, migrate, seed
    middleware/            auth, validate, rateLimit, error, asyncHandler
    utils/                 time (timezone-aware), qr, ics
    services/              mailer, templates, booking, gatepassSerializer, activity
    controllers/           auth, public, gatepass, room, security, admin
    routes/                one router per controller
    jobs/reminders.js      node-cron sweeps
    app.js / index.js      wiring and boot
client/
  src/
    lib/                   api, auth, toast, motion, format, status, constants
    components/ui/         the design system (Button, Card, Modal, DataTable…)
    components/layout/     AppShell, SideNav, TopBar, MobileNav
    pages/public/          visitor request, success, reschedule
    pages/authority/       queue, request detail, room board
    pages/guard/           scanner, search, visitor check-in/out
    pages/admin/           overview, users, rooms, gatepasses, logs
docs/CONTRACT.md           the API and design contract this code is built against
scripts/check-imports.mjs  static integrity check across both packages
```

---

## Verification

```bash
npm run check     # every import resolves; every named import really is exported
npm test          # server unit tests (no database required)
npm run build     # production client bundle
```

`npm test` additionally runs the end-to-end suite against a real database when
`DATABASE_URL` is set, covering the approve → conflict → scan → check-in → close-early
path.

---

## Deploying

1. `npm run build` produces `client/dist`.
2. The Express app serves `client/dist` automatically when it exists, with an SPA
   fallback — so a single Node process can host the whole application.
3. Set `NODE_ENV=production`, a real `JWT_SECRET`, `APP_URL` to the public URL, and
   `CORS_ORIGIN` to that same origin.
4. Set `TZ_OFFSET_MINUTES` to your organisation's offset from UTC (330 = IST) so the
   reminder job fires against local wall-clock times.

Run exactly one instance of the process with `ENABLE_CRON=true`; set it to `false` on
any additional replicas so reminders are not duplicated.

---

## Security notes

- Passwords are bcrypt-hashed (cost 10) and never returned by any endpoint.
- All SQL is parameterised; there is no string-interpolated query in the codebase.
- Authorities are scoped to their own requests at the query level — an id belonging to
  another host returns `404`, not `403`, so ids cannot be enumerated.
- The public request endpoint is rate limited (5 per 10 minutes per IP), as is login
  (10 per 15 minutes).
- Visitor-supplied text is HTML-escaped before it reaches an email template.
- Every state change is written to `activity_logs` with the actor and IP.

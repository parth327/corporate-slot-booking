-- ===========================================================================
-- GatePass — full database schema (docs/CONTRACT.md section 2).
--
-- This file is executed on EVERY boot and must therefore be fully idempotent:
-- enum types are created inside DO blocks that swallow duplicate_object, every
-- table uses CREATE TABLE IF NOT EXISTS, every index CREATE INDEX IF NOT EXISTS,
-- and every column added after the original blueprint is re-applied through
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS so an older database self-upgrades.
--
-- `-- >>> STEP:` marker lines split the file into logged chunks for migrate.js.
-- They must stay on their own line and never appear inside a dollar-quoted body.
-- ===========================================================================

-- >>> STEP: enum types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('ADMIN', 'AUTHORITY', 'GUARD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE gatepass_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'RESCHEDULE_REQUESTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE meeting_status AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'EARLY_CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- >>> STEP: table users
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL,
  mobile        TEXT,
  department    TEXT,
  designation   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- >>> STEP: table meeting_rooms
CREATE TABLE IF NOT EXISTS meeting_rooms (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  building   TEXT,
  floor      TEXT,
  capacity   INTEGER NOT NULL DEFAULT 0,
  amenities  TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS building   TEXT;
ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS floor      TEXT;
ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS capacity   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS amenities  TEXT;
ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- >>> STEP: table gatepass_requests
CREATE TABLE IF NOT EXISTS gatepass_requests (
  id                  SERIAL PRIMARY KEY,
  visitor_name        TEXT NOT NULL,
  visitor_company     TEXT,
  visitor_designation TEXT,
  visitor_mobile      TEXT NOT NULL,
  visitor_whatsapp    TEXT,
  visitor_email       TEXT NOT NULL,
  authority_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason              TEXT NOT NULL,
  requested_date      DATE NOT NULL,
  start_time          TIME NOT NULL,
  end_time            TIME NOT NULL,
  status              gatepass_status NOT NULL DEFAULT 'PENDING',
  authority_comment   TEXT,
  room_id             INTEGER REFERENCES meeting_rooms(id) ON DELETE SET NULL,
  qr_code_hash        TEXT,
  qr_short_code       TEXT,
  check_in_time       TIMESTAMPTZ,
  check_out_time      TIMESTAMPTZ,
  is_closed_early     BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_sent_at    TIMESTAMPTZ,
  approved_at         TIMESTAMPTZ,
  approved_by         INTEGER REFERENCES users(id),
  reschedule_token    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- >>> STEP: gatepass_requests self-upgrade columns
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS visitor_company     TEXT;
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS visitor_designation TEXT;
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS visitor_whatsapp    TEXT;
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS status              gatepass_status NOT NULL DEFAULT 'PENDING';
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS authority_comment   TEXT;
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS room_id             INTEGER REFERENCES meeting_rooms(id) ON DELETE SET NULL;
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS qr_code_hash        TEXT;
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS qr_short_code       TEXT;
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS check_in_time       TIMESTAMPTZ;
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS check_out_time      TIMESTAMPTZ;
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS is_closed_early     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS reminder_sent_at    TIMESTAMPTZ;
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS approved_at         TIMESTAMPTZ;
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS approved_by         INTEGER REFERENCES users(id);
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS reschedule_token    TEXT;
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE gatepass_requests ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT now();

-- >>> STEP: table meeting_logs
CREATE TABLE IF NOT EXISTS meeting_logs (
  id           SERIAL PRIMARY KEY,
  gatepass_id  INTEGER NOT NULL REFERENCES gatepass_requests(id) ON DELETE CASCADE,
  actual_start TIMESTAMPTZ,
  actual_end   TIMESTAMPTZ,
  status       meeting_status NOT NULL DEFAULT 'SCHEDULED',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE meeting_logs ADD COLUMN IF NOT EXISTS actual_start TIMESTAMPTZ;
ALTER TABLE meeting_logs ADD COLUMN IF NOT EXISTS actual_end   TIMESTAMPTZ;
ALTER TABLE meeting_logs ADD COLUMN IF NOT EXISTS status       meeting_status NOT NULL DEFAULT 'SCHEDULED';
ALTER TABLE meeting_logs ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE meeting_logs ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT now();

-- >>> STEP: table activity_logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_label TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   INTEGER,
  meta        JSONB,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS actor_label TEXT;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS entity_id   INTEGER;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS meta        JSONB;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS ip          TEXT;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- >>> STEP: unique indexes
-- Emails are stored lowercased by the app; this functional unique index is the
-- real guard, and the ON CONFLICT target used by the seeder and admin user CRUD.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx
  ON users (lower(email));

-- Contract: meeting_rooms UNIQUE (name, building, floor).
CREATE UNIQUE INDEX IF NOT EXISTS meeting_rooms_name_building_floor_uidx
  ON meeting_rooms (name, building, floor);

-- Contract: gatepass_requests.qr_code_hash / qr_short_code are UNIQUE. Declared
-- as unique indexes rather than inline column constraints so the guarantee also
-- lands on databases whose table predates those columns.
CREATE UNIQUE INDEX IF NOT EXISTS gatepass_requests_qr_code_hash_uidx
  ON gatepass_requests (qr_code_hash);
CREATE UNIQUE INDEX IF NOT EXISTS gatepass_requests_qr_short_code_uidx
  ON gatepass_requests (qr_short_code);

-- Contract: meeting_logs UNIQUE (gatepass_id) — exactly one log row per gatepass.
CREATE UNIQUE INDEX IF NOT EXISTS meeting_logs_gatepass_id_uidx
  ON meeting_logs (gatepass_id);

-- >>> STEP: lookup indexes
CREATE INDEX IF NOT EXISTS users_role_idx
  ON users (role);

CREATE INDEX IF NOT EXISTS gatepass_requests_authority_id_idx
  ON gatepass_requests (authority_id);
CREATE INDEX IF NOT EXISTS gatepass_requests_status_idx
  ON gatepass_requests (status);
CREATE INDEX IF NOT EXISTS gatepass_requests_requested_date_idx
  ON gatepass_requests (requested_date);
CREATE INDEX IF NOT EXISTS gatepass_requests_room_id_requested_date_idx
  ON gatepass_requests (room_id, requested_date);
CREATE INDEX IF NOT EXISTS gatepass_requests_visitor_mobile_idx
  ON gatepass_requests (visitor_mobile);
CREATE INDEX IF NOT EXISTS gatepass_requests_visitor_name_lower_idx
  ON gatepass_requests (lower(visitor_name));

CREATE INDEX IF NOT EXISTS meeting_logs_status_idx
  ON meeting_logs (status);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx
  ON activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_user_id_idx
  ON activity_logs (user_id);
CREATE INDEX IF NOT EXISTS activity_logs_entity_type_entity_id_idx
  ON activity_logs (entity_type, entity_id);

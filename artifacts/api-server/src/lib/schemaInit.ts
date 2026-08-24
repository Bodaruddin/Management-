/**
 * Auto-initialize database schema when a new connection is activated.
 * PostgreSQL: runs CREATE TABLE IF NOT EXISTS for every table (idempotent).
 * Firebase:   Firestore collections are created on first write — just verify connectivity.
 */
import type pg from "pg";

// ─── PostgreSQL DDL ───────────────────────────────────────────────────────────
const PG_DDL = `
CREATE TABLE IF NOT EXISTS classes (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS sections (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  father_name   TEXT NOT NULL DEFAULT '',
  mother_name   TEXT NOT NULL DEFAULT '',
  mobile_number TEXT NOT NULL DEFAULT '',
  class         TEXT NOT NULL,
  section       TEXT,
  admission_no  TEXT,
  roll_number   TEXT NOT NULL,
  date_of_birth TEXT NOT NULL DEFAULT '',
  address       TEXT,
  photo         TEXT,
  annual_fee    INTEGER,
  discount_type TEXT,
  discount_value INTEGER,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Idempotent column additions for databases created before sections/admission_no/status were added
ALTER TABLE students ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS admission_no TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS alumni (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     TEXT NOT NULL,
  student_name   TEXT NOT NULL,
  class          TEXT NOT NULL,
  section        TEXT,
  graduation_year TEXT NOT NULL,
  name           TEXT NOT NULL,
  father_name    TEXT NOT NULL DEFAULT '',
  mobile_number  TEXT NOT NULL DEFAULT '',
  batch          TEXT NOT NULL,
  pass_out_class TEXT NOT NULL,
  roll_number    TEXT NOT NULL DEFAULT '',
  admission_no   TEXT,
  date_of_birth  TEXT NOT NULL DEFAULT '',
  address        TEXT,
  photo          TEXT,
  achievements   TEXT,
  current_status TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Alumni imports use the student identity as their natural key. These
-- additions keep older databases compatible with the current import model.
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS student_id TEXT;
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS student_name TEXT;
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS class TEXT;
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS graduation_year TEXT;
UPDATE alumni
SET
  student_id = COALESCE(NULLIF(student_id, ''), 'legacy-' || id),
  student_name = COALESCE(NULLIF(student_name, ''), name),
  class = COALESCE(NULLIF(class, ''), pass_out_class),
  graduation_year = COALESCE(NULLIF(graduation_year, ''), batch)
WHERE student_id IS NULL
   OR student_name IS NULL
   OR class IS NULL
   OR graduation_year IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS alumni_student_id_unique ON alumni (student_id);

CREATE TABLE IF NOT EXISTS teachers (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  subject       TEXT NOT NULL DEFAULT '',
  mobile_number TEXT NOT NULL DEFAULT '',
  salary        INTEGER NOT NULL DEFAULT 0,
  username      TEXT NOT NULL UNIQUE,
  password      TEXT NOT NULL DEFAULT '',
  join_date     TEXT NOT NULL DEFAULT '',
  photo         TEXT,
  permissions   JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class        TEXT NOT NULL,
  date         TEXT NOT NULL,
  status       TEXT NOT NULL,
  taken_by     TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS inactivation_requests (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        TEXT NOT NULL,
  student_name      TEXT NOT NULL DEFAULT '',
  student_class     TEXT NOT NULL DEFAULT '',
  teacher_id        TEXT NOT NULL,
  teacher_name      TEXT NOT NULL DEFAULT '',
  reason            TEXT NOT NULL,
  document_base64   TEXT,
  document_name     TEXT,
  document_mime_type TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  admin_note        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  reviewed_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS exams (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  class            TEXT NOT NULL,
  subjects         JSONB NOT NULL DEFAULT '[]',
  subject_schedule JSONB,
  date             TEXT NOT NULL DEFAULT '',
  max_marks        INTEGER NOT NULL DEFAULT 100,
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS exam_results (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id      TEXT NOT NULL,
  student_id   TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class        TEXT NOT NULL,
  roll_number  TEXT NOT NULL,
  marks        JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS fee_types (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  amount      INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  category    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS fee_records (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      TEXT NOT NULL,
  student_name    TEXT NOT NULL DEFAULT '',
  class           TEXT NOT NULL DEFAULT '',
  amount          INTEGER NOT NULL,
  date            TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  fee_type_id     TEXT,
  fee_type_name   TEXT,
  collected_by    TEXT NOT NULL DEFAULT '',
  receipt_number  TEXT,
  payment_method  TEXT,
  fee_category    TEXT,
  discount_applied INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS salary_records (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    TEXT NOT NULL,
  teacher_name  TEXT NOT NULL DEFAULT '',
  month         TEXT NOT NULL,
  year          INTEGER NOT NULL,
  amount        INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',
  paid_date     TEXT,
  receipt_number TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  date        TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS promotion_records (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   TEXT NOT NULL,
  student_name TEXT NOT NULL DEFAULT '',
  from_class   TEXT NOT NULL,
  to_class     TEXT NOT NULL,
  promoted_by  TEXT NOT NULL DEFAULT '',
  promoted_at  TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Idempotent: add class_subjects column to exams if missing
ALTER TABLE exams ADD COLUMN IF NOT EXISTS class_subjects JSONB;

CREATE TABLE IF NOT EXISTS mark_submissions (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id      TEXT NOT NULL,
  class        TEXT NOT NULL,
  subject      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft',
  teacher_id   TEXT,
  teacher_name TEXT,
  submitted_at TIMESTAMPTZ,
  locked_by    TEXT,
  locked_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (exam_id, class, subject)
);

CREATE TABLE IF NOT EXISTS mark_audit_log (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     TEXT NOT NULL,
  class       TEXT NOT NULL,
  subject     TEXT NOT NULL,
  action      TEXT NOT NULL,
  actor_id    TEXT NOT NULL,
  actor_name  TEXT NOT NULL,
  actor_role  TEXT NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
`;

export async function initPostgresSchema(pool: pg.Pool): Promise<void> {
  await pool.query(PG_DDL);
}

export async function initFirebaseSchema(
  db: FirebaseFirestore.Firestore,
): Promise<void> {
  // Firestore creates collections automatically on first write.
  // Just verify connectivity by doing a lightweight read.
  await db.collection("_health").limit(1).get();
}

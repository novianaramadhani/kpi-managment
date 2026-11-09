-- Menyelaraskan kolom dan tabel tambahan dari commit 0e0a0df87f05a2d6117f1d8b9eedebe94a7bfcb7
-- bersifat idempoten (IF NOT EXISTS) dan aman untuk data produksi.

-- 1. Kolom tambahan pada master_parameters
ALTER TABLE "master_parameters" ADD COLUMN IF NOT EXISTS "parameter_type" text NOT NULL DEFAULT 'SUB_ITEMS';
ALTER TABLE "master_parameters" ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'INDIVIDUAL';
ALTER TABLE "master_parameters" ADD COLUMN IF NOT EXISTS "target" text;
ALTER TABLE "master_parameters" ADD COLUMN IF NOT EXISTS "weight" numeric(6, 4);

UPDATE "master_parameters"
SET "parameter_type" = 'DIRECT'
WHERE "department_id" IS NULL
   OR LOWER( COALESCE("name", '') ) ~ '(kehadiran|disiplin|coaching|couching|counseling|conseling|inovasi|improvement|imporvement|keselamatan|kepatuhan|surat peringatan|\msp\M)'
   OR LOWER( COALESCE("code", '') ) LIKE 'corp-%'
   OR LOWER( COALESCE("code", '') ) LIKE 'gen-%';

-- 2. Kolom tambahan pada kpi_parameters
ALTER TABLE "kpi_parameters" ADD COLUMN IF NOT EXISTS "scope" text DEFAULT 'INDIVIDUAL';

-- 3. Tabel user_onboarding
CREATE TABLE IF NOT EXISTS "user_onboarding" (
  "id" serial PRIMARY KEY,
  "employee_id" integer REFERENCES "employees"("id") ON DELETE CASCADE,
  "nik" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'NOT_STARTED',
  "current_step" integer NOT NULL DEFAULT 1,
  "started_at" timestamp,
  "completed_at" timestamp,
  "skipped_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_onboarding_nik" ON "user_onboarding" ("nik");
CREATE INDEX IF NOT EXISTS "idx_user_onboarding_emp" ON "user_onboarding" ("employee_id");

-- 4. Tabel department_kpi_actuals
CREATE TABLE IF NOT EXISTS "department_kpi_actuals" (
  "id" serial PRIMARY KEY,
  "department_id" integer NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
  "master_parameter_id" integer NOT NULL REFERENCES "master_parameters"("id") ON DELETE CASCADE,
  "period_id" integer NOT NULL REFERENCES "kpi_periods"("id") ON DELETE CASCADE,
  "annual_actual" numeric(20, 4),
  "monthly_actuals" jsonb,
  "notes" text,
  "updated_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_dept_param_period" ON "department_kpi_actuals" ("department_id", "master_parameter_id", "period_id");
CREATE INDEX IF NOT EXISTS "idx_dept_actuals_dept_period" ON "department_kpi_actuals" ("department_id", "period_id");


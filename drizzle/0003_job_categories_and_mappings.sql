CREATE TABLE IF NOT EXISTS "job_categories" (
  "id" serial PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "job_position_mappings" (
  "id" serial PRIMARY KEY,
  "job_position_id" integer NOT NULL UNIQUE REFERENCES "job_positions"("id") ON DELETE CASCADE,
  "department_id" integer NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
  "job_level_id" integer REFERENCES "job_levels"("id") ON DELETE SET NULL,
  "job_category_id" integer REFERENCES "job_categories"("id") ON DELETE SET NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "job_position_mappings_dept_idx" ON "job_position_mappings" ("department_id");
CREATE INDEX IF NOT EXISTS "job_position_mappings_level_idx" ON "job_position_mappings" ("job_level_id");
CREATE INDEX IF NOT EXISTS "job_position_mappings_cat_idx" ON "job_position_mappings" ("job_category_id");

-- Seed default dynamic job categories
INSERT INTO "job_categories" ("code", "name", "sort_order") VALUES
  ('MGR', 'Manager', 1),
  ('SUPT', 'Superintendent', 2),
  ('SPV', 'SPV', 3),
  ('FOREMAN', 'Foreman', 4),
  ('ENGINEER', 'Engineer', 5),
  ('ADMIN', 'Admin', 6),
  ('MEKANIK', 'Mekanik', 7),
  ('OPERATOR', 'Operator', 8),
  ('STAFF', 'Staff', 9),
  ('OTHERS', 'Others', 10)
ON CONFLICT ("code") DO NOTHING;


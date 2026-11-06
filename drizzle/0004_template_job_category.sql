-- Menambahkan kolom job_category_id ke kpi_templates untuk menghubungkan template KPI dengan kombinasi Departemen + Job Category
ALTER TABLE "kpi_templates" ADD COLUMN IF NOT EXISTS "job_category_id" integer REFERENCES "job_categories"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_kpi_tpl_job_category_id" ON "kpi_templates" ("job_category_id");


CREATE TYPE "public"."aggregation_method" AS ENUM('AVERAGE', 'SUM', 'LAST_VALUE', 'RATIO');--> statement-breakpoint
CREATE TYPE "public"."appraisal_status" AS ENUM('DRAFT', 'SUBMITTED', 'REVIEWED', 'FINAL');--> statement-breakpoint
CREATE TYPE "public"."band_operator" AS ENUM('GT', 'GTE', 'LT', 'LTE', 'EQ', 'BETWEEN', 'TEXT');--> statement-breakpoint
CREATE TYPE "public"."compare_basis" AS ENUM('ACTUAL', 'ACHIEVEMENT');--> statement-breakpoint
CREATE TYPE "public"."input_type" AS ENUM('PERCENTAGE', 'NUMBER', 'CURRENCY', 'MONTHLY_ACTUAL', 'QUALITATIVE');--> statement-breakpoint
CREATE TYPE "public"."period_status" AS ENUM('DRAFT', 'ACTIVE', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."pic_role" AS ENUM('HEAD_DEPT', 'HR', 'HSE', 'SUPERINTENDENT');--> statement-breakpoint
CREATE TABLE "appraisal_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"appraisal_id" integer NOT NULL,
	"parameter_id" integer NOT NULL,
	"target" numeric(20, 4),
	"actual" numeric(20, 4),
	"monthly_targets" jsonb,
	"monthly_actuals" jsonb,
	"qualitative_value" text,
	"annual_actual" numeric(20, 4),
	"achievement" numeric(12, 4),
	"band_label" text,
	"score" numeric(8, 2),
	"weighted_score" numeric(8, 4),
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appraisals" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"template_id" integer,
	"appraiser_id" integer,
	"tenure_months" integer DEFAULT 0 NOT NULL,
	"is_eligible" boolean DEFAULT true NOT NULL,
	"status" "appraisal_status" DEFAULT 'DRAFT' NOT NULL,
	"final_score" numeric(8, 4),
	"notes" text,
	"submitted_at" timestamp,
	"reviewed_at" timestamp,
	"finalized_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" integer,
	"action" text NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL,
	"changes" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"nik" text NOT NULL,
	"name" text NOT NULL,
	"department_id" integer NOT NULL,
	"job_level_id" integer NOT NULL,
	"job_position" text NOT NULL,
	"date_of_hire" date NOT NULL,
	"appraiser_id" integer,
	"head_dept_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employees_nik_unique" UNIQUE("nik")
);
--> statement-breakpoint
CREATE TABLE "job_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "job_levels_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "kpi_bands" (
	"id" serial PRIMARY KEY NOT NULL,
	"parameter_id" integer NOT NULL,
	"label" text NOT NULL,
	"operator" "band_operator" NOT NULL,
	"min_value" numeric(20, 4),
	"max_value" numeric(20, 4),
	"score" numeric(8, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"name" text NOT NULL,
	"weight" numeric(6, 4) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_parameters" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"weight" numeric(6, 4) NOT NULL,
	"max_score" numeric(8, 2) DEFAULT '25' NOT NULL,
	"input_type" "input_type" DEFAULT 'NUMBER' NOT NULL,
	"aggregation" "aggregation_method" DEFAULT 'AVERAGE' NOT NULL,
	"compare_basis" "compare_basis" DEFAULT 'ACTUAL' NOT NULL,
	"unit" text,
	"pic_role" "pic_role" DEFAULT 'HEAD_DEPT' NOT NULL,
	"is_monthly" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"year" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"evaluation_date" date NOT NULL,
	"input_start_month" integer DEFAULT 11 NOT NULL,
	"cutoff_month" integer DEFAULT 12 NOT NULL,
	"min_tenure_months" integer DEFAULT 6 NOT NULL,
	"status" "period_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"department_id" integer NOT NULL,
	"job_level_id" integer NOT NULL,
	"total_weight" numeric(6, 4) DEFAULT '1.15' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appraisal_items" ADD CONSTRAINT "appraisal_items_appraisal_id_appraisals_id_fk" FOREIGN KEY ("appraisal_id") REFERENCES "public"."appraisals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_items" ADD CONSTRAINT "appraisal_items_parameter_id_kpi_parameters_id_fk" FOREIGN KEY ("parameter_id") REFERENCES "public"."kpi_parameters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisals" ADD CONSTRAINT "appraisals_period_id_kpi_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."kpi_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisals" ADD CONSTRAINT "appraisals_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisals" ADD CONSTRAINT "appraisals_template_id_kpi_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."kpi_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisals" ADD CONSTRAINT "appraisals_appraiser_id_employees_id_fk" FOREIGN KEY ("appraiser_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_job_level_id_job_levels_id_fk" FOREIGN KEY ("job_level_id") REFERENCES "public"."job_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_appraiser_id_employees_id_fk" FOREIGN KEY ("appraiser_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_head_dept_id_employees_id_fk" FOREIGN KEY ("head_dept_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_bands" ADD CONSTRAINT "kpi_bands_parameter_id_kpi_parameters_id_fk" FOREIGN KEY ("parameter_id") REFERENCES "public"."kpi_parameters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_categories" ADD CONSTRAINT "kpi_categories_template_id_kpi_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."kpi_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_parameters" ADD CONSTRAINT "kpi_parameters_category_id_kpi_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."kpi_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_templates" ADD CONSTRAINT "kpi_templates_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_templates" ADD CONSTRAINT "kpi_templates_job_level_id_job_levels_id_fk" FOREIGN KEY ("job_level_id") REFERENCES "public"."job_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_appraisal_param_idx" ON "appraisal_items" USING btree ("appraisal_id","parameter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appraisal_period_emp_idx" ON "appraisals" USING btree ("period_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tpl_dept_level_idx" ON "kpi_templates" USING btree ("department_id","job_level_id");
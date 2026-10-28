import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ---------- ENUMS ----------
export const inputTypeEnum = pgEnum("input_type", [
  "PERCENTAGE",
  "NUMBER",
  "CURRENCY",
  "MONTHLY_ACTUAL",
  "QUALITATIVE",
]);

// Cara menghitung nilai tahunan dari input bulanan
export const aggregationEnum = pgEnum("aggregation_method", [
  "AVERAGE",
  "SUM",
  "LAST_VALUE",
  "RATIO", // (Σ actual / Σ target) × 100
]);

// Nilai apa yang dicocokkan ke band: nilai actual langsung atau % achievement (actual/target)
export const compareBasisEnum = pgEnum("compare_basis", ["ACTUAL", "ACHIEVEMENT"]);

export const bandOperatorEnum = pgEnum("band_operator", [
  "GT",
  "GTE",
  "LT",
  "LTE",
  "EQ",
  "BETWEEN",
  "TEXT",
  "NEQ",
  "CONTAINS",
]);

export const picRoleEnum = pgEnum("pic_role", ["HEAD_DEPT", "HR", "HSE", "SUPERINTENDENT"]);

export const periodStatusEnum = pgEnum("period_status", ["DRAFT", "ACTIVE", "CLOSED"]);

// ---------- FORMULA ENGINE ENUMS ----------
export const calcTypeEnum = pgEnum("calc_type", [
  "ACHIEVEMENT",
  "AGGREGATION",
  "WEIGHTING",
  "REWARD",
]);

export const calcDirectionEnum = pgEnum("calc_direction", [
  "NORMAL",
  "INVERSE",
]);

export const ruleStatusEnum = pgEnum("rule_status", ["ACTIVE", "DEPRECATED"]);

export const inputSourceEnum = pgEnum("input_source", [
  "MANUAL_INPUT",
  "HR_ATTENDANCE",
  "INVENTORY",
  "FINANCE",
  "KPI_TEMPLATE",
]);

export const appraisalStatusEnum = pgEnum("appraisal_status", [
  "DRAFT",
  "SUBMITTED",
  "PENDING_HEAD_DEPT",
  "PENDING_MANAGER",
  "PENDING_HR",
  "REVIEWED",
  "FINAL",
  "REVISED_PENILAI",
  "REVISED_HEAD",
  "REVISED_MGR",
]);

// ---------- MASTER DATA ----------
export const systemConfig = pgTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const mappingStatusEnum = pgEnum("mapping_status", [
  "MAPPED",
  "UNMAPPED",
  "PENDING_VALIDATION",
]);

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sites = pgTable(
  "sites",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("idx_sites_code").on(t.code), index("idx_sites_is_active").on(t.isActive)]
);

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;

export const pits = pgTable(
  "pits",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    siteId: integer("site_id").references(() => sites.id, { onDelete: "restrict" }),
    site: text("site").notNull().default("GAM"), // code of the site for fallback & display
    description: text("description"), // Detail PIT
    isActive: boolean("is_active").notNull().default(true), // Status PIT
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_pits_site").on(t.site),
    index("idx_pits_site_id").on(t.siteId),
    index("idx_pits_is_active").on(t.isActive),
  ]
);

export type Pit = typeof pits.$inferSelect;
export type NewPit = typeof pits.$inferInsert;

export const departmentMappings = pgTable(
  "department_mappings",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id").references(() => sites.id, {
      onDelete: "set null",
    }),
    site: text("site").notNull().default("ALL"), // legacy/display fallback
    rawDepartmentName: text("raw_department_name").notNull(),
    cleanRawName: text("clean_raw_name").notNull(), // uppercase and single spaced for matching
    departmentId: integer("department_id").references(() => departments.id, {
      onDelete: "restrict",
    }),
    pitId: integer("pit_id").references(() => pits.id, {
      onDelete: "set null",
    }),
    originalUnitDetail: text("original_unit_detail"), // e.g. "BCM Selatan", "Mining Service"
    status: mappingStatusEnum("status").notNull().default("MAPPED"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_dept_map_site_clean_name").on(t.site, t.cleanRawName),
    index("idx_dept_map_dept_id").on(t.departmentId),
    index("idx_dept_map_site_id").on(t.siteId),
    index("idx_dept_map_pit_id").on(t.pitId),
    index("idx_dept_map_status").on(t.status),
  ]
);

export type DepartmentMapping = typeof departmentMappings.$inferSelect;
export type NewDepartmentMapping = typeof departmentMappings.$inferInsert;

export const jobLevels = pgTable("job_levels", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  rank: integer("rank").notNull().default(0),
  appraiserLevel: text("appraiser_level"),
  appraiser1: text("appraiser_1"),
  appraiser2: text("appraiser_2"),
  hierarchyStatus: text("hierarchy_status").default("Active"),
});

export const jobPositions = pgTable(
  "job_positions",
  {
    id: serial("id").primaryKey(),
    code: text("code").unique(),
    name: text("name").notNull(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "restrict" }),
    jobLevelId: integer("job_level_id")
      .notNull()
      .references(() => jobLevels.id, { onDelete: "restrict" }),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("job_positions_dept_level_idx").on(t.departmentId, t.jobLevelId)]
);

export const jobPositionSequences = pgTable("job_position_sequences", {
  departmentId: integer("department_id")
    .primaryKey()
    .references(() => departments.id, { onDelete: "cascade" }),
  lastNumber: integer("last_number").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type JobPositionSequence = typeof jobPositionSequences.$inferSelect;
export type NewJobPositionSequence = typeof jobPositionSequences.$inferInsert;

// ---------- HAK AKSES PER JOB LEVEL ----------
export const jobLevelPermissions = pgTable("job_level_permissions", {
  id: serial("id").primaryKey(),
  jobLevelId: integer("job_level_id")
    .notNull()
    .unique()
    .references(() => jobLevels.id, { onDelete: "cascade" }),
  defaultRole: text("default_role").notNull().default("KARYAWAN"), // 'ADMIN' | 'HR' | 'HEAD_DEPT' | 'MANAGER' | 'PENILAI' | 'KARYAWAN'
  canAccessMasterData: boolean("can_access_master_data").notNull().default(false),
  canAccessMasterParam: boolean("can_access_master_param").notNull().default(false),
  canAccessTemplate: boolean("can_access_template").notNull().default(false),
  canAccessAssignment: boolean("can_access_assignment").notNull().default(false),
  canAccessInputAssessment: boolean("can_access_input_assessment").notNull().default(true),
  canAccessReviewAssessment: boolean("can_access_review_assessment").notNull().default(false),
  canAccessApprovalAssessment: boolean("can_access_approval_assessment").notNull().default(false),
  canAccessReports: boolean("can_access_reports").notNull().default(false),
  departmentScope: text("department_scope").notNull().default("SELF_ONLY"), // 'ALL' | 'OWN_DEPT' | 'CUSTOM' | 'SELF_ONLY'
  levelScope: text("level_scope").notNull().default("SELF_ONLY"), // 'ALL' | 'SUBORDINATES' | 'SAME_AND_BELOW' | 'SELF_ONLY' | 'CUSTOM'
  customDepartmentIds: jsonb("custom_department_ids").$type<number[]>().default([]),
  customJobLevelIds: jsonb("custom_job_level_ids").$type<number[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type JobLevelPermission = typeof jobLevelPermissions.$inferSelect;
export type NewJobLevelPermission = typeof jobLevelPermissions.$inferInsert;

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  nik: text("nik").notNull().unique(),
  name: text("name").notNull(),
  departmentId: integer("department_id")
    .notNull()
    .references(() => departments.id),
  jobLevelId: integer("job_level_id")
    .notNull()
    .references(() => jobLevels.id),
  jobPositionId: integer("job_position_id").references(() => jobPositions.id, { onDelete: "set null" }),
  jobPosition: text("job_position").notNull(),
  operatingUnit: text("operating_unit").default("HO"),
  originalDepartment: text("original_department"),
  dateOfHire: date("date_of_hire"),
  appraiserId: integer("appraiser_id").references((): AnyPgColumn => employees.id),
  headDeptId: integer("head_dept_id").references((): AnyPgColumn => employees.id),
  managerId: integer("manager_id").references((): AnyPgColumn => employees.id),
  role: text("role").notNull().default("KARYAWAN"), // 'ADMIN' | 'HR' | 'MANAGER' | 'HEAD_DEPT' | 'PENILAI' | 'KARYAWAN'
  isCustomRole: boolean("is_custom_role").notNull().default(false),
  customPermissions: jsonb("custom_permissions").$type<string[]>().default([]),
  password: text("password"),
  polaPenggajian: text("pola_penggajian").default("All In"),
  pitId: integer("pit_id").references(() => pits.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const departmentHeads = pgTable(
  "department_heads",
  {
    id: serial("id").primaryKey(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    operatingUnit: text("operating_unit").notNull().default("HO"),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("Active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_dept_heads_dept").on(t.departmentId),
    index("idx_dept_heads_emp").on(t.employeeId),
    index("idx_dept_heads_ou").on(t.operatingUnit),
  ]
);

export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(),
  permissionCode: text("permission_code").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type RolePermission = typeof rolePermissions.$inferSelect;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  nik: text("nik").notNull().unique(),
  password: text("password").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kpiPeriods = pgTable("kpi_periods", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  year: integer("year").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  evaluationDate: date("evaluation_date").notNull(),
  inputStartMonth: integer("input_start_month").notNull().default(11),
  cutoffMonth: integer("cutoff_month").notNull().default(12),
  minTenureMonths: integer("min_tenure_months").notNull().default(6),
  status: periodStatusEnum("status").notNull().default("DRAFT"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- MASTER PARAMETERS (KAMUS INDIKATOR KPI) ----------
export const masterParameters = pgTable("master_parameters", {
  id: serial("id").primaryKey(),
  code: text("code").unique(),
  name: text("name").notNull(),
  description: text("description"),
  departmentId: integer("department_id").references(() => departments.id, { onDelete: "set null" }), // null = UMUM / CORPORATE
  categoryName: text("category_name"), // e.g. "Target Kerja", "Kehadiran & Disiplin"
  unit: text("unit").default("%"),
  inputType: inputTypeEnum("input_type").notNull().default("PERCENTAGE"),
  aggregation: aggregationEnum("aggregation").notNull().default("AVERAGE"),
  compareBasis: compareBasisEnum("compare_basis").notNull().default("ACTUAL"),
  picRole: picRoleEnum("pic_role").notNull().default("HEAD_DEPT"),
  defaultBands: jsonb("default_bands").$type<
    Array<{
      score: number;
      label: string;
      operator: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT";
      minValue?: number | null;
      maxValue?: number | null;
    }>
  >(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Bobot masing-masing parameter untuk setiap job level dalam departemen
export const jobLevelParameterWeights = pgTable(
  "job_level_parameter_weights",
  {
    id: serial("id").primaryKey(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    jobLevelId: integer("job_level_id")
      .notNull()
      .references(() => jobLevels.id, { onDelete: "cascade" }),
    masterParameterId: integer("master_parameter_id")
      .notNull()
      .references(() => masterParameters.id, { onDelete: "cascade" }),
    weight: numeric("weight", { precision: 6, scale: 4 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uniq_dept_level_param_weight").on(
      t.departmentId,
      t.jobLevelId,
      t.masterParameterId
    ),
    index("idx_param_weights_dept_level").on(t.departmentId, t.jobLevelId),
  ]
);

export type JobLevelParameterWeight = typeof jobLevelParameterWeights.$inferSelect;
export type NewJobLevelParameterWeight = typeof jobLevelParameterWeights.$inferInsert;

// ---------- KPI FORMULA ENGINE ----------
export const kpiCalculationRules = pgTable(
  "kpi_calculation_rules",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),        // e.g. "ACH-NORMAL-V1"
    name: text("name").notNull(),
    description: text("description"),
    calculationType: calcTypeEnum("calculation_type").notNull(),
    direction: calcDirectionEnum("direction"),     // null for non-Achievement types
    aggregationMethod: aggregationEnum("aggregation_method"), // null for non-Aggregation types
    formulaConfig: jsonb("formula_config").$type<{
      type: string;
      direction?: string;
      numerator?: string;
      denominator?: string;
      multiplier?: number;
      output: string;
      edgeCases?: Record<string, string>;
    }>(),
    inputSources: jsonb("input_sources").$type<{
      actual?: string;
      target?: string;
      employee?: string;
      period?: string;
    }>().default({ actual: "MANUAL_INPUT", target: "KPI_TEMPLATE" }),
    version: integer("version").notNull().default(1),
    effectiveDate: date("effective_date").notNull(),
    expiresDate: date("expires_date"),             // null = masih aktif
    status: ruleStatusEnum("status").notNull().default("ACTIVE"),
    notes: text("notes"),
    createdBy: text("created_by").default("system"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_calc_rule_code").on(t.code),
    index("idx_calc_rule_type_status").on(t.calculationType, t.status),
  ]
);

// ---------- TEMPLATE (Level 1-4) ----------
export const kpiTemplates = pgTable(
  "kpi_templates",
  {
    id: serial("id").primaryKey(),
    code: text("code").unique(),
    name: text("name").notNull(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id),
    jobLevelId: integer("job_level_id")
      .notNull()
      .references(() => jobLevels.id),
    jobPositionId: integer("job_position_id").references(() => jobPositions.id, {
      onDelete: "set null",
    }),
    periodId: integer("period_id").references(() => kpiPeriods.id, {
      onDelete: "set null",
    }),
    effectiveDate: date("effective_date"),
    description: text("description"),
    siteId: integer("site_id").references(() => sites.id, { onDelete: "set null" }),
    site: text("site"), // legacy / display string
    pitId: integer("pit_id").references(() => pits.id, { onDelete: "set null" }),
    departmentMappingId: integer("department_mapping_id").references(() => departmentMappings.id, { onDelete: "set null" }),
    totalWeight: numeric("total_weight", { precision: 6, scale: 4 }).notNull().default("1.15"),
    version: integer("version").notNull().default(1),
    employeeId: integer("employee_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    baseTemplateId: integer("base_template_id").references((): AnyPgColumn => kpiTemplates.id, { onDelete: "set null" }),
    isCustom: boolean("is_custom").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("tpl_dept_level_idx").on(t.departmentId, t.jobLevelId),
    index("idx_kpi_tpl_pit_id").on(t.pitId),
    index("idx_kpi_tpl_site_id").on(t.siteId),
    index("idx_kpi_tpl_site").on(t.site),
    index("idx_kpi_tpl_employee_id").on(t.employeeId),
    index("idx_kpi_tpl_is_custom").on(t.isCustom),
  ]
);

export const kpiCategories = pgTable("kpi_categories", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id")
    .notNull()
    .references(() => kpiTemplates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  weight: numeric("weight", { precision: 6, scale: 4 }).notNull(), // 0.65 = 65%
  categoryType: text("category_type").notNull().default("SUB_ITEMS"), // 'DIRECT' | 'SUB_ITEMS'
  sortOrder: integer("sort_order").notNull().default(0),
});

export const kpiParameters = pgTable("kpi_parameters", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => kpiCategories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  weight: numeric("weight", { precision: 6, scale: 4 }).notNull(), // bobot dalam kategori
  maxScore: numeric("max_score", { precision: 8, scale: 2 }).notNull().default("25"),
  inputType: inputTypeEnum("input_type").notNull().default("NUMBER"),
  aggregation: aggregationEnum("aggregation").notNull().default("AVERAGE"),
  compareBasis: compareBasisEnum("compare_basis").notNull().default("ACTUAL"),
  unit: text("unit"),
  target: text("target"),
  picRole: picRoleEnum("pic_role").notNull().default("HEAD_DEPT"),
  isMonthly: boolean("is_monthly").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  parentParameterId: integer("parent_parameter_id").references((): AnyPgColumn => kpiParameters.id, { onDelete: "cascade" }),
  masterParameterId: integer("master_parameter_id").references(() => masterParameters.id, { onDelete: "set null" }),
  // Formula Engine: nullable, fallback ke scoring.ts jika null
  calculationRuleId: integer("calculation_rule_id").references(() => kpiCalculationRules.id, { onDelete: "set null" }),
  // KPI Configuration Integration
  measurementType: text("measurement_type"),
  direction: text("direction"),
  scoringMethod: text("scoring_method"),
});

export const kpiBands = pgTable("kpi_bands", {
  id: serial("id").primaryKey(),
  parameterId: integer("parameter_id")
    .notNull()
    .references(() => kpiParameters.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  operator: bandOperatorEnum("operator").notNull(),
  minValue: numeric("min_value", { precision: 20, scale: 4 }),
  maxValue: numeric("max_value", { precision: 20, scale: 4 }),
  score: numeric("score", { precision: 8, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ---------- PENILAIAN ----------
export const appraisals = pgTable(
  "appraisals",
  {
    id: serial("id").primaryKey(),
    periodId: integer("period_id")
      .notNull()
      .references(() => kpiPeriods.id),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    templateId: integer("template_id").references(() => kpiTemplates.id, { onDelete: "set null" }),
    appraiserId: integer("appraiser_id").references(() => employees.id),
    tenureMonths: integer("tenure_months").notNull().default(0),
    isEligible: boolean("is_eligible").notNull().default(true),
    status: appraisalStatusEnum("status").notNull().default("DRAFT"),
    finalScore: numeric("final_score", { precision: 8, scale: 4 }),
    notes: text("notes"),
    submittedAt: timestamp("submitted_at"),
    reviewedAt: timestamp("reviewed_at"),
    finalizedAt: timestamp("finalized_at"),

    // Tracking Persetujuan Berjenjang (Penilai -> Head Dept -> Manager -> HR)
    headDeptId: integer("head_dept_id").references((): AnyPgColumn => employees.id),
    headDeptApprovedAt: timestamp("head_dept_approved_at"),
    headDeptApprovedById: integer("head_dept_approved_by_id").references((): AnyPgColumn => employees.id),
    headDeptNotes: text("head_dept_notes"),

    managerId: integer("manager_id").references((): AnyPgColumn => employees.id),
    managerValidatedAt: timestamp("manager_validated_at"),
    managerValidatedById: integer("manager_validated_by_id").references((): AnyPgColumn => employees.id),
    managerNotes: text("manager_notes"),

    hrApprovedAt: timestamp("hr_approved_at"),
    hrApprovedById: integer("hr_approved_by_id").references((): AnyPgColumn => employees.id),
    hrNotes: text("hr_notes"),

    currentStage: text("current_stage").default("PENILAI"), // 'PENILAI' | 'HEAD_DEPT' | 'MANAGER' | 'HR' | 'FINAL'
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("appraisal_period_emp_idx").on(t.periodId, t.employeeId)]
);

export const appraisalItems = pgTable(
  "appraisal_items",
  {
    id: serial("id").primaryKey(),
    appraisalId: integer("appraisal_id")
      .notNull()
      .references(() => appraisals.id, { onDelete: "cascade" }),
    parameterId: integer("parameter_id")
      .references(() => kpiParameters.id, { onDelete: "set null" }),
    isCustom: boolean("is_custom").default(false),
    customCategoryName: text("custom_category_name"),
    target: text("target"),
    actual: numeric("actual", { precision: 20, scale: 4 }),
    monthlyTargets: jsonb("monthly_targets").$type<(number | null)[]>(),
    monthlyActuals: jsonb("monthly_actuals").$type<(number | null)[]>(),
    monthlyNotes: jsonb("monthly_notes").$type<(string | null)[]>(),
    qualitativeValue: text("qualitative_value"),
    // hasil perhitungan
    annualActual: numeric("annual_actual", { precision: 20, scale: 4 }),
    achievement: numeric("achievement", { precision: 12, scale: 4 }),
    bandLabel: text("band_label"),
    score: numeric("score", { precision: 8, scale: 2 }),
    weightedScore: numeric("weighted_score", { precision: 8, scale: 4 }),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),

    // Snapshot fields (Historically safe snapshot dari master KPI saat appraisal dibuat)
    indicatorNameSnapshot: text("indicator_name_snapshot"),
    indicatorDescriptionSnapshot: text("indicator_description_snapshot"),
    targetSnapshot: text("target_snapshot"),
    unitSnapshot: text("unit_snapshot"),
    weightSnapshot: numeric("weight_snapshot", { precision: 6, scale: 4 }), // bobot indikator dalam parameter
    parameterWeightSnapshot: numeric("parameter_weight_snapshot", { precision: 6, scale: 4 }), // bobot parameter dalam kategori
    scoringRulesSnapshot: jsonb("scoring_rules_snapshot").$type<{
      label: string;
      operator: string;
      minValue: number | null;
      maxValue: number | null;
      score: number;
    }[]>(),
    snapshotSource: text("snapshot_source").default("SYSTEM"), // 'SYSTEM' | 'MIGRATED'
    isSnapshotLocked: boolean("is_snapshot_locked").default(true),

    // Granular parameter revision flagging
    isRevisionFlagged: boolean("is_revision_flagged").default(false),
    revisionNote: text("revision_note"),
  },
  (t) => [uniqueIndex("item_appraisal_param_idx").on(t.appraisalId, t.parameterId)]
);

export const monthlyStatusEnum = pgEnum("monthly_status", [
  "NOT_STARTED",
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
]);

// ---------- TRANSAKSI BULANAN (1..12) ----------
export const appraisalMonthlyValues = pgTable(
  "appraisal_monthly_values",
  {
    id: serial("id").primaryKey(),
    appraisalItemId: integer("appraisal_item_id")
      .notNull()
      .references(() => appraisalItems.id, { onDelete: "cascade" }),
    month: integer("month").notNull(), // 1..12
    actualValue: numeric("actual_value", { precision: 20, scale: 4 }),
    score: numeric("score", { precision: 8, scale: 2 }),
    finalScore: numeric("final_score", { precision: 8, scale: 4 }),
    notes: text("notes"),
    status: text("status").notNull().default("NOT_STARTED"), // 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED' | 'APPROVED'
    updatedBy: text("updated_by").default("system"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_appraisal_item_month").on(t.appraisalItemId, t.month),
    index("idx_monthly_item").on(t.appraisalItemId),
    index("idx_monthly_month").on(t.month),
  ]
);

// ---------- CALCULATION TRACE LOG (Formula Engine) ----------
export const appraisalCalculationLogs = pgTable(
  "appraisal_calculation_logs",
  {
    id: serial("id").primaryKey(),
    appraisalItemId: integer("appraisal_item_id")
      .notNull()
      .references(() => appraisalItems.id, { onDelete: "cascade" }),
    appraisalMonthlyValueId: integer("appraisal_monthly_value_id")
      .references(() => appraisalMonthlyValues.id, { onDelete: "cascade" }),
    month: integer("month"),                         // 1..12; null = annual
    periodYear: integer("period_year").notNull(),

    calculationRuleId: integer("calculation_rule_id")
      .references(() => kpiCalculationRules.id, { onDelete: "set null" }),
    calculationRuleCode: text("calculation_rule_code"), // snapshot code saat dihitung

    // Input snapshot
    target: numeric("target", { precision: 20, scale: 4 }),
    actual: numeric("actual", { precision: 20, scale: 4 }),
    indicatorWeight: numeric("indicator_weight", { precision: 6, scale: 4 }),
    categoryWeight: numeric("category_weight", { precision: 6, scale: 4 }),
    maxScore: numeric("max_score", { precision: 8, scale: 2 }),

    // Hasil per tahap
    achievementPct: numeric("achievement_pct", { precision: 10, scale: 4 }),
    matchedBandLabel: text("matched_band_label"),
    score: numeric("score", { precision: 8, scale: 2 }),
    finalScoreFraction: numeric("final_score_fraction", { precision: 10, scale: 6 }),
    finalScorePct: numeric("final_score_pct", { precision: 8, scale: 4 }),

    // Full trace untuk display di UI
    traceJson: jsonb("trace_json").$type<{
      steps: Array<{
        label: string;
        formula: string;
        result: string | number;
      }>;
    }>(),

    calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
    calculatedBy: text("calculated_by").default("system"),
  },
  (t) => [
    index("idx_calc_log_item").on(t.appraisalItemId),
    index("idx_calc_log_month").on(t.appraisalItemId, t.month),
    index("idx_calc_log_year").on(t.periodYear),
  ]
);

// ---------- AUDIT TRAIL LOG APPROVAL BERJENJANG ----------
export const appraisalApprovalLogs = pgTable(
  "appraisal_approval_logs",
  {
    id: serial("id").primaryKey(),
    appraisalId: integer("appraisal_id")
      .notNull()
      .references(() => appraisals.id, { onDelete: "cascade" }),
    action: text("action").notNull(), // 'SUBMIT_TO_HEAD' | 'VALIDATE_TO_MGR' | 'VALIDATE_TO_HR' | 'APPROVE_FINAL' | 'REJECT_TO_MGR' | 'REJECT_TO_HEAD' | 'REJECT_TO_PENILAI'
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    stage: text("stage").notNull(), // 'PENILAI' | 'HEAD_DEPT' | 'MANAGER' | 'HR' | 'FINAL'
    actorId: integer("actor_id").references((): AnyPgColumn => employees.id),
    actorName: text("actor_name").notNull(),
    actorRole: text("actor_role").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("appraisal_logs_appraisal_idx").on(t.appraisalId)]
);

// ---------- AUDIT TRAIL ----------
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  action: text("action").notNull(),
  actor: text("actor").notNull().default("system"),
  changes: jsonb("changes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const appraisalEvidence = pgTable(
  "appraisal_evidence",
  {
    id: serial("id").primaryKey(),
    appraisalId: integer("appraisal_id")
      .notNull()
      .references(() => appraisals.id, { onDelete: "cascade" }),
    parameterId: integer("parameter_id")
      .notNull()
      .references(() => kpiParameters.id, { onDelete: "cascade" }),
    month: integer("month"), // 1..12, null if general parameter evidence
    fileType: text("file_type").notNull(), // 'EXCEL_DATA' | 'ATTACHMENT'
    fileName: text("file_name").notNull(),
    filePath: text("file_path").notNull(),
    fileSize: integer("file_size"),
    mimeType: text("mime_type"),
    extractedValue: numeric("extracted_value", { precision: 20, scale: 4 }),
    extractedData: jsonb("extracted_data").$type<Record<string, any>>(),
    matchStatus: text("match_status"), // 'MATCH' | 'MISMATCH' | 'NEW' | 'PENDING'
    description: text("description"),
    uploadedBy: text("uploaded_by").default("system"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("evidence_appraisal_param_idx").on(t.appraisalId, t.parameterId),
    index("evidence_month_idx").on(t.appraisalId, t.parameterId, t.month),
  ]
);

// ---------- ASSESSOR ASSIGNMENTS (Many-to-Many & Cascading Scope on Parameter KPI) ----------
export const kpiAssessorAssignments = pgTable(
  "kpi_assessor_assignments",
  {
    id: serial("id").primaryKey(),
    periodId: integer("period_id")
      .notNull()
      .references(() => kpiPeriods.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => kpiCategories.id, { onDelete: "cascade" }),
    assessorDeptId: integer("assessor_dept_id").references(() => departments.id, { onDelete: "set null" }),
    assessorEmployeeId: integer("assessor_employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    scopeType: text("scope_type").notNull().default("DEPARTMENT"), // 'INDIVIDUAL' | 'DEPARTMENT' | 'GLOBAL'
    targetEmployeeId: integer("target_employee_id").references(() => employees.id, { onDelete: "cascade" }),
    targetDepartmentId: integer("target_department_id").references(() => departments.id, { onDelete: "cascade" }),
    notes: text("notes"),
    roleAssessor: text("role_assessor").default("SPECIAL_ASSESSOR"), // 'APPRAISER' | 'HEAD_DEPT' | 'MANAGER' | 'SPECIAL_ASSESSOR'
    stage: text("stage").default("PENILAI"), // 'PENILAI' | 'HEAD_DEPT' | 'MANAGER' | 'HR'
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by").references((): AnyPgColumn => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_assessor_assign_p1").on(t.periodId, t.categoryId, t.targetEmployeeId),
    index("idx_assessor_assign_p2").on(t.periodId, t.categoryId, t.assessorDeptId),
    index("idx_assessor_assign_p3").on(t.periodId, t.categoryId, t.scopeType),
    index("idx_assessor_assign_lookup").on(t.assessorEmployeeId, t.periodId),
  ]
);

// ---------- ASSESSOR DELEGATIONS (Admin Delegation Feature) ----------
export const kpiAssessorDelegations = pgTable(
  "kpi_assessor_delegations",
  {
    id: serial("id").primaryKey(),
    periodId: integer("period_id")
      .notNull()
      .references(() => kpiPeriods.id, { onDelete: "cascade" }),
    delegatorEmployeeId: integer("delegator_employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    delegateeEmployeeId: integer("delegatee_employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    reason: text("reason").notNull(),
    scopeType: text("scope_type").notNull().default("ALL"), // 'ALL' | 'DEPARTMENT' | 'PARAMETER'
    departmentId: integer("department_id").references(() => departments.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => kpiCategories.id, { onDelete: "cascade" }),
    stage: text("stage").default("PENILAI"), // 'PENILAI' | 'HEAD_DEPT' | 'MANAGER' | 'HR'
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by").references((): AnyPgColumn => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_delegation_delegatee").on(t.delegateeEmployeeId, t.startDate, t.endDate),
    index("idx_delegation_delegator").on(t.delegatorEmployeeId, t.startDate, t.endDate),
    index("idx_delegation_period").on(t.periodId),
  ]
);

export type Employee = typeof employees.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type DepartmentHead = typeof departmentHeads.$inferSelect;
export type NewDepartmentHead = typeof departmentHeads.$inferInsert;
export type JobLevel = typeof jobLevels.$inferSelect;
export type JobPosition = typeof jobPositions.$inferSelect;
export type NewJobPosition = typeof jobPositions.$inferInsert;
export type MasterParameter = typeof masterParameters.$inferSelect;
export type NewMasterParameter = typeof masterParameters.$inferInsert;
export type KpiPeriod = typeof kpiPeriods.$inferSelect;
export type KpiTemplate = typeof kpiTemplates.$inferSelect;
export type KpiCategory = typeof kpiCategories.$inferSelect;
export type KpiParameter = typeof kpiParameters.$inferSelect;
export type KpiBand = typeof kpiBands.$inferSelect;
export type Appraisal = typeof appraisals.$inferSelect;
export type AppraisalItem = typeof appraisalItems.$inferSelect;
export type AppraisalEvidence = typeof appraisalEvidence.$inferSelect;
export type NewAppraisalEvidence = typeof appraisalEvidence.$inferInsert;
export type AppraisalMonthlyValue = typeof appraisalMonthlyValues.$inferSelect;
export type NewAppraisalMonthlyValue = typeof appraisalMonthlyValues.$inferInsert;
export type KpiAssessorAssignment = typeof kpiAssessorAssignments.$inferSelect;
export type NewKpiAssessorAssignment = typeof kpiAssessorAssignments.$inferInsert;
export type KpiAssessorDelegation = typeof kpiAssessorDelegations.$inferSelect;
export type NewKpiAssessorDelegation = typeof kpiAssessorDelegations.$inferInsert;

// ---------- KPI CONFIGURATION MODULE ----------
export const kpiMeasurementTypes = pgTable("kpi_measurement_types", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // 'NUMBER' | 'PERCENTAGE' | 'CURRENCY' | 'COUNT' | 'DAYS' | 'RATIO' | 'BOOLEAN' | 'RATING' | 'TEXT'
  name: text("name").notNull(),
  description: text("description"),
  formatPattern: text("format_pattern"), // e.g. '#,##0.00', 'Rp #,##0', '0.0%'
  defaultUnit: text("default_unit"), // e.g. '%', 'IDR', 'Hari', 'Unit'
  isNumeric: boolean("is_numeric").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kpiDirections = pgTable("kpi_directions", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'EXACT_TARGET' | 'TARGET_RANGE'
  name: text("name").notNull(),
  description: text("description"),
  formulaHint: text("formula_hint"), // Hint formula perhitungan achievement
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kpiScoringMethods = pgTable("kpi_scoring_methods", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // 'CRITERIA_BASED' | 'FORMULA_BASED' | 'DIRECT_SCORE' | 'RATING_BASED'
  name: text("name").notNull(),
  description: text("description"),
  requiresBands: boolean("requires_bands").notNull().default(false),
  requiresFormula: boolean("requires_formula").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type KpiMeasurementType = typeof kpiMeasurementTypes.$inferSelect;
export type NewKpiMeasurementType = typeof kpiMeasurementTypes.$inferInsert;
export type KpiDirection = typeof kpiDirections.$inferSelect;
export type NewKpiDirection = typeof kpiDirections.$inferInsert;
export type KpiScoringMethod = typeof kpiScoringMethods.$inferSelect;
export type NewKpiScoringMethod = typeof kpiScoringMethods.$inferInsert;

// Formula Engine types
export type KpiCalculationRule = typeof kpiCalculationRules.$inferSelect;
export type NewKpiCalculationRule = typeof kpiCalculationRules.$inferInsert;
export type AppraisalCalculationLog = typeof appraisalCalculationLogs.$inferSelect;
export type NewAppraisalCalculationLog = typeof appraisalCalculationLogs.$inferInsert;

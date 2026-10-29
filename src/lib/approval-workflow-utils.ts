// ============================================================================
// PURE TYPES & RESOLVER ENGINE FOR STAGING APPROVAL WORKFLOW (CLIENT & SERVER SAFE)
// ============================================================================

export type WorkflowMode =
  | "DIRECT_TO_REPORT"
  | "SINGLE_HR_VALIDATION"
  | "MULTI_STAGE";

export type ApproverBasis =
  | "HIERARCHY"
  | "NIK"
  | "ROLE"
  | "JOB_LEVEL"
  | "JOB_POSITION";

export type HierarchyRelationType = "APPRAISER" | "HEAD_DEPT" | "MANAGER";

export type StageScopeType = "OWN_DEPT" | "ALL_DEPT" | "CUSTOM_DEPT";

export type RevisionRuleType =
  | "PREVIOUS_STAGE"
  | "DIRECT_TO_PENILAI"
  | "BOTH";

export interface WorkflowStageConfig {
  id: string;
  stageKey: string; // e.g. 'HEAD_DEPT', 'MANAGER', 'HR', or 'STAGE_CUSTOM_1'
  order: number; // 1..N (after Penilai)
  name: string; // e.g. 'Head Dept', 'Manager', 'HR Approval'
  description: string; // e.g. 'Review Dept', 'Validasi Divisi'
  approverBy: ApproverBasis;
  // Config per basis:
  hierarchyRelation?: HierarchyRelationType;
  specificEmployeeId?: number | null;
  specificEmployeeNik?: string | null;
  specificEmployeeName?: string | null;
  roleCode?: string | null; // 'HEAD_DEPT' | 'MANAGER' | 'HR' | 'PENILAI' | 'ADMIN'
  jobLevelId?: number | null;
  jobPositionId?: number | null;
  // Cakupan kewenangan:
  scopeType: StageScopeType;
  customDepartmentIds?: number[];
  // Otoritas & aturan di tahap ini:
  canEditScore: boolean;
  revisionRule: RevisionRuleType;
  isMandatory: boolean;
  autoSkipIfSameAsPrevious?: boolean;
}

export interface SingleHrValidationConfig {
  validatorEmployeeId: number | null;
  validatorNik: string | null;
  validatorName: string | null;
  validatorJobPosition?: string | null;
  allowAllHrRoleFallback: boolean;
  canEditScore: boolean;
  revisionRule: RevisionRuleType;
}

export interface DirectToReportConfig {
  requireAllParametersSubmitted: boolean;
  autoLockOnSubmit: boolean;
}

export interface ApprovalWorkflowConfig {
  version: number;
  mode: WorkflowMode;
  updatedAt: string;
  updatedBy: string;
  notes?: string;
  directConfig: DirectToReportConfig;
  singleHrConfig: SingleHrValidationConfig;
  stages: WorkflowStageConfig[];
}

export interface WorkflowVersionRecord {
  id: number;
  versionNumber: number;
  mode: WorkflowMode;
  summary: string;
  configJson: ApprovalWorkflowConfig;
  publishedBy: string;
  publishedAt: string;
}

export interface ResolvedOfficialItem {
  id: number;
  nik: string;
  name: string;
  jobPosition: string;
  role: string;
  departmentId: number;
  departmentName?: string;
}

export interface ResolvedWorkflowStep {
  stepNumber: number;
  stageKey: string; // 'PENILAI' | custom stageKey | 'FINAL'
  label: string;
  description: string;
  isSystemStep: boolean; // true for 'PENILAI' and 'FINAL'
  isMandatory: boolean;
  isSkipped: boolean;
  skipReason?: string | null;
  canEditScore: boolean;
  revisionRule: RevisionRuleType;
  approverBasisLabel: string;
  scopeLabel: string;
  resolvedOfficials: ResolvedOfficialItem[];
  displayOfficialName: string;
  isDone: boolean;
  isActive: boolean;
}

export interface ResolvedAppraisalWorkflow {
  mode: WorkflowMode;
  configVersion: number;
  steps: ResolvedWorkflowStep[];
  activeStageKey: string;
  activeStageLabel: string;
  canCurrentUserApprove: boolean;
  canCurrentUserEditScore: boolean;
  currentStepConfig: ResolvedWorkflowStep | null;
  nextStep: ResolvedWorkflowStep | null;
  prevStepForRevision: ResolvedWorkflowStep | null;
  allowChooseRevisionTarget: boolean;
}

export interface MasterResolutionContext {
  allEmployees: Array<{
    id: number;
    nik: string;
    name: string;
    departmentId: number;
    jobLevelId: number;
    jobPositionId: number | null;
    jobPosition: string;
    role: string;
    appraiserId: number | null;
    headDeptId: number | null;
    managerId: number | null;
    isActive: boolean;
  }>;
  allDepartments: Array<{ id: number; code: string; name: string }>;
  allJobLevels: Array<{ id: number; code: string; name: string; rank: number }>;
  allJobPositions: Array<{
    id: number;
    code: string | null;
    name: string;
    departmentId: number;
    jobLevelId: number;
  }>;
  allDeptHeads: Array<{
    departmentId: number;
    employeeId: number;
    status: string;
  }>;
}

export function getDefaultApprovalWorkflowConfig(): ApprovalWorkflowConfig {
  return {
    version: 1,
    mode: "MULTI_STAGE",
    updatedAt: new Date().toISOString(),
    updatedBy: "System Default",
    notes: "Konfigurasi standar persetujuan berjenjang (Head Dept -> Manager -> HR)",
    directConfig: {
      requireAllParametersSubmitted: true,
      autoLockOnSubmit: true,
    },
    singleHrConfig: {
      validatorEmployeeId: null,
      validatorNik: null,
      validatorName: "Pejabat HR Validator",
      validatorJobPosition: "HR Department",
      allowAllHrRoleFallback: true,
      canEditScore: false,
      revisionRule: "DIRECT_TO_PENILAI",
    },
    stages: [
      {
        id: "stage-head-dept",
        stageKey: "HEAD_DEPT",
        order: 1,
        name: "Head Dept",
        description: "Review Dept",
        approverBy: "HIERARCHY",
        hierarchyRelation: "HEAD_DEPT",
        roleCode: "HEAD_DEPT",
        scopeType: "OWN_DEPT",
        customDepartmentIds: [],
        canEditScore: false,
        revisionRule: "DIRECT_TO_PENILAI",
        isMandatory: true,
        autoSkipIfSameAsPrevious: false,
      },
      {
        id: "stage-manager",
        stageKey: "MANAGER",
        order: 2,
        name: "Manager",
        description: "Validasi Divisi",
        approverBy: "HIERARCHY",
        hierarchyRelation: "MANAGER",
        roleCode: "MANAGER",
        scopeType: "OWN_DEPT",
        customDepartmentIds: [],
        canEditScore: false,
        revisionRule: "PREVIOUS_STAGE",
        isMandatory: true,
        autoSkipIfSameAsPrevious: false,
      },
      {
        id: "stage-hr",
        stageKey: "HR",
        order: 3,
        name: "HR Approval",
        description: "Persetujuan Akhir",
        approverBy: "ROLE",
        roleCode: "HR",
        scopeType: "ALL_DEPT",
        customDepartmentIds: [],
        canEditScore: false,
        revisionRule: "PREVIOUS_STAGE",
        isMandatory: true,
        autoSkipIfSameAsPrevious: false,
      },
    ],
  };
}

export function summarizeWorkflowConfig(cfg: ApprovalWorkflowConfig): string {
  if (cfg.mode === "DIRECT_TO_REPORT") {
    return "Mode: Langsung ke Report (Tanpa Approval)";
  }
  if (cfg.mode === "SINGLE_HR_VALIDATION") {
    const validatorLabel = cfg.singleHrConfig.validatorNik
      ? `${cfg.singleHrConfig.validatorNik} - ${cfg.singleHrConfig.validatorName || "HR"}`
      : "Role HR (Seluruh Departemen)";
    return `Mode: Validasi HR Tunggal (${validatorLabel})`;
  }
  const stageNames = (cfg.stages || [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => s.name)
    .join(" -> ");
  return `Mode: Berjenjang (${(cfg.stages || []).length} Tahap: ${stageNames || "-"})`;
}

export function validateWorkflowConfigInput(cfg: ApprovalWorkflowConfig): {
  valid: boolean;
  error?: string;
  normalized: ApprovalWorkflowConfig;
} {
  if (!cfg || !["DIRECT_TO_REPORT", "SINGLE_HR_VALIDATION", "MULTI_STAGE"].includes(cfg.mode)) {
    return {
      valid: false,
      error: "Mode workflow tidak valid.",
      normalized: getDefaultApprovalWorkflowConfig(),
    };
  }

  if (cfg.mode === "SINGLE_HR_VALIDATION") {
    if (!cfg.singleHrConfig?.validatorEmployeeId && !cfg.singleHrConfig?.allowAllHrRoleFallback) {
      return {
        valid: false,
        error: "Pada mode Validasi HR, pilih pejabat HR berdasarkan NIK atau aktifkan fallback Role HR.",
        normalized: cfg,
      };
    }
  }

  const normalizedStages: WorkflowStageConfig[] = (cfg.stages || []).map((st, idx) => {
    const cleanName = (st.name || `Tahap ${idx + 1}`).trim();
    const rawKey = (st.stageKey || cleanName.toUpperCase().replace(/[^A-Z0-9]+/g, "_")).trim();
    return {
      ...st,
      id: st.id || `stage-${idx + 1}-${Date.now()}`,
      stageKey: rawKey || `STAGE_${idx + 1}`,
      order: idx + 1,
      name: cleanName,
      description: (st.description || `Tahap ${idx + 1}`).trim(),
      approverBy: st.approverBy || "HIERARCHY",
      scopeType: st.scopeType || "OWN_DEPT",
      customDepartmentIds: Array.isArray(st.customDepartmentIds) ? st.customDepartmentIds : [],
      canEditScore: Boolean(st.canEditScore),
      revisionRule: st.revisionRule || "PREVIOUS_STAGE",
      isMandatory: st.isMandatory !== false,
      autoSkipIfSameAsPrevious: Boolean(st.autoSkipIfSameAsPrevious),
    };
  });

  if (cfg.mode === "MULTI_STAGE" && normalizedStages.length === 0) {
    return {
      valid: false,
      error: "Pada mode Persetujuan Berjenjang, harus terdapat minimal 1 tahap persetujuan.",
      normalized: cfg,
    };
  }

  return {
    valid: true,
    normalized: {
      ...cfg,
      stages: normalizedStages,
    },
  };
}

function resolveStageApproversFromContext(params: {
  stage: WorkflowStageConfig;
  targetEmployee: MasterResolutionContext["allEmployees"][0];
  context: MasterResolutionContext;
}): {
  officials: ResolvedOfficialItem[];
  basisLabel: string;
  scopeLabel: string;
} {
  const { stage, targetEmployee, context } = params;
  const deptMap = new Map(context.allDepartments.map((d) => [d.id, d.name]));
  const activeEmps = context.allEmployees.filter((e) => e.isActive);

  const toOfficial = (e: MasterResolutionContext["allEmployees"][0]): ResolvedOfficialItem => ({
    id: e.id,
    nik: e.nik,
    name: e.name,
    jobPosition: e.jobPosition,
    role: e.role,
    departmentId: e.departmentId,
    departmentName: deptMap.get(e.departmentId) || "-",
  });

  const matchesScope = (candidateDeptId: number): boolean => {
    if (stage.scopeType === "ALL_DEPT") return true;
    if (stage.scopeType === "CUSTOM_DEPT") {
      return (stage.customDepartmentIds || []).includes(candidateDeptId);
    }
    return candidateDeptId === targetEmployee.departmentId;
  };

  const scopeLabel =
    stage.scopeType === "ALL_DEPT"
      ? "Seluruh Departemen"
      : stage.scopeType === "CUSTOM_DEPT"
      ? `Departemen Terpilih (${(stage.customDepartmentIds || []).length})`
      : `Departemen Karyawan (${deptMap.get(targetEmployee.departmentId) || "Own Dept"})`;

  let matched: ResolvedOfficialItem[] = [];
  let basisLabel = "";

  if (stage.approverBy === "NIK") {
    const found = activeEmps.find(
      (e) =>
        (stage.specificEmployeeId && e.id === stage.specificEmployeeId) ||
        (stage.specificEmployeeNik && e.nik === stage.specificEmployeeNik)
    );
    if (found) matched = [toOfficial(found)];
    basisLabel = found
      ? `NIK: ${found.nik} (${found.name})`
      : `NIK Spesifik (${stage.specificEmployeeNik || "-"})`;
  } else if (stage.approverBy === "HIERARCHY") {
    const rel = stage.hierarchyRelation || "HEAD_DEPT";
    const relId =
      rel === "APPRAISER"
        ? targetEmployee.appraiserId
        : rel === "MANAGER"
        ? targetEmployee.managerId
        : targetEmployee.headDeptId;

    if (relId) {
      const direct = activeEmps.find((e) => e.id === relId);
      if (direct) matched.push(toOfficial(direct));
    }

    if (matched.length === 0 && rel === "HEAD_DEPT") {
      const dhIds = context.allDeptHeads
        .filter((dh) => dh.departmentId === targetEmployee.departmentId && dh.status === "Active")
        .map((dh) => dh.employeeId);
      for (const id of dhIds) {
        const emp = activeEmps.find((e) => e.id === id);
        if (emp) matched.push(toOfficial(emp));
      }
    }

    if (matched.length === 0) {
      const fallbackRole =
        rel === "MANAGER" ? "MANAGER" : rel === "HEAD_DEPT" ? "HEAD_DEPT" : "PENILAI";
      const roleMatches = activeEmps.filter(
        (e) =>
          e.role === fallbackRole &&
          matchesScope(e.departmentId) &&
          e.id !== targetEmployee.id
      );
      matched.push(...roleMatches.map(toOfficial));
    }

    if (matched.length === 0) {
      const posKeywords =
        rel === "MANAGER"
          ? ["manager", "mgr", "general manager"]
          : rel === "HEAD_DEPT"
          ? ["head", "kepala", "superintendent", "supt", "koordinator", "supervisor", "spv"]
          : ["supervisor", "spv", "leader", "head"];
      const posMatches = activeEmps.filter((e) => {
        if (e.id === targetEmployee.id || !matchesScope(e.departmentId)) return false;
        const jp = (e.jobPosition || "").toLowerCase();
        return posKeywords.some((kw) => jp.includes(kw));
      });
      matched.push(...posMatches.map(toOfficial));
    }

    basisLabel =
      rel === "APPRAISER"
        ? "Hirarki: Atasan Langsung"
        : rel === "MANAGER"
        ? "Hirarki: Manager"
        : "Hirarki: Head Dept";
  } else if (stage.approverBy === "JOB_LEVEL") {
    const lvl = context.allJobLevels.find((l) => l.id === stage.jobLevelId);
    const candidates = activeEmps.filter(
      (e) =>
        stage.jobLevelId &&
        e.jobLevelId === stage.jobLevelId &&
        matchesScope(e.departmentId) &&
        e.id !== targetEmployee.id
    );
    matched = candidates.map(toOfficial);
    basisLabel = `Job Level: ${lvl?.name || "-"}`;
  } else if (stage.approverBy === "JOB_POSITION") {
    const pos = context.allJobPositions.find((p) => p.id === stage.jobPositionId);
    const candidates = activeEmps.filter(
      (e) =>
        stage.jobPositionId &&
        (e.jobPositionId === stage.jobPositionId ||
          (pos && e.jobPosition.toLowerCase() === pos.name.toLowerCase())) &&
        matchesScope(e.departmentId) &&
        e.id !== targetEmployee.id
    );
    matched = candidates.map(toOfficial);
    basisLabel = `Jabatan: ${pos?.name || "-"}`;
  } else if (stage.approverBy === "ROLE") {
    const roleTarget = (stage.roleCode || "HR").toUpperCase();
    let candidates = activeEmps.filter(
      (e) => e.role.toUpperCase() === roleTarget && matchesScope(e.departmentId)
    );
    if (candidates.length === 0 && roleTarget === "HR") {
      candidates = activeEmps.filter((e) => {
        const dName = (deptMap.get(e.departmentId) || "").toLowerCase();
        const jp = (e.jobPosition || "").toLowerCase();
        return dName.includes("hr") || dName.includes("human") || jp.includes("hr") || jp.includes("personalia");
      });
    }
    matched = candidates.map(toOfficial);
    basisLabel = `Role: ${roleTarget}`;
  }

  return {
    officials: matched,
    basisLabel,
    scopeLabel,
  };
}

export function buildResolvedWorkflowFromContext(params: {
  config: ApprovalWorkflowConfig;
  targetEmployeeId: number;
  context: MasterResolutionContext;
  appraisalStatus?: string | null;
  currentStageKey?: string | null;
  currentUser?: { id: number; role: string; departmentId?: number } | null;
}): ResolvedAppraisalWorkflow {
  const {
    config,
    targetEmployeeId,
    context,
    appraisalStatus = "DRAFT",
    currentStageKey = "PENILAI",
    currentUser = null,
  } = params;

  const statusUpper = (appraisalStatus || "DRAFT").toUpperCase();
  const isFinalStatus = statusUpper === "FINAL";
  const stageUpper = isFinalStatus ? "FINAL" : (currentStageKey || "PENILAI").toUpperCase();

  const targetEmp =
    context.allEmployees.find((e) => e.id === targetEmployeeId) ||
    context.allEmployees[0] || {
      id: targetEmployeeId,
      nik: "-",
      name: "Karyawan",
      departmentId: 1,
      jobLevelId: 1,
      jobPositionId: null,
      jobPosition: "-",
      role: "KARYAWAN",
      appraiserId: null,
      headDeptId: null,
      managerId: null,
      isActive: true,
    };

  const deptMap = new Map(context.allDepartments.map((d) => [d.id, d.name]));
  const appraiserEmp = targetEmp.appraiserId
    ? context.allEmployees.find((e) => e.id === targetEmp.appraiserId)
    : null;

  const steps: ResolvedWorkflowStep[] = [];

  // 1. Step Pertama selalu PENILAI (Input & Submit)
  const penilaiOfficials: ResolvedOfficialItem[] = appraiserEmp
    ? [
        {
          id: appraiserEmp.id,
          nik: appraiserEmp.nik,
          name: appraiserEmp.name,
          jobPosition: appraiserEmp.jobPosition,
          role: appraiserEmp.role,
          departmentId: appraiserEmp.departmentId,
          departmentName: deptMap.get(appraiserEmp.departmentId) || "-",
        },
      ]
    : [];

  steps.push({
    stepNumber: 1,
    stageKey: "PENILAI",
    label: "Penilai",
    description: "Input & Submit",
    isSystemStep: true,
    isMandatory: true,
    isSkipped: false,
    canEditScore: true,
    revisionRule: "DIRECT_TO_PENILAI",
    approverBasisLabel: "Penilai",
    scopeLabel: deptMap.get(targetEmp.departmentId) || "Departemen Karyawan",
    resolvedOfficials: penilaiOfficials,
    displayOfficialName: appraiserEmp ? appraiserEmp.name : "",
    isDone: false,
    isActive: false,
  });

  // 2. Intermediate Steps sesuai Mode Workflow
  if (config.mode === "DIRECT_TO_REPORT") {
    // Langsung dari Penilai ke Final (Report)
  } else if (config.mode === "SINGLE_HR_VALIDATION") {
    const hrCfg = config.singleHrConfig;
    const hrOfficials: ResolvedOfficialItem[] = [];

    if (hrCfg.validatorEmployeeId || hrCfg.validatorNik) {
      const validatorEmp = context.allEmployees.find(
        (e) =>
          (hrCfg.validatorEmployeeId && e.id === hrCfg.validatorEmployeeId) ||
          (hrCfg.validatorNik && e.nik === hrCfg.validatorNik)
      );
      if (validatorEmp) {
        hrOfficials.push({
          id: validatorEmp.id,
          nik: validatorEmp.nik,
          name: validatorEmp.name,
          jobPosition: validatorEmp.jobPosition,
          role: validatorEmp.role,
          departmentId: validatorEmp.departmentId,
          departmentName: deptMap.get(validatorEmp.departmentId) || "-",
        });
      }
    }

    if (hrOfficials.length === 0 && hrCfg.allowAllHrRoleFallback) {
      const hrRoleEmps = context.allEmployees.filter(
        (e) => e.isActive && (e.role === "HR" || e.role === "ADMIN")
      );
      for (const e of hrRoleEmps) {
        hrOfficials.push({
          id: e.id,
          nik: e.nik,
          name: e.name,
          jobPosition: e.jobPosition,
          role: e.role,
          departmentId: e.departmentId,
          departmentName: deptMap.get(e.departmentId) || "-",
        });
      }
    }

    const displayHr =
      hrOfficials.length > 0 && (hrCfg.validatorEmployeeId || hrCfg.validatorNik)
        ? `${hrOfficials[0].name} (${hrOfficials[0].nik})`
        : hrCfg.validatorName && hrCfg.validatorNik
        ? `${hrCfg.validatorName} (${hrCfg.validatorNik})`
        : "Validator HR";

    steps.push({
      stepNumber: 2,
      stageKey: "HR",
      label: "Validasi HR",
      description: "Validasi Seluruh Dept",
      isSystemStep: false,
      isMandatory: true,
      isSkipped: false,
      canEditScore: Boolean(hrCfg.canEditScore),
      revisionRule: hrCfg.revisionRule || "DIRECT_TO_PENILAI",
      approverBasisLabel: hrCfg.validatorNik
        ? `NIK HR: ${hrCfg.validatorNik}`
        : "Role HR (Seluruh Departemen)",
      scopeLabel: "Seluruh Departemen",
      resolvedOfficials: hrOfficials,
      displayOfficialName: displayHr,
      isDone: false,
      isActive: false,
    });
  } else {
    // Mode 3: MULTI_STAGE (1..N Tingkat Dinamis)
    const sortedStages = [...(config.stages || [])].sort((a, b) => a.order - b.order);

    for (const st of sortedStages) {
      const resolved = resolveStageApproversFromContext({
        stage: st,
        targetEmployee: targetEmp,
        context,
      });

      const prevStep = steps[steps.length - 1];
      const prevPrimaryId = prevStep?.resolvedOfficials?.[0]?.id ?? null;
      const curPrimaryId = resolved.officials?.[0]?.id ?? null;

      let isSkipped = false;
      let skipReason: string | null = null;

      if (!st.isMandatory && resolved.officials.length === 0) {
        isSkipped = true;
        skipReason = "Dilewati otomatis (Tahap opsional & pejabat tidak ditemukan)";
      } else if (
        (!st.isMandatory || st.autoSkipIfSameAsPrevious) &&
        resolved.officials.length === 1 &&
        curPrimaryId !== null &&
        curPrimaryId === prevPrimaryId
      ) {
        isSkipped = true;
        skipReason = "Dilewati otomatis (Pejabat sama dengan tahap sebelumnya)";
      }

      const displayName =
        resolved.officials.length === 1
          ? resolved.officials[0].name
          : resolved.officials.length > 1
          ? `${resolved.officials[0].name} (+${resolved.officials.length - 1})`
          : st.name;

      steps.push({
        stepNumber: steps.length + 1,
        stageKey: st.stageKey.toUpperCase(),
        label: st.name,
        description: st.description || "Review & Validasi",
        isSystemStep: false,
        isMandatory: st.isMandatory,
        isSkipped,
        skipReason,
        canEditScore: st.canEditScore,
        revisionRule: st.revisionRule || "PREVIOUS_STAGE",
        approverBasisLabel: resolved.basisLabel,
        scopeLabel: resolved.scopeLabel,
        resolvedOfficials: resolved.officials,
        displayOfficialName: displayName,
        isDone: false,
        isActive: false,
      });
    }
  }

  // 3. Step Terakhir selalu FINAL (Selesai & Masuk Report)
  steps.push({
    stepNumber: steps.length + 1,
    stageKey: "FINAL",
    label: "Final",
    description: config.mode === "DIRECT_TO_REPORT" ? "Langsung ke Report" : "Selesai & Masuk Report",
    isSystemStep: true,
    isMandatory: true,
    isSkipped: false,
    canEditScore: false,
    revisionRule: "PREVIOUS_STAGE",
    approverBasisLabel: "Sistem KPI",
    scopeLabel: "Laporan Resmi KPI",
    resolvedOfficials: [],
    displayOfficialName: "KPI Resmi (Report)",
    isDone: isFinalStatus,
    isActive: isFinalStatus,
  });

  // In-flight appraisal compatibility resolution
  let activeIdx = steps.findIndex((s) => s.stageKey.toUpperCase() === stageUpper);
  if (activeIdx === -1 && !isFinalStatus) {
    if (statusUpper === "DRAFT" || statusUpper === "REVISED_PENILAI") {
      activeIdx = 0;
    } else {
      const firstActiveIntermediate = steps.findIndex((s) => !s.isSystemStep && !s.isSkipped);
      if (firstActiveIntermediate !== -1) {
        activeIdx = firstActiveIntermediate;
      } else {
        activeIdx = 0;
      }
    }
  }

  if (activeIdx >= 0 && steps[activeIdx]) {
    steps[activeIdx].isSkipped = false;
  }

  for (let i = 0; i < steps.length; i++) {
    steps[i].stepNumber = i + 1;
    if (isFinalStatus) {
      steps[i].isDone = true;
      steps[i].isActive = i === steps.length - 1;
    } else {
      steps[i].isDone = i < activeIdx;
      steps[i].isActive = i === activeIdx;
    }
  }

  const currentStep = steps[activeIdx] || steps[0];

  let nextStep: ResolvedWorkflowStep | null = null;
  for (let i = activeIdx + 1; i < steps.length; i++) {
    if (!steps[i].isSkipped) {
      nextStep = steps[i];
      break;
    }
  }

  let prevStepForRevision: ResolvedWorkflowStep | null = null;
  if (activeIdx > 0) {
    if (currentStep.revisionRule === "DIRECT_TO_PENILAI") {
      prevStepForRevision = steps[0];
    } else {
      for (let i = activeIdx - 1; i >= 0; i--) {
        if (!steps[i].isSkipped) {
          prevStepForRevision = steps[i];
          break;
        }
      }
      if (!prevStepForRevision) prevStepForRevision = steps[0];
    }
  }

  let canCurrentUserApprove = false;
  if (currentUser && !isFinalStatus && currentStep.stageKey !== "PENILAI") {
    const uRole = (currentUser.role || "").toUpperCase();
    if (uRole === "ADMIN") {
      canCurrentUserApprove = true;
    } else if (currentStep.resolvedOfficials.some((off) => off.id === currentUser.id)) {
      canCurrentUserApprove = true;
    } else if (
      config.mode === "SINGLE_HR_VALIDATION" &&
      config.singleHrConfig.allowAllHrRoleFallback &&
      uRole === "HR"
    ) {
      canCurrentUserApprove = true;
    } else if (currentStep.stageKey === "HR" && uRole === "HR") {
      canCurrentUserApprove = true;
    }
  }

  const canCurrentUserEditScore =
    Boolean(currentUser && currentUser.role.toUpperCase() === "ADMIN") ||
    (currentStep.stageKey === "PENILAI" && !isFinalStatus) ||
    (canCurrentUserApprove && Boolean(currentStep.canEditScore));

  return {
    mode: config.mode,
    configVersion: config.version,
    steps,
    activeStageKey: currentStep.stageKey,
    activeStageLabel: currentStep.label,
    canCurrentUserApprove,
    canCurrentUserEditScore,
    currentStepConfig: currentStep,
    nextStep,
    prevStepForRevision,
    allowChooseRevisionTarget: currentStep.revisionRule === "BOTH" && activeIdx > 1,
  };
}

export function mapStageKeyToDbStatus(
  stageKey: string,
  isRevision = false
):
  | "DRAFT"
  | "SUBMITTED"
  | "PENDING_HEAD_DEPT"
  | "PENDING_MANAGER"
  | "PENDING_HR"
  | "REVIEWED"
  | "FINAL"
  | "REVISED_PENILAI"
  | "REVISED_HEAD"
  | "REVISED_MGR" {
  const key = (stageKey || "").toUpperCase();
  if (key === "FINAL") return "FINAL";
  if (key === "PENILAI") return isRevision ? "REVISED_PENILAI" : "DRAFT";
  if (key === "HEAD_DEPT") return isRevision ? "REVISED_HEAD" : "PENDING_HEAD_DEPT";
  if (key === "MANAGER") return isRevision ? "REVISED_MGR" : "PENDING_MANAGER";
  if (key === "HR" || key === "HR_VALIDATOR") return "PENDING_HR";
  return isRevision ? "REVISED_HEAD" : "PENDING_HEAD_DEPT";
}


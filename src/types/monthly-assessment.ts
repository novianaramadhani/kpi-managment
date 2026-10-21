import type { GenericScoringRule } from "@/lib/scoring";
export type { GenericScoringRule };

export const INDONESIAN_MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export interface AppraisalEvidenceItem {
  id: number;
  appraisalId: number;
  parameterId: number;
  month?: number | null;
  fileType: string;
  fileName: string;
  filePath: string;
  fileSize?: number | null;
  mimeType?: string | null;
  extractedValue?: string | null;
  extractedData?: Record<string, any> | null;
  matchStatus?: string | null;
  description?: string | null;
  uploadedBy?: string | null;
  createdAt?: string | Date;
}

export interface IndicatorMonthDetail {
  month: number;
  monthShort: string;
  monthName: string;
  target: number | null;
  unit: string | null;
  actual: number | null;
  achievement: number | null;
  realizationPct?: number | null;
  bandLabel?: string | null;
  score: number | null;
  status: "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "APPROVED";
  notes: string | null;
  evidenceList?: AppraisalEvidenceItem[];
}

export interface MonthlyIndicatorItem {
  appraisalItemId: number;
  monthlyValueId: number | null;
  indicatorCode?: string;
  indicatorName: string;
  indicatorDescription: string | null;
  target: number | null;
  unit: string | null;
  indicatorWeight: number; // e.g. 0.20
  parameterWeight: number; // e.g. 0.65
  direction?: string | null;
  measurementType?: string | null;
  scoringMethod?: string | null;
  compareBasis?: "ACTUAL" | "ACHIEVEMENT" | string;
  aggregation?: "AVERAGE" | "SUM" | "LAST_VALUE" | "RATIO";
  actualValue: number | null;
  realizationPct?: number | null;
  score: number | null;
  maxScore: number;
  finalScoreFraction: number;
  finalScorePercentage: number;
  finalScoreDisplay: string;
  matchedRuleLabel: string | null;
  bandLabel?: string | null;
  status: "TARGET_TERCAPAI" | "PERLU_PERBAIKAN" | "DI_BAWAH_TARGET" | "BELUM_DIISI";
  monthlyStatus: "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "APPROVED";
  notes: string | null;
  scoringRules: GenericScoringRule[];
  allMonthlyActuals?: (number | null)[];
  allMonthlyNotes?: (string | null)[];
  monthlyDetails?: IndicatorMonthDetail[];
  annualTarget?: number | null;
  annualActual?: number | null;
  annualAchievement?: number | null;
  annualScore?: number | null;
  annualBandLabel?: string | null;
  annualFinalScoreFraction?: number;
  annualFinalScorePercentage?: number;
  annualFinalScoreDisplay?: string;
  annualProgress?: string;
  annualStatus?: "Completed" | "In Progress" | "Not Started";
  annualInputMode?: "MONTHLY" | "ANNUAL_DIRECT";
  annualNotes?: string | null;
  parameterId?: number;
  picRole?: string | null;
  isEditable?: boolean;
  assignedAssessors?: Array<{
    id: number;
    nik: string;
    name: string;
    jobPosition: string;
    departmentName?: string;
    isDelegated?: boolean;
  }>;
  assessorResolutionSource?: "NIK_OVERRIDE" | "DEPT_ASSIGNMENT" | "GLOBAL_ASSIGNMENT" | "DEFAULT_HIERARCHY";
  isDelegatedAccess?: boolean;
  isRevisionFlagged?: boolean;
  revisionNote?: string | null;
  evidenceList?: AppraisalEvidenceItem[];
  latestEvidence?: AppraisalEvidenceItem | null;
}

export interface MonthlyCategoryGroup {
  categoryId: number;
  categoryNumber?: number;
  categoryName: string;
  categoryWeight: number;
  indicatorCount?: number;
  progressMonths?: string;
  scorePercentage?: number;
  parameterScore: {
    totalFraction: number;
    totalPercentage: number;
    totalDisplay: string;
  };
  indicators: MonthlyIndicatorItem[];
}

export interface MonthlyAssessmentDetailResult {
  period: {
    id: number;
    name: string;
    year: number;
    status: string;
  };
  employee: {
    id: number;
    nik: string;
    name: string;
    departmentName: string;
    jobLevelName: string;
    jobPosition: string;
    templateId?: number | null;
    templateName?: string | null;
  };
  approvalLine?: {
    appraiser: { id: number; name: string; nik: string; jobPosition: string; role: string } | null;
    headDept: { id: number; name: string; nik: string; jobPosition: string; role: string } | null;
    manager: { id: number; name: string; nik: string; jobPosition: string; role: string } | null;
  } | null;
  appraisalId: number;
  appraisalStatus?: string;
  currentStage?: "PENILAI" | "HEAD_DEPT" | "MANAGER" | "HR" | "FINAL" | string | null;
  rejectionReason?: string | null;
  submittedAt?: string | Date | null;
  headDeptApprovedAt?: string | Date | null;
  headDeptNotes?: string | null;
  managerValidatedAt?: string | Date | null;
  managerNotes?: string | null;
  hrApprovedAt?: string | Date | null;
  hrNotes?: string | null;
  finalizedAt?: string | Date | null;
  approvalLogs?: Array<{
    id: number;
    action: string;
    fromStatus: string;
    toStatus: string;
    stage: string;
    actorName: string;
    actorRole: string;
    notes?: string | null;
    createdAt: string | Date;
  }>;
  assessorProgress?: Array<{
    assessorId: number;
    assessorName: string;
    assessorNik: string;
    role: string;
    categoryNames: string[];
    totalIndicators: number;
    filledIndicators: number;
    submittedIndicators: number;
    isSubmitted: boolean;
  }>;
  myAssessmentStatus?: {
    isAssigned: boolean;
    assignedCategoryNames?: string[];
    totalIndicators: number;
    filledIndicators: number;
    submittedIndicators: number;
    isSubmitted: boolean;
    hasRevisionPending: boolean;
  };
  templateId?: number | null;
  templateName?: string | null;
  month: number;
  monthName: string;
  categories: MonthlyCategoryGroup[];
  summary: {
    totalIndicators: number;
    filledIndicators: number;
    unfilledIndicators: number;
    completionPercentage: number;
    overallScoreFraction: number;
    overallScorePercentage: number;
    overallScoreDisplay: string;
    grade: "A" | "B" | "C" | "D" | "E";
    label: string;
    action: string;
    annualScoreFraction?: number;
    annualScorePercentage?: number;
    annualScoreDisplay?: string;
    annualGrade?: "A" | "B" | "C" | "D" | "E";
    annualLabel?: string;
    annualAction?: string;
    monthlyStatus: "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "APPROVED";
  };
}

export interface EmployeeProgressItem {
  appraisalId: number;
  appraisalStatus: string;
  currentStage?: string | null;
  rejectionReason?: string | null;
  employeeId: number;
  nik: string;
  name: string;
  jobPosition: string;
  departmentId: number;
  departmentName: string | null;
  jobLevelName: string | null;
  appraiserName?: string | null;
  templateName?: string | null;
  finalScore?: number | null;
  grade?: string | null;
  month: number;
  totalIndicators: number;
  totalParameters?: number;
  filledParameters?: number;
  filledCount: number;
  unfilledCount: number;
  completionRate: number;
  monthlyStatus: "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "APPROVED";
}

export interface SaveItemValueInput {
  appraisalItemId: number;
  actualValue: number | null;
  notes?: string | null;
  target?: number | null;
}

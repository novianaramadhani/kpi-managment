export interface MasterEmployeeMatchInput {
  template: {
    id?: number | null;
    name: string;
    employeeId?: number | null;
    departmentId?: number | null;
    jobLevelId?: number | null;
  };
  employees?: Array<{
    id: number;
    nik?: string | null;
    name: string;
    jobPosition?: string | null;
    departmentId?: number | null;
    jobLevelId?: number | null;
  }>;
  existingAppraisals?: Array<{
    id?: number;
    templateId?: number | null;
    employeeId: number;
  }>;
  departments?: Array<{
    id: number;
    name: string;
  }>;
}

export interface ResolvedMasterEmployee {
  id: number;
  nik: string;
  name: string;
  jobPosition: string;
  departmentId?: number | null;
  departmentName: string;
}

/**
 * Strips common prefixes and suffixes from a template title
 * to isolate the employee name portion.
 */
export function cleanTemplateEmployeeName(templateName: string): string {
  if (!templateName) return "";
  let name = templateName
    .replace(/^Template KPI\s*/i, "")
    .replace(/^\[Personal\]\s*/i, "")
    .replace(/^Template\s*/i, "")
    .replace(/\s*-\s*\d{4}$/, "")
    .trim();
  return name;
}

/**
 * Synchronously matches a template against in-memory master employees,
 * appraisals, and departments. Pure client-safe logic (no DB driver).
 */
export function findMasterEmployeeForTemplate({
  template,
  employees: empList = [],
  existingAppraisals = [],
  departments: deptList = [],
}: MasterEmployeeMatchInput): ResolvedMasterEmployee | null {
  let matchedEmp: (typeof empList)[0] | undefined;

  // 1. Direct employeeId link
  if (template.employeeId) {
    matchedEmp = empList.find((e) => e.id === template.employeeId);
  }

  // 2. Existing appraisals link (template assigned to an appraisal)
  if (!matchedEmp && template.id && existingAppraisals.length > 0) {
    const appr = existingAppraisals.find((a) => a.templateId === template.id);
    if (appr) {
      matchedEmp = empList.find((e) => e.id === appr.employeeId);
    }
  }

  // 3. Name & token based matching against master employee
  if (!matchedEmp) {
    const clean = cleanTemplateEmployeeName(template.name);
    const cleanLower = clean.toLowerCase();

    // A. Exact match across all employees
    matchedEmp = empList.find((e) => e.name.toLowerCase().trim() === cleanLower);

    // B. Token-based matching with department weighting
    if (!matchedEmp) {
      const words = cleanLower
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2);

      if (words.length > 0) {
        let bestScore = 0;
        let bestCandidate: (typeof empList)[0] | undefined;

        for (const emp of empList) {
          const empWords = emp.name
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length > 2);

          let matches = 0;
          for (const w of words) {
            if (
              empWords.some(
                (ew) =>
                  ew === w ||
                  (w.length >= 4 && (ew.includes(w) || w.includes(ew)))
              )
            ) {
              matches++;
            }
          }

          if (matches > 0) {
            let score = matches * 10;
            if (template.departmentId && emp.departmentId === template.departmentId) {
              score += 25; // Department matching bonus
            }
            if (
              emp.name.toLowerCase().includes(words.join(" ")) ||
              words.join(" ").includes(emp.name.toLowerCase())
            ) {
              score += 20;
            }

            if (score > bestScore) {
              bestScore = score;
              bestCandidate = emp;
            }
          }
        }

        if (bestScore >= 20) {
          matchedEmp = bestCandidate;
        }
      }
    }
  }

  if (!matchedEmp) return null;

  const deptName =
    deptList.find((d) => d.id === matchedEmp!.departmentId)?.name ||
    (template.departmentId
      ? deptList.find((d) => d.id === template.departmentId)?.name
      : undefined) ||
    "-";

  return {
    id: matchedEmp.id,
    nik: matchedEmp.nik || "-",
    name: matchedEmp.name,
    jobPosition: matchedEmp.jobPosition || "-",
    departmentId: matchedEmp.departmentId,
    departmentName: deptName,
  };
}

"use client";

import React, { useState, useRef, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Info,
  Check,
  RotateCcw,
  Layers,
  FileCheck2,
  Plus,
  GitCompare,
  AlertCircle,
  ShieldCheck,
  SlidersHorizontal,
  User,
  Briefcase,
  Hash,
  Building2,
} from "lucide-react";
import type { Department, JobLevel, JobPosition, KpiPeriod } from "@/db/schema";
import {
  getExcelWorkbookInfo,
  parseMasterTemplateExcelSheet,
  validateMasterTemplateParsedData,
  detectSheetTargetMetadata,
  extractCriteriaValue,
  formatCriteriaString,
  type WorkbookInfo,
  type ParsedCategory,
  type ParsedParam,
  type KpiValidationFinding,
  type MasterParamItem,
  type DetectedTargetMetadata,
} from "@/lib/excel-template-kpi";
import {
  saveImportedMasterTemplateAction,
  createMasterParameterFromImportAction,
  createBatchMasterParametersFromImportAction,
  getExistingMasterTemplateForComparisonAction,
  resolveExcelHeaderTargetAction,
  type ExistingTemplateComparisonData,
  type ResolvedExcelTargetResult,
} from "@/lib/actions";
import {
  TemplateImportPreviewTable,
  type IndicatorComparisonItem,
  type ComparisonStatus,
} from "./template-import-preview-table";
import {
  parseRangeValues,
  extractSingleNumericValue,
  autoHarmonizeCriteriaBands,
  autoDetermineBandValue,
  detectIndicatorUnit,
} from "@/lib/kpi-criteria-helper";

export interface EmployeeItem {
  id: number;
  nik: string;
  name: string;
  departmentId: number;
  jobLevelId: number;
  jobPositionId: number | null;
  jobPosition: string;
}

interface TemplateExcelImportWizardProps {
  departments: Department[];
  jobLevels: JobLevel[];
  jobPositions: JobPosition[];
  periods: KpiPeriod[];
  activePeriod?: KpiPeriod;
  masterParameters: MasterParamItem[];
  employees?: EmployeeItem[];
}

type WizardStage = "UPLOAD_CONFIG" | "MAPPING_PREVIEW" | "VALIDATE_CONFIRM" | "SUCCESS";

export function TemplateExcelImportWizard({
  departments,
  jobLevels,
  jobPositions,
  periods,
  activePeriod,
  masterParameters,
  employees = [],
}: TemplateExcelImportWizardProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, startSavingTransition] = useTransition();

  // Wizard Stage State (3 Stage Flow)
  const [currentStage, setCurrentStage] = useState<WizardStage>("UPLOAD_CONFIG");

  // State Kamus Parameter Lokal agar pendaftaran baru langsung aktif
  const [localMasterParameters, setLocalMasterParameters] =
    useState<MasterParamItem[]>(masterParameters);
  const [addingParamKey, setAddingParamKey] = useState<string | null>(null);
  const [isAddingBatch, setIsAddingBatch] = useState<boolean>(false);

  // Status Bidang yang Terdeteksi Otomatis dari Excel
  const [detectedFields, setDetectedFields] = useState<{
    department: boolean;
    jobLevel: boolean;
    jobPosition: boolean;
    periodYear: boolean;
  }>({
    department: false,
    jobLevel: false,
    jobPosition: false,
    periodYear: false,
  });

  React.useEffect(() => {
    setLocalMasterParameters(masterParameters);
  }, [masterParameters]);

  // Stage 1: Upload & Configuration State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [workbookInfo, setWorkbookInfo] = useState<WorkbookInfo | null>(null);
  const [selectedSheetName, setSelectedSheetName] = useState<string>("");
  const [isReadingFile, setIsReadingFile] = useState<boolean>(false);
  const [isResolvingTarget, setIsResolvingTarget] = useState<boolean>(false);
  const [resolvedHeader, setResolvedHeader] =
    useState<ResolvedExcelTargetResult | null>(null);

  const [selectedNik, setSelectedNik] = useState<string>("");
  const [employeeName, setEmployeeName] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [jobLevelId, setJobLevelId] = useState<number | "">("");
  const [jobPositionId, setJobPositionId] = useState<number | "">("");
  const [periodYear, setPeriodYear] = useState<string>(() => {
    return activePeriod?.year
      ? String(activePeriod.year)
      : periods[0]?.year
      ? String(periods[0].year)
      : "2026";
  });

  // Stage 2: Parsed Data & Master Comparison State
  const [parsedCategories, setParsedCategories] = useState<ParsedCategory[]>([]);
  const [isParsingSheet, setIsParsingSheet] = useState<boolean>(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  // Existing Master Template for Comparison
  const [existingMasterData, setExistingMasterData] =
    useState<ExistingTemplateComparisonData | null>(null);
  const [isLoadingExistingMaster, setIsLoadingExistingMaster] = useState<boolean>(false);

  // Stage 3: Success Result State
  const [createdTemplateId, setCreatedTemplateId] = useState<number | null>(null);
  const [createdTemplateName, setCreatedTemplateName] = useState<string>("");

  // Resolusi Objek Konfigurasi
  const selectedDept = departments.find((d) => d.id === Number(departmentId));
  const selectedLevel = jobLevels.find((l) => l.id === Number(jobLevelId));
  const selectedPosition = jobPositions.find((p) => p.id === Number(jobPositionId));

  // Daftar Job Position terfilter sesuai Departemen & Job Level (jika dipilih)
  const filteredPositions = useMemo(() => {
    return jobPositions.filter((p) => {
      if (departmentId && p.departmentId !== Number(departmentId)) return false;
      if (jobLevelId && p.jobLevelId !== Number(jobLevelId)) return false;
      return true;
    });
  }, [jobPositions, departmentId, jobLevelId]);

  // Handler sinkronisasi pemilihan Job Position -> Otomatis lengkapi Departemen & Level
  const handlePositionChange = (posId: number | "") => {
    setJobPositionId(posId);
    setDetectedFields((prev) => ({ ...prev, jobPosition: false }));
    if (posId) {
      const pos = jobPositions.find((p) => p.id === Number(posId));
      if (pos) {
        if (!departmentId || departmentId !== pos.departmentId) {
          setDepartmentId(pos.departmentId);
          setDetectedFields((prev) => ({ ...prev, department: true }));
        }
        if (!jobLevelId || jobLevelId !== pos.jobLevelId) {
          setJobLevelId(pos.jobLevelId);
          setDetectedFields((prev) => ({ ...prev, jobLevel: true }));
        }
      }
    }
  };

  // Handler pemilihan NIK -> Otomatis isi Nama Karyawan & sesuaikan Departemen, Job Level, Job Position
  const handleNikChange = (nik: string) => {
    setSelectedNik(nik);
    const emp = employees.find((e) => e.nik === nik);
    if (emp) {
      setEmployeeName(emp.name);
      if (emp.departmentId) {
        setDepartmentId(emp.departmentId);
        setDetectedFields((prev) => ({ ...prev, department: true }));
      }
      if (emp.jobLevelId) {
        setJobLevelId(emp.jobLevelId);
        setDetectedFields((prev) => ({ ...prev, jobLevel: true }));
      }
      let posId: number | "" = "";
      if (emp.jobPositionId) {
        posId = emp.jobPositionId;
      } else if (emp.jobPosition) {
        const matched = jobPositions.find(
          (p) => p.name.trim().toLowerCase() === emp.jobPosition.trim().toLowerCase()
        );
        if (matched) posId = matched.id;
      }
      setJobPositionId(posId);
      setDetectedFields((prev) => ({ ...prev, jobPosition: Boolean(posId) }));
    } else {
      setEmployeeName("");
    }
  };

  // Data Profil Karyawan & Jabatan yang Terdeteksi dari Header Excel
  const detectedEmployeeName = useMemo(() => {
    return (
      resolvedHeader?.matchedEmployee?.name ||
      resolvedHeader?.extractedFields?.name ||
      workbookInfo?.detectedMetadata?.extractedHeader?.name ||
      null
    );
  }, [resolvedHeader, workbookInfo]);

  const detectedEmployeeNik = useMemo(() => {
    return (
      resolvedHeader?.matchedEmployee?.nik ||
      resolvedHeader?.extractedFields?.nik ||
      workbookInfo?.detectedMetadata?.extractedHeader?.nik ||
      null
    );
  }, [resolvedHeader, workbookInfo]);

  const detectedJobPosition = useMemo(() => {
    return (
      selectedPosition?.name ||
      resolvedHeader?.jobPositionName ||
      resolvedHeader?.extractedFields?.jobPosition ||
      workbookInfo?.detectedMetadata?.extractedHeader?.jobPosition ||
      null
    );
  }, [selectedPosition, resolvedHeader, workbookInfo]);

  // Nama Master Template Otomatis berdasarkan Nama Karyawan dan Periode Tahun
  const templateName = useMemo(() => {
    const yearPart = periodYear.trim() || "2026";
    const empPart = (employeeName || detectedEmployeeName || "").trim();
    if (empPart) {
      return `Template KPI ${empPart} - ${yearPart}`;
    }
    if (selectedPosition) {
      return `Template KPI ${selectedPosition.name} - ${yearPart}`;
    }
    const deptPart = selectedDept?.name || "Departemen";
    const levelPart = selectedLevel?.name || "Job Level";
    return `Template KPI ${deptPart} - ${levelPart} - ${yearPart}`;
  }, [employeeName, detectedEmployeeName, selectedPosition, selectedDept, selectedLevel, periodYear]);

  // Evaluasi Hasil Validasi (5 Pilar: Kelengkapan, Duplikasi, Kriteria, Skor, Bobot)
  const validationResult = useMemo(() => {
    if (parsedCategories.length === 0) {
      return {
        isValid: false,
        errors: [],
        warnings: [],
        checklist: {
          completeness: { isValid: false, message: "Data belum diunggah", errorCount: 1 },
          duplication: { isValid: true, message: "Tidak ada duplikasi", errorCount: 0 },
          criteria: { isValid: false, message: "Kriteria belum tersedia", errorCount: 1 },
          score: { isValid: false, message: "Skor belum tersedia", errorCount: 1 },
          weight: { isValid: false, message: "Bobot belum dihitung", totalPct: 0, expectedPct: 115 },
          mapping: { isValid: false, message: "Belum terpetakan", matchedCount: 0, totalCount: 0 },
        },
        totalWeightPct: 0,
        paramCount: 0,
        indicatorCount: 0,
        matchedCount: 0,
        unmatchedCount: 0,
      };
    }
    return validateMasterTemplateParsedData(parsedCategories, localMasterParameters, {
      expectedTotalWeightPct: 115,
      departmentId: departmentId ? Number(departmentId) : undefined,
      departmentName: selectedDept?.name,
      jobLevelName: selectedLevel?.name,
    });
  }, [parsedCategories, localMasterParameters, departmentId, selectedDept, selectedLevel]);

  // Evaluasi Komparasi Data Excel dengan Master Template Eksisting
  const comparisonEvaluation = useMemo(() => {
    const comparisonMap = new Map<string, IndicatorComparisonItem>();
    const removedIndicators: IndicatorComparisonItem[] = [];

    if (!existingMasterData || !existingMasterData.found || !existingMasterData.categories) {
      return {
        comparisonMap,
        removedIndicators,
        matchedCount: 0,
        differentCount: 0,
        addedCount: parsedCategories.reduce((acc, c) => acc + c.params.length, 0),
        removedCount: 0,
        hasExisting: false,
      };
    }

    // Peta indikator dari master template eksisting
    const existingParamsMap = new Map<
      string,
      {
        categoryName: string;
        param: NonNullable<ExistingTemplateComparisonData["categories"]>[0]["params"][0];
      }
    >();

    for (const cat of existingMasterData.categories) {
      for (const p of cat.params) {
        const norm = p.name.trim().toLowerCase();
        if (norm) {
          existingParamsMap.set(norm, { categoryName: cat.name, param: p });
        }
      }
    }

    const seenInExcel = new Set<string>();
    let matchedCount = 0;
    let differentCount = 0;
    let addedCount = 0;

    for (const cat of parsedCategories) {
      for (const p of cat.params) {
        const norm = p.name.trim().toLowerCase();
        seenInExcel.add(norm);

        const existing = existingParamsMap.get(norm);
        if (existing) {
          const diffDetails: string[] = [];
          const ep = existing.param;

          // Cek perbedaan target
          const pTarget = (p.target || "").trim();
          const epTarget = (ep.target || "").trim();
          if (pTarget !== epTarget && (pTarget || epTarget)) {
            diffDetails.push(`Target: ${epTarget || "-"} -> ${pTarget || "-"}`);
          }

          // Cek perbedaan satuan
          const pUnit = (p.unit || "").trim();
          const epUnit = (ep.unit || "").trim();
          if (pUnit !== epUnit && (pUnit || epUnit)) {
            diffDetails.push(`Satuan: ${epUnit || "-"} -> ${pUnit || "-"}`);
          }

          // Cek perbedaan bobot
          const pWeightPct = Math.round(p.weight * 100);
          const epWeightPct = Math.round(ep.weight * 100);
          if (Math.abs(pWeightPct - epWeightPct) > 1) {
            diffDetails.push(`Bobot: ${epWeightPct}% -> ${pWeightPct}%`);
          }

          if (diffDetails.length > 0) {
            differentCount++;
            comparisonMap.set(norm, {
              name: p.name,
              categoryName: cat.name,
              status: "DIFFERENT",
              diffDetails,
              existingIndicator: ep,
            });
          } else {
            matchedCount++;
            comparisonMap.set(norm, {
              name: p.name,
              categoryName: cat.name,
              status: "MATCHED",
              existingIndicator: ep,
            });
          }
        } else {
          addedCount++;
          comparisonMap.set(norm, {
            name: p.name,
            categoryName: cat.name,
            status: "ADDED",
          });
        }
      }
    }

    // Cari indikator yang hilang (ada di master lama, tapi tidak ada di Excel)
    for (const [norm, { categoryName, param }] of existingParamsMap.entries()) {
      if (!seenInExcel.has(norm)) {
        removedIndicators.push({
          name: param.name,
          categoryName,
          status: "REMOVED",
          existingIndicator: param,
        });
      }
    }

    return {
      comparisonMap,
      removedIndicators,
      matchedCount,
      differentCount,
      addedCount,
      removedCount: removedIndicators.length,
      hasExisting: true,
    };
  }, [parsedCategories, existingMasterData]);

  // Handler Pemilihan Berkas dengan Auto-Deteksi Metadata & Resolusi Kolom Header
  const handleFileSelected = async (file: File) => {
    try {
      setIsReadingFile(true);
      setSelectedFile(file);

      const info = await getExcelWorkbookInfo(file, {
        departments,
        jobLevels,
        periods,
      });
      setWorkbookInfo(info);
      setSelectedSheetName(info.defaultSheetName);

      const meta = info.detectedMetadata;
      let targetDeptId: number | "" = meta?.departmentId || "";
      let targetJobLevelId: number | "" = meta?.jobLevelId || "";
      let targetJobPositionId: number | "" = "";
      let targetYear: string = meta?.periodYear || periodYear;
      let targetNik: string = "";
      let targetEmpName: string = "";

      // Resolusi silang Nama, NIK, Job Position, Departemen ke database sistem
      try {
        setIsResolvingTarget(true);
        const resolved = await resolveExcelHeaderTargetAction({
          name: meta?.extractedHeader?.name,
          nik: meta?.extractedHeader?.nik,
          jobPosition: meta?.extractedHeader?.jobPosition,
          department: meta?.extractedHeader?.department,
          fileName: file.name,
          sheetName: info.defaultSheetName,
        });
        setResolvedHeader(resolved);

        if (resolved.matchedEmployee) {
          targetNik = resolved.matchedEmployee.nik;
          targetEmpName = resolved.matchedEmployee.name;
        } else if (meta?.extractedHeader?.nik) {
          targetNik = meta.extractedHeader.nik;
          if (meta.extractedHeader.name) targetEmpName = meta.extractedHeader.name;
        } else if (meta?.extractedHeader?.name) {
          targetEmpName = meta.extractedHeader.name;
        }

        if (resolved.departmentId) {
          targetDeptId = resolved.departmentId;
        }
        if (resolved.jobLevelId) {
          targetJobLevelId = resolved.jobLevelId;
        }
        if (resolved.jobPositionId) {
          targetJobPositionId = resolved.jobPositionId;
        }
      } catch (err) {
        console.warn("Gagal resolusi silang header Excel ke DB:", err);
      } finally {
        setIsResolvingTarget(false);
      }

      if (targetNik) {
        setSelectedNik(targetNik);
        const emp = employees.find((e) => e.nik === targetNik);
        if (emp) {
          setEmployeeName(emp.name);
          if (!targetDeptId && emp.departmentId) targetDeptId = emp.departmentId;
          if (!targetJobLevelId && emp.jobLevelId) targetJobLevelId = emp.jobLevelId;
          if (!targetJobPositionId && emp.jobPositionId) targetJobPositionId = emp.jobPositionId;
        } else if (targetEmpName) {
          setEmployeeName(targetEmpName);
        }
      } else if (targetEmpName) {
        const emp = employees.find((e) => e.name.toLowerCase() === targetEmpName.toLowerCase());
        if (emp) {
          setSelectedNik(emp.nik);
          setEmployeeName(emp.name);
          if (!targetDeptId && emp.departmentId) targetDeptId = emp.departmentId;
          if (!targetJobLevelId && emp.jobLevelId) targetJobLevelId = emp.jobLevelId;
          if (!targetJobPositionId && emp.jobPositionId) targetJobPositionId = emp.jobPositionId;
        } else {
          setEmployeeName(targetEmpName);
        }
      }

      if (targetDeptId) {
        setDepartmentId(targetDeptId);
        setDetectedFields((prev) => ({ ...prev, department: true }));
      } else {
        setDetectedFields((prev) => ({ ...prev, department: false }));
      }

      if (targetJobLevelId) {
        setJobLevelId(targetJobLevelId);
        setDetectedFields((prev) => ({ ...prev, jobLevel: true }));
      } else {
        setDetectedFields((prev) => ({ ...prev, jobLevel: false }));
      }

      if (targetJobPositionId) {
        setJobPositionId(targetJobPositionId);
        setDetectedFields((prev) => ({ ...prev, jobPosition: true }));
      } else {
        setJobPositionId("");
        setDetectedFields((prev) => ({ ...prev, jobPosition: false }));
      }

      if (targetYear) {
        setPeriodYear(targetYear);
        setDetectedFields((prev) => ({ ...prev, periodYear: true }));
      } else {
        setDetectedFields((prev) => ({ ...prev, periodYear: false }));
      }
    } catch (err: unknown) {
      console.error("Gagal membaca berkas Excel:", err);
      const msg = err instanceof Error ? err.message : "Berkas Excel tidak dapat dibaca.";
      void Swal.fire({
        icon: "error",
        title: "Gagal Membaca File",
        text: msg,
        confirmButtonColor: "#2563eb",
      });
    } finally {
      setIsReadingFile(false);
    }
  };

  // Handler Penggantian Sheet Aktif
  const handleSheetChange = async (newSheetName: string) => {
    setSelectedSheetName(newSheetName);
    if (!selectedFile) return;

    try {
      const meta = await detectSheetTargetMetadata(
        selectedFile,
        newSheetName,
        departments,
        jobLevels,
        periods
      );

      let targetDeptId: number | "" = meta?.departmentId || "";
      let targetJobLevelId: number | "" = meta?.jobLevelId || "";
      let targetJobPositionId: number | "" = "";
      let targetYear: string = meta?.periodYear || "";
      let targetNik: string = "";
      let targetEmpName: string = "";

      try {
        setIsResolvingTarget(true);
        const resolved = await resolveExcelHeaderTargetAction({
          name: meta.extractedHeader?.name,
          nik: meta.extractedHeader?.nik,
          jobPosition: meta.extractedHeader?.jobPosition,
          department: meta.extractedHeader?.department,
          fileName: selectedFile.name,
          sheetName: newSheetName,
        });
        setResolvedHeader(resolved);
        if (resolved.matchedEmployee) {
          targetNik = resolved.matchedEmployee.nik;
          targetEmpName = resolved.matchedEmployee.name;
        } else if (meta.extractedHeader?.nik) {
          targetNik = meta.extractedHeader.nik;
          if (meta.extractedHeader.name) targetEmpName = meta.extractedHeader.name;
        } else if (meta.extractedHeader?.name) {
          targetEmpName = meta.extractedHeader.name;
        }
        if (resolved.departmentId) targetDeptId = resolved.departmentId;
        if (resolved.jobLevelId) targetJobLevelId = resolved.jobLevelId;
        if (resolved.jobPositionId) targetJobPositionId = resolved.jobPositionId;
      } catch (err) {
        console.warn("Gagal resolusi target pada sheet baru:", err);
      } finally {
        setIsResolvingTarget(false);
      }

      if (targetNik) {
        setSelectedNik(targetNik);
        const emp = employees.find((e) => e.nik === targetNik);
        if (emp) {
          setEmployeeName(emp.name);
          if (!targetDeptId && emp.departmentId) targetDeptId = emp.departmentId;
          if (!targetJobLevelId && emp.jobLevelId) targetJobLevelId = emp.jobLevelId;
          if (!targetJobPositionId && emp.jobPositionId) targetJobPositionId = emp.jobPositionId;
        } else if (targetEmpName) {
          setEmployeeName(targetEmpName);
        }
      } else if (targetEmpName) {
        const emp = employees.find((e) => e.name.toLowerCase() === targetEmpName.toLowerCase());
        if (emp) {
          setSelectedNik(emp.nik);
          setEmployeeName(emp.name);
          if (!targetDeptId && emp.departmentId) targetDeptId = emp.departmentId;
          if (!targetJobLevelId && emp.jobLevelId) targetJobLevelId = emp.jobLevelId;
          if (!targetJobPositionId && emp.jobPositionId) targetJobPositionId = emp.jobPositionId;
        } else {
          setEmployeeName(targetEmpName);
        }
      }

      if (targetDeptId) {
        setDepartmentId(targetDeptId);
        setDetectedFields((prev) => ({ ...prev, department: true }));
      }
      if (targetJobLevelId) {
        setJobLevelId(targetJobLevelId);
        setDetectedFields((prev) => ({ ...prev, jobLevel: true }));
      }
      if (targetJobPositionId) {
        setJobPositionId(targetJobPositionId);
        setDetectedFields((prev) => ({ ...prev, jobPosition: true }));
      }
      if (targetYear) {
        setPeriodYear(targetYear);
        setDetectedFields((prev) => ({ ...prev, periodYear: true }));
      }
    } catch (err) {
      console.error("Gagal mendeteksi metadata pada sheet baru:", err);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      void handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  // Transisi dari Stage 1 (Upload & Konfigurasi) ke Stage 2 (Mapping & Preview)
  const handleProcessToPreview = async () => {
    if (!selectedFile) {
      void Swal.fire({
        icon: "warning",
        title: "Pilih File Excel",
        text: "Silakan unggah berkas Excel KPI terlebih dahulu.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }
    if (!departmentId) {
      void Swal.fire({
        icon: "warning",
        title: "Pilih Departemen",
        text: "Silakan pilih Departemen untuk menentukan acuan template.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }
    if (!jobLevelId) {
      void Swal.fire({
        icon: "warning",
        title: "Pilih Job Level",
        text: "Silakan pilih Job Level sasaran template KPI.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    try {
      setIsParsingSheet(true);
      setIsLoadingExistingMaster(true);

      // 1. Parse sheet Excel
      const res = await parseMasterTemplateExcelSheet(selectedFile, {
        sheetName: selectedSheetName,
        expectedTotalWeightPct: 115,
        masterParameters: localMasterParameters,
        departmentId: Number(departmentId),
      });

      if (res.errors.length > 0 && res.categories.length === 0) {
        void Swal.fire({
          icon: "error",
          title: "Struktur Excel Tidak Dikenali",
          html: `<div class="text-xs text-left text-slate-700 space-y-1">${res.errors
            .map((e) => `<p>• ${e}</p>`)
            .join("")}</div>`,
          confirmButtonColor: "#2563eb",
        });
        return;
      }

      setParsedCategories(res.categories);
      setParseErrors(res.errors);
      setParseWarnings(res.warnings);

      // 2. Ambil Master Template yang sudah ada untuk komparasi (jika ada)
      try {
        const compRes = await getExistingMasterTemplateForComparisonAction({
          departmentId: Number(departmentId),
          jobLevelId: Number(jobLevelId),
          jobPositionId: jobPositionId ? Number(jobPositionId) : null,
          periodYear,
        });
        setExistingMasterData(compRes);
      } catch (cErr) {
        console.warn("Gagal mengambil master template pembanding:", cErr);
        setExistingMasterData({ found: false });
      }

      setCurrentStage("MAPPING_PREVIEW");
    } catch (err: unknown) {
      console.error("Gagal memproses sheet Excel:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menguraikan struktur data Excel.";
      void Swal.fire({
        icon: "error",
        title: "Gagal Menguraikan Data",
        text: msg,
        confirmButtonColor: "#2563eb",
      });
    } finally {
      setIsParsingSheet(false);
      setIsLoadingExistingMaster(false);
    }
  };

  // Handler Update Mapping Kamus Parameter Manual
  const handleUpdateIndicatorMasterId = (
    catIndex: number,
    paramIndex: number,
    masterParameterId: number | null
  ) => {
    setParsedCategories((prev) => {
      const next = [...prev];
      const targetCat = { ...next[catIndex] };
      const nextParams = [...targetCat.params];
      const targetParam = { ...nextParams[paramIndex] };

      targetParam.masterParameterId = masterParameterId;

      if (masterParameterId) {
        const foundMaster = localMasterParameters.find((mp) => mp.id === masterParameterId);
        if (foundMaster) {
          if (foundMaster.unit && !targetParam.unit) targetParam.unit = foundMaster.unit;
          if (foundMaster.description && !targetParam.description)
            targetParam.description = foundMaster.description;
        }
      }

      nextParams[paramIndex] = targetParam;
      targetCat.params = nextParams;
      next[catIndex] = targetCat;
      return next;
    });
  };

  // Handler Update Skor Kriteria Penilaian Langsung Secara Inline
  const handleUpdateBandScore = (
    catIndex: number,
    paramIndex: number,
    bandIndex: number,
    newScore: number
  ) => {
    setParsedCategories((prev) => {
      const next = [...prev];
      const targetCat = { ...next[catIndex] };
      const nextParams = [...targetCat.params];
      const targetParam = { ...nextParams[paramIndex] };
      const nextBands = [...targetParam.bands];
      const targetBand = { ...nextBands[bandIndex] };

      targetBand.score = newScore;
      nextBands[bandIndex] = targetBand;
      targetParam.bands = nextBands;

      // Sinkronkan maxScore indikator dengan skor tertinggi di antara bands
      const maxBandScore = nextBands.reduce((max, b) => {
        const val = Number(b.score);
        return !isNaN(val) && val > max ? val : max;
      }, 0);
      targetParam.maxScore = maxBandScore > 0 ? maxBandScore : 25;

      nextParams[paramIndex] = targetParam;
      targetCat.params = nextParams;
      next[catIndex] = targetCat;
      return next;
    });
  };

  // Handler Update Operator Kriteria Penilaian
  const handleUpdateBandOperator = (
    catIndex: number,
    paramIndex: number,
    bandIndex: number,
    newOperatorSymbol: string
  ) => {
    setParsedCategories((prev) => {
      const next = [...prev];
      const targetCat = { ...next[catIndex] };
      const nextParams = [...targetCat.params];
      const targetParam = { ...nextParams[paramIndex] };
      const nextBands = [...targetParam.bands];
      const targetBand = { ...nextBands[bandIndex] };

      targetBand.operatorSymbol = newOperatorSymbol;

      // 1. Deteksi dan sesuaikan satuan indikator secara dinamis
      const detectedUnit = detectIndicatorUnit(targetParam.unit, targetParam.bands);
      if (targetParam.unit === "%" && detectedUnit !== "%") {
        targetParam.unit = detectedUnit;
      }

      // 2. Tentukan nilai kriteria otomatis berdasarkan operator baru dan kriteria sekitar
      const autoResult = autoDetermineBandValue(
        targetParam.bands,
        bandIndex,
        newOperatorSymbol,
        targetParam.unit || detectedUnit
      );

      targetBand.criteriaValue = autoResult.value;
      targetBand.minValue = autoResult.minValue;
      targetBand.maxValue = autoResult.maxValue;
      targetBand.needsManualReview = autoResult.needsManualReview;
      targetBand.manualReviewReason = autoResult.reason;
      targetBand.isUnrecognizedOperator = newOperatorSymbol === "?";

      // 3. Mapping operator internal
      if (newOperatorSymbol === ">=") {
        targetBand.operator = "GTE";
      } else if (newOperatorSymbol === ">") {
        targetBand.operator = "GT";
      } else if (newOperatorSymbol === "<=") {
        targetBand.operator = "LTE";
      } else if (newOperatorSymbol === "<") {
        targetBand.operator = "LT";
      } else if (newOperatorSymbol === "=") {
        targetBand.operator = "EQ";
      } else if (newOperatorSymbol === "Rentang") {
        targetBand.operator = "BETWEEN";
      } else if (newOperatorSymbol === "Teks") {
        targetBand.operator = "TEXT";
      }

      targetBand.label = formatCriteriaString(newOperatorSymbol, autoResult.value);
      nextBands[bandIndex] = targetBand;
      targetParam.bands = nextBands;
      nextParams[paramIndex] = targetParam;
      targetCat.params = nextParams;
      next[catIndex] = targetCat;
      return next;
    });
  };

  // Handler Update Nilai Kriteria Penilaian
  const handleUpdateBandCriteriaValue = (
    catIndex: number,
    paramIndex: number,
    bandIndex: number,
    newCriteriaValue: string
  ) => {
    setParsedCategories((prev) => {
      const next = [...prev];
      const targetCat = { ...next[catIndex] };
      const nextParams = [...targetCat.params];
      const targetParam = { ...nextParams[paramIndex] };
      const nextBands = [...targetParam.bands];
      const targetBand = { ...nextBands[bandIndex] };

      targetBand.criteriaValue = newCriteriaValue;
      const opSym =
        targetBand.operatorSymbol ||
        (targetBand.operator === "GTE"
          ? ">="
          : targetBand.operator === "GT"
          ? ">"
          : targetBand.operator === "LTE"
          ? "<="
          : targetBand.operator === "LT"
          ? "<"
          : targetBand.operator === "EQ"
          ? "="
          : targetBand.operator === "BETWEEN"
          ? "Rentang"
          : "Teks");

      targetBand.label = formatCriteriaString(opSym, newCriteriaValue);

      if (opSym === "Rentang") {
        targetBand.operator = "BETWEEN";
        const range = parseRangeValues(newCriteriaValue);
        if (range) {
          targetBand.minValue = range.min;
          targetBand.maxValue = range.max;
          targetBand.needsManualReview = false;
          targetBand.manualReviewReason = undefined;
          if (range.unit && targetParam.unit === "%" && range.unit !== "%") {
            targetParam.unit = range.unit;
          }
        } else {
          targetBand.minValue = null;
          targetBand.maxValue = null;
          targetBand.needsManualReview = true;
          targetBand.manualReviewReason = "Format rentang belum lengkap (contoh: 3 - 4 hari).";
        }
      } else if (opSym === ">=" || opSym === ">") {
        targetBand.operator = opSym === ">=" ? "GTE" : "GT";
        const num = extractSingleNumericValue(newCriteriaValue);
        targetBand.minValue = num;
        targetBand.maxValue = null;
        targetBand.needsManualReview = num === null;
        if (num === null) {
          targetBand.manualReviewReason = "Nilai batas belum diisi angka valid.";
        } else {
          targetBand.manualReviewReason = undefined;
        }
      } else if (opSym === "<=" || opSym === "<") {
        targetBand.operator = opSym === "<=" ? "LTE" : "LT";
        const num = extractSingleNumericValue(newCriteriaValue);
        targetBand.minValue = null;
        targetBand.maxValue = num;
        targetBand.needsManualReview = num === null;
        if (num === null) {
          targetBand.manualReviewReason = "Nilai batas belum diisi angka valid.";
        } else {
          targetBand.manualReviewReason = undefined;
        }
      } else if (opSym === "=") {
        targetBand.operator = "EQ";
        const num = extractSingleNumericValue(newCriteriaValue);
        targetBand.minValue = num;
        targetBand.maxValue = num;
        targetBand.needsManualReview = num === null;
        if (num === null) {
          targetBand.manualReviewReason = "Nilai kriteria belum diisi angka valid.";
        } else {
          targetBand.manualReviewReason = undefined;
        }
      } else if (opSym === "Teks") {
        targetBand.operator = "TEXT";
        targetBand.minValue = null;
        targetBand.maxValue = null;
        targetBand.needsManualReview = !newCriteriaValue.trim();
        if (!newCriteriaValue.trim()) {
          targetBand.manualReviewReason = "Pilihan kriteria teks belum diisi.";
        } else {
          targetBand.manualReviewReason = undefined;
        }
      }

      nextBands[bandIndex] = targetBand;
      targetParam.bands = nextBands;
      nextParams[paramIndex] = targetParam;
      targetCat.params = nextParams;
      next[catIndex] = targetCat;
      return next;
    });
  };

  // Handler Update Bobot Indikator Internal
  const handleUpdateIndicatorWeight = (
    catIndex: number,
    paramIndex: number,
    newWeight: number
  ) => {
    setParsedCategories((prev) => {
      const next = [...prev];
      const targetCat = { ...next[catIndex] };
      const nextParams = [...targetCat.params];
      const targetParam = { ...nextParams[paramIndex] };

      targetParam.weight = newWeight;
      nextParams[paramIndex] = targetParam;
      targetCat.params = nextParams;
      next[catIndex] = targetCat;
      return next;
    });
  };

  // Handler Update Bobot Parameter Utama
  const handleUpdateCategoryWeight = (
    catIndex: number,
    newWeight: number
  ) => {
    setParsedCategories((prev) => {
      const next = [...prev];
      if (!next[catIndex]) return prev;
      next[catIndex] = { ...next[catIndex], weight: newWeight };
      return next;
    });
  };

  // Handler Seimbangkan Bobot Internal Subparameter Otomatis (Total 100%)
  const handleAutoBalanceIndicatorWeights = (catIndex: number) => {
    setParsedCategories((prev) => {
      const next = [...prev];
      const targetCat = { ...next[catIndex] };
      const count = targetCat.params.length;
      if (count === 0) return prev;

      const basePct = Math.floor(100 / count);
      const remainder = 100 - basePct * count;

      const updatedParams = targetCat.params.map((p, idx) => {
        const pct = idx < remainder ? basePct + 1 : basePct;
        return {
          ...p,
          weight: pct / 100,
        };
      });

      targetCat.params = updatedParams;
      next[catIndex] = targetCat;
      return next;
    });
  };

  // Handler Perbaiki Otomatis Rentang Kriteria (Tutup Celah / Overlap) per Indikator
  const handleAutoHarmonizeParamBands = (catIndex: number, paramIndex: number) => {
    setParsedCategories((prev) => {
      const next = [...prev];
      const targetCat = { ...next[catIndex] };
      const nextParams = [...targetCat.params];
      const targetParam = { ...nextParams[paramIndex] };
      const detectedUnit = detectIndicatorUnit(targetParam.unit, targetParam.bands);
      if (targetParam.unit === "%" && detectedUnit !== "%") {
        targetParam.unit = detectedUnit;
      }
      targetParam.bands = autoHarmonizeCriteriaBands(
        targetParam.bands,
        targetParam.unit || detectedUnit || "%"
      );
      nextParams[paramIndex] = targetParam;
      targetCat.params = nextParams;
      next[catIndex] = targetCat;
      return next;
    });
  };

  // Handler Perbaiki Otomatis Seluruh Rentang Kriteria di Semua Parameter
  const handleAutoHarmonizeAllBands = () => {
    setParsedCategories((prev) => {
      return prev.map((cat) => ({
        ...cat,
        params: cat.params.map((param) => {
          const detectedUnit = detectIndicatorUnit(param.unit, param.bands);
          const effectiveUnit =
            param.unit === "%" && detectedUnit !== "%"
              ? detectedUnit
              : param.unit || detectedUnit || "%";
          return {
            ...param,
            unit: effectiveUnit,
            bands: autoHarmonizeCriteriaBands(param.bands, effectiveUnit),
          };
        }),
      }));
    });
  };

  // Handler Pendaftaran Indikator Baru Tunggal ke Kamus Parameter
  const handleAddIndicatorToMaster = async (catIndex: number, paramIndex: number) => {
    if (!departmentId) {
      void Swal.fire({
        icon: "warning",
        title: "Departemen Belum Dipilih",
        text: "Silakan pilih Departemen terlebih dahulu.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    const cat = parsedCategories[catIndex];
    const param = cat?.params[paramIndex];
    if (!param) return;

    const rowKey = `${catIndex}-${paramIndex}`;
    setAddingParamKey(rowKey);

    try {
      const res = await createMasterParameterFromImportAction({
        name: param.name,
        departmentId: Number(departmentId),
        categoryName: cat.name,
        unit: param.unit,
        description: param.description,
        inputType: param.inputType,
        bands: param.bands.map((b) => ({
          score: Number(b.score),
          label: b.label,
          operator: b.operator,
          minValue: b.minValue ?? null,
          maxValue: b.maxValue ?? null,
        })),
      });

      if (res.success && res.masterParameter) {
        const newMp = res.masterParameter;
        setLocalMasterParameters((prev) => {
          if (prev.some((p) => p.id === newMp.id)) return prev;
          return [
            ...prev,
            {
              id: newMp.id,
              code: newMp.code,
              name: newMp.name,
              departmentId: newMp.departmentId,
              departmentName: selectedDept?.name || null,
              categoryName: newMp.categoryName,
              unit: newMp.unit,
              description: newMp.description,
              isActive: true,
            },
          ];
        });

        // Hubungkan ke parsedCategories
        handleUpdateIndicatorMasterId(catIndex, paramIndex, newMp.id);

        void Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: `Indikator "${newMp.name}" didaftarkan (${newMp.code || "Baru"})`,
          showConfirmButton: false,
          timer: 3000,
        });
      } else {
        void Swal.fire({
          icon: "error",
          title: "Gagal Menambahkan ke Kamus",
          text: res.error || "Terjadi kesalahan saat menambahkan parameter ke kamus.",
          confirmButtonColor: "#2563eb",
        });
      }
    } catch (err: unknown) {
      console.error("Gagal menambahkan ke kamus:", err);
      void Swal.fire({
        icon: "error",
        title: "Kesalahan Sistem",
        text: err instanceof Error ? err.message : "Terjadi kesalahan pada sistem.",
        confirmButtonColor: "#2563eb",
      });
    } finally {
      setAddingParamKey(null);
    }
  };

  // Handler Pendaftaran Massal Semua Indikator Baru ke Kamus Parameter
  const handleBatchAddToMaster = async () => {
    if (!departmentId) {
      void Swal.fire({
        icon: "warning",
        title: "Departemen Belum Dipilih",
        text: "Silakan pilih Departemen terlebih dahulu.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    const unmatchedList: Array<{
      catIndex: number;
      paramIndex: number;
      categoryName: string;
      param: ParsedParam;
    }> = [];

    parsedCategories.forEach((cat, cIdx) => {
      cat.params.forEach((p, pIdx) => {
        const isMatched = localMasterParameters.some(
          (mp) => mp.id === p.masterParameterId && mp.departmentId === Number(departmentId)
        );
        if (!isMatched) {
          unmatchedList.push({
            catIndex: cIdx,
            paramIndex: pIdx,
            categoryName: cat.name,
            param: p,
          });
        }
      });
    });

    if (unmatchedList.length === 0) {
      void Swal.fire({
        icon: "info",
        title: "Semua Terpetakan",
        text: "Seluruh indikator sudah terpetakan ke Kamus Parameter departemen ini.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    const confirmRes = await Swal.fire({
      title: "Daftarkan Semua ke Kamus?",
      html: `<div class="text-xs text-slate-700 text-left space-y-1.5">
        <p>Sistem akan mendaftarkan <strong>${unmatchedList.length}</strong> indikator baru ke Kamus Parameter departemen <strong>${selectedDept?.name}</strong> secara otomatis.</p>
        <p class="text-slate-500">Kode parameter akan diatur otomatis sesuai penomoran departemen.</p>
      </div>`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Ya, Daftarkan Sekarang",
      cancelButtonText: "Batal",
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#64748b",
    });

    if (!confirmRes.isConfirmed) return;

    setIsAddingBatch(true);
    try {
      const items = unmatchedList.map((item) => ({
        name: item.param.name,
        categoryName: item.categoryName,
        unit: item.param.unit,
        description: item.param.description,
        inputType: item.param.inputType,
        bands: item.param.bands.map((b) => ({
          score: Number(b.score),
          label: b.label,
          operator: b.operator,
          minValue: b.minValue ?? null,
          maxValue: b.maxValue ?? null,
        })),
      }));

      const res = await createBatchMasterParametersFromImportAction({
        departmentId: Number(departmentId),
        items,
      });

      if (res.success && res.createdItems) {
        const newItems: MasterParamItem[] = res.createdItems.map((ci) => ({
          id: ci.id,
          code: ci.code,
          name: ci.name,
          departmentId: ci.departmentId,
          departmentName: selectedDept?.name || null,
          categoryName: ci.categoryName,
          unit: ci.unit,
          isActive: true,
        }));

        setLocalMasterParameters((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const toAdd = newItems.filter((ni) => !existingIds.has(ni.id));
          return [...prev, ...toAdd];
        });

        // Hubungkan setiap indikator dengan Kamus Parameter yang baru didaftarkan
        setParsedCategories((prev) => {
          return prev.map((cat) => {
            const updatedParams = cat.params.map((p) => {
              const matchedCreated = newItems.find(
                (item) => item.name.trim().toLowerCase() === p.name.trim().toLowerCase()
              );
              if (matchedCreated) {
                return {
                  ...p,
                  masterParameterId: matchedCreated.id,
                  unit: p.unit || matchedCreated.unit || "%",
                };
              }
              return p;
            });
            return { ...cat, params: updatedParams };
          });
        });

        void Swal.fire({
          icon: "success",
          title: "Berhasil Didaftarkan",
          text: `${res.createdItems.length} indikator berhasil ditambahkan ke Kamus Parameter departemen ${selectedDept?.name}.`,
          confirmButtonColor: "#2563eb",
        });
      } else {
        void Swal.fire({
          icon: "error",
          title: "Gagal Mendaftarkan Indikator",
          text: res.error || "Terjadi kesalahan saat mendaftarkan indikator secara massal.",
          confirmButtonColor: "#2563eb",
        });
      }
    } catch (err: unknown) {
      console.error("Gagal batch add:", err);
      void Swal.fire({
        icon: "error",
        title: "Kesalahan Sistem",
        text: err instanceof Error ? err.message : "Terjadi kesalahan saat memproses pendaftaran massal.",
        confirmButtonColor: "#2563eb",
      });
    } finally {
      setIsAddingBatch(false);
    }
  };

  // Handler Batal & Bersihkan Berkas Sementara
  const handleCancelImport = async () => {
    const confirmCancel = await Swal.fire({
      title: "Batalkan Proses Impor?",
      text: "Seluruh data preview dan file Excel sementara di memori browser akan segera dihapus tanpa mengubah database.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, Batalkan & Bersihkan",
      cancelButtonText: "Lanjutkan Impor",
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#64748b",
    });
    if (confirmCancel.isConfirmed) {
      resetImportFlow();
      router.push("/setup/templates");
    }
  };

  // Handler Simpan Template (Stage 3 -> SUCCESS)
  const handleSaveTemplate = async () => {
    if (!validationResult.isValid) {
      void Swal.fire({
        icon: "warning",
        title: "Validasi Belum Terpenuhi",
        text: "Pastikan seluruh kesalahan validasi diperbaiki sebelum menyimpan template.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    const finalNik = (selectedNik || detectedEmployeeNik || "").trim();
    const finalEmpName = (employeeName || detectedEmployeeName || "").trim();

    // Konfirmasi eksplisit pengguna sebelum data master disimpan ke database
    const confirmResult = await Swal.fire({
      title: "Konfirmasi Simpan Master Template",
      html: `
        <div class="text-left text-xs space-y-2.5 mt-2">
          <p class="text-slate-700">Data Master Template KPI akan disimpan secara permanen ke database dengan rincian berikut:</p>
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 space-y-1.5 font-medium">
            <div><span class="text-slate-500">Nama Template:</span> <strong class="text-slate-900">${templateName}</strong></div>
            <div><span class="text-slate-500">Departemen:</span> <strong>${selectedDept?.name || "-"}</strong></div>
            <div><span class="text-slate-500">Job Level:</span> <strong>${selectedLevel?.name || "-"}</strong></div>
            <div><span class="text-slate-500">Total Struktur:</span> <strong class="text-blue-700">${validationResult.paramCount} Parameter, ${validationResult.indicatorCount} Indikator (${validationResult.totalWeightPct}%)</strong></div>
            ${(finalNik || finalEmpName) ? `<div><span class="text-slate-500">Penugasan Default:</span> <strong class="text-emerald-700">${finalNik ? finalNik + " - " : ""}${finalEmpName}</strong></div>` : ""}
          </div>
          <div class="p-2.5 bg-blue-50/70 border border-blue-200/60 rounded-lg text-blue-900 text-[11px] flex items-start gap-1.5 mt-2">
            <span class="text-blue-600 font-bold shrink-0 mt-0.5">ℹ️</span>
            <span>File Excel asli hanya diproses sementara di memori browser dan akan otomatis dibersihkan setelah penyimpanan selesai. Tidak ada file mentah yang disimpan permanen di server.</span>
          </div>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Ya, Simpan & Publish",
      cancelButtonText: "Periksa Kembali",
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#64748b",
    });

    if (!confirmResult.isConfirmed) {
      return;
    }

    startSavingTransition(async () => {
      try {
        const inputCategories = parsedCategories.map((c, cIdx) => ({
          name: c.name,
          weight: c.weight,
          categoryType: c.categoryType,
          sortOrder: c.sortOrder ?? cIdx,
          params: c.params.map((p, pIdx) => ({
            masterParameterId: p.masterParameterId ?? null,
            name: p.name,
            description: p.description || null,
            target: p.target || "100",
            unit: p.unit || "%",
            weight: p.weight,
            maxScore: p.maxScore || 25,
            inputType: (p.inputType as any) || "MONTHLY_ACTUAL",
            aggregation: p.aggregation || "AVERAGE",
            compareBasis: p.compareBasis || "ACTUAL",
            picRole: p.picRole || "HEAD_DEPT",
            sortOrder: p.sortOrder ?? pIdx,
            bands: p.bands.map((b, bIdx) => ({
              label: b.label,
              operator: b.operator,
              minValue: b.minValue ?? null,
              maxValue: b.maxValue ?? null,
              score: Number(b.score),
              sortOrder: b.sortOrder ?? bIdx,
            })),
            indicatorName: p.indicatorName,
            indicatorNumber: p.indicatorNumber,
            subParamNumber: p.subParamNumber,
            indicatorWeight: p.indicatorWeight,
          })),
        }));

        const res = await saveImportedMasterTemplateAction({
          name: templateName,
          departmentId: Number(departmentId),
          jobLevelId: Number(jobLevelId),
          jobPositionId: jobPositionId ? Number(jobPositionId) : null,
          periodYear,
          categories: inputCategories,
          employeeNik: finalNik || null,
          employeeName: finalEmpName || null,
          autoPublish: true,
          fileMetadata: selectedFile ? {
            fileName: selectedFile.name,
            fileSize: selectedFile.size,
            sheetName: selectedSheetName || workbookInfo?.sheetNames[0] || "",
          } : undefined,
        });

        if (res.success && res.templateId) {
          // Bersihkan file dan buffer sementara dari memori browser segera setelah berhasil disimpan
          setSelectedFile(null);
          setWorkbookInfo(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }

          setCreatedTemplateId(res.templateId);
          setCreatedTemplateName(res.templateName || templateName);

          if (res.assignedEmployee) {
            const resultDialog = await Swal.fire({
              icon: "success",
              title: "Template Dipublish & Ditugaskan",
              html: `
                <div class="text-left text-xs space-y-2.5 mt-2">
                  <p class="text-slate-700">Template <strong>"${res.templateName || templateName}"</strong> berhasil <strong>dipublish (aktif)</strong> dan otomatis ditugaskan ke:</p>
                  <div class="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 font-semibold flex items-center gap-2">
                    <span class="text-sm">👤</span>
                    <span>${res.assignedEmployee.nik} - ${res.assignedEmployee.name}</span>
                  </div>
                  <p class="text-slate-500 text-[11px] pt-1">
                    Status penilaian telah dibuat (Draft). Anda dapat langsung melanjutkan untuk menentukan Penilai / Asesor.
                  </p>
                </div>
              `,
              showCancelButton: true,
              confirmButtonText: "Tugaskan Penilai Sekarang",
              cancelButtonText: "Lihat Daftar Template",
              confirmButtonColor: "#2563eb",
              cancelButtonColor: "#64748b",
            });

            if (resultDialog.isConfirmed) {
              router.push("/setup/assignments?tab=penugasan-asesor");
            } else {
              router.push("/setup/templates");
            }
          } else {
            await Swal.fire({
              icon: "success",
              title: "Master Template Berhasil Dipublish",
              text: `Template "${res.templateName || templateName}" telah aktif (Published) dan siap digunakan.`,
              confirmButtonText: "Lihat Daftar Template",
              confirmButtonColor: "#2563eb",
            });

            router.push("/setup/templates");
          }
        } else {
          void Swal.fire({
            icon: "error",
            title: "Gagal Menyimpan Template",
            text: res.error || "Terjadi kesalahan pada sistem saat menyimpan template.",
            confirmButtonColor: "#2563eb",
          });
        }
      } catch (err: unknown) {
        console.error("Gagal menyimpan template:", err);
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan template.";
        void Swal.fire({
          icon: "error",
          title: "Kesalahan Server",
          text: msg,
          confirmButtonColor: "#2563eb",
        });
      }
    });
  };

  const resetImportFlow = () => {
    setSelectedFile(null);
    setWorkbookInfo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setSelectedSheetName("");
    setResolvedHeader(null);
    setSelectedNik("");
    setEmployeeName("");
    setDepartmentId("");
    setJobLevelId("");
    setJobPositionId("");
    setDetectedFields({ department: false, jobLevel: false, jobPosition: false, periodYear: false });
    setParsedCategories([]);
    setParseErrors([]);
    setParseWarnings([]);
    setExistingMasterData(null);
    setCreatedTemplateId(null);
    setCreatedTemplateName("");
    setCurrentStage("UPLOAD_CONFIG");
  };

  return (
    <div className="space-y-5">
      {/* ==================================================================== */}
      {/* STEPPER NAVIGASI 3 STAGE                                            */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Stage 1 */}
          <div
            onClick={() => {
              if (currentStage !== "SUCCESS") setCurrentStage("UPLOAD_CONFIG");
            }}
            className={`flex items-center gap-3 p-2.5 rounded-xl transition cursor-pointer ${
              currentStage === "UPLOAD_CONFIG"
                ? "bg-blue-50 text-blue-900 font-bold border border-blue-200"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                currentStage === "UPLOAD_CONFIG"
                  ? "bg-blue-600 text-white"
                  : selectedFile
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {selectedFile && currentStage !== "UPLOAD_CONFIG" ? (
                <Check className="w-4 h-4" />
              ) : (
                "1"
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">1. Upload &amp; Konfigurasi</div>
              <div className="text-[11px] text-slate-500 font-normal truncate">
                Unggah berkas &amp; atur sasaran
              </div>
            </div>
          </div>

          {/* Stage 2 */}
          <div
            onClick={() => {
              if (parsedCategories.length > 0 && currentStage !== "SUCCESS") {
                setCurrentStage("MAPPING_PREVIEW");
              }
            }}
            className={`flex items-center gap-3 p-2.5 rounded-xl transition ${
              parsedCategories.length > 0 && currentStage !== "SUCCESS"
                ? "cursor-pointer"
                : "opacity-60 cursor-not-allowed"
            } ${
              currentStage === "MAPPING_PREVIEW"
                ? "bg-blue-50 text-blue-900 font-bold border border-blue-200"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                currentStage === "MAPPING_PREVIEW"
                  ? "bg-blue-600 text-white"
                  : parsedCategories.length > 0 &&
                    (currentStage === "VALIDATE_CONFIRM" || currentStage === "SUCCESS")
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {parsedCategories.length > 0 &&
              (currentStage === "VALIDATE_CONFIRM" || currentStage === "SUCCESS") ? (
                <Check className="w-4 h-4" />
              ) : (
                "2"
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">2. Mapping &amp; Preview</div>
              <div className="text-[11px] text-slate-500 font-normal truncate">
                Tabel indikator &amp; komparasi master
              </div>
            </div>
          </div>

          {/* Stage 3 */}
          <div
            onClick={() => {
              if (parsedCategories.length > 0 && currentStage !== "SUCCESS") {
                setCurrentStage("VALIDATE_CONFIRM");
              }
            }}
            className={`flex items-center gap-3 p-2.5 rounded-xl transition ${
              parsedCategories.length > 0 && currentStage !== "SUCCESS"
                ? "cursor-pointer"
                : "opacity-60 cursor-not-allowed"
            } ${
              currentStage === "VALIDATE_CONFIRM"
                ? "bg-blue-50 text-blue-900 font-bold border border-blue-200"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                currentStage === "VALIDATE_CONFIRM"
                  ? "bg-blue-600 text-white"
                  : currentStage === "SUCCESS"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {currentStage === "SUCCESS" ? <Check className="w-4 h-4" /> : "3"}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">3. Validasi &amp; Konfirmasi</div>
              <div className="text-[11px] text-slate-500 font-normal truncate">
                Pemeriksaan aturan &amp; simpan
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* STAGE 1: UPLOAD & KONFIGURASI (UNIFIED VIEW)                         */}
      {/* ==================================================================== */}
      {currentStage === "UPLOAD_CONFIG" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                1. Unggah Berkas &amp; Konfigurasi Sasaran Template
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pilih berkas Excel (.xlsx / .xls). Sistem akan mendeteksi Departemen, Job Level, dan Periode secara otomatis, serta Anda dapat mengoreksinya jika diperlukan.
              </p>
            </div>

            {/* Kebijakan Retensi & Pemrosesan Sementara */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-slate-700">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-slate-800">Pemrosesan Sementara &amp; Kebijakan Retensi Berkas</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Berkas Excel asli hanya diproses sementara di memori browser untuk parsing dan preview. Data Master Template KPI baru akan disimpan ke database setelah validasi berhasil dan Anda mengonfirmasi penyimpanan. Berkas mentah tidak disimpan permanen di server dan buffer memori otomatis dibersihkan saat proses selesai atau dibatalkan.
                </p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileSelected(f);
              }}
              className="hidden"
            />

            {/* Dropzone Upload (Hanya tampil jika belum ada berkas terpilih) */}
            {!selectedFile && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/20 rounded-2xl p-7 text-center transition cursor-pointer flex flex-col items-center justify-center gap-2.5"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    {isReadingFile
                      ? "Sedang membaca dan menganalisis berkas..."
                      : "Klik untuk memilih berkas Excel atau seret berkas ke sini"}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Mendukung berkas Excel Workbook (.xlsx, .xls) bertingkat atau multi-sheet hingga 15 MB
                  </p>
                </div>
              </div>
            )}

            {/* Info Berkas & Selector Sheet jika berkas terpilih */}
            {workbookInfo && selectedFile && (
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                      XLS
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{workbookInfo.fileName}</p>
                      <p className="text-[11px] text-slate-500">
                        Ukuran: {(workbookInfo.fileSize / 1024).toFixed(1)} KB | Jumlah sheet:{" "}
                        {workbookInfo.sheetNames.length} sheet
                      </p>
                    </div>
                  </div>

                  {/* Selector Sheet & Ganti Berkas */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs font-bold text-slate-700">Pilih Sheet Data:</label>
                    <select
                      value={selectedSheetName}
                      onChange={(e) => void handleSheetChange(e.target.value)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-800 focus:border-blue-600 focus:outline-none cursor-pointer"
                    >
                      {workbookInfo.sheetNames.map((sn) => (
                        <option key={sn} value={sn}>
                          {sn} {sn === workbookInfo.defaultSheetName ? "(Rekomendasi Data)" : ""}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>Ganti Berkas</span>
                    </button>
                  </div>
                </div>

                {/* Banner Status Deteksi Otomatis */}
                {departmentId && jobLevelId ? (
                  <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-950">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Konfigurasi Sasaran Terdeteksi Otomatis</p>
                      <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                        {employeeName || selectedNik ? (
                          <>
                            Profil karyawan <strong>{employeeName || selectedNik}</strong>
                            {selectedNik && employeeName ? ` (${selectedNik})` : ""}, Departemen{" "}
                            <strong>{selectedDept?.name}</strong>, Job Level{" "}
                            <strong>{selectedLevel?.name}</strong>
                            {selectedPosition ? (
                              <>
                                , Jabatan <strong>{selectedPosition.name}</strong>
                              </>
                            ) : null}
                            , dan Periode <strong>{periodYear}</strong> terdeteksi otomatis. Anda dapat memverifikasi atau mengubah pilihan pada kolom di bawah.
                          </>
                        ) : resolvedHeader?.matchedEmployee ? (
                          <>
                            Departemen <strong>{selectedDept?.name}</strong>, Job Level <strong>{selectedLevel?.name}</strong>
                            {selectedPosition ? (
                              <>
                                , Jabatan <strong>{selectedPosition.name}</strong>
                              </>
                            ) : null}
                            , dan Periode <strong>{periodYear}</strong> terdeteksi otomatis dari profil karyawan{" "}
                            <strong>{resolvedHeader.matchedEmployee.name}</strong> ({resolvedHeader.matchedEmployee.nik}). Anda dapat memverifikasi atau mengubah pilihan pada kolom di bawah.
                          </>
                        ) : (
                          <>
                            Departemen <strong>{selectedDept?.name}</strong>, Job Level <strong>{selectedLevel?.name}</strong>
                            {selectedPosition ? (
                              <>
                                , Jabatan <strong>{selectedPosition.name}</strong>
                              </>
                            ) : null}
                            , dan Periode <strong>{periodYear}</strong> terdeteksi dari Excel. Anda dapat memverifikasi atau mengubah pilihan pada kolom di bawah.
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                ) : departmentId || jobLevelId ? (
                  <div className="bg-blue-50/90 border border-blue-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-blue-950">
                    <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Sebagian Konfigurasi Terdeteksi</p>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Sebagian data terdeteksi otomatis. Silakan lengkapi atau sesuaikan kolom konfigurasi yang masih kosong.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Grid Konfigurasi Sasaran (NIK, Nama Karyawan, Departemen, Job Level, Job Position, Periode) */}
            <div className="pt-2 border-t border-slate-100 space-y-4">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Konfigurasi Sasaran Master Template
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {/* NIK */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-800">
                      NIK <span className="text-rose-600">*</span>
                    </label>
                    {selectedNik && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        <Check className="w-2.5 h-2.5 text-emerald-600" />
                        <span>Terpilih</span>
                      </span>
                    )}
                  </div>
                  <select
                    value={selectedNik}
                    onChange={(e) => handleNikChange(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border bg-white text-slate-800 focus:outline-none cursor-pointer transition font-mono ${
                      !selectedNik && selectedFile
                        ? "border-amber-300 bg-amber-50/20 focus:border-amber-500"
                        : "border-slate-300 focus:border-blue-600"
                    }`}
                  >
                    <option value="">Pilih NIK Karyawan...</option>
                    {selectedNik && !employees.some((e) => e.nik === selectedNik) && (
                      <option value={selectedNik}>{selectedNik} (Dari Berkas Excel)</option>
                    )}
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.nik}>
                        {emp.nik} - {emp.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Nama Karyawan */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-800">Nama Karyawan</label>
                    {employeeName && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        <Check className="w-2.5 h-2.5 text-emerald-600" />
                        <span>Otomatis</span>
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    readOnly
                    value={employeeName}
                    placeholder="Terisi otomatis berdasarkan NIK..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-semibold cursor-not-allowed focus:outline-none"
                  />
                </div>

                {/* Departemen */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-800">
                      Departemen <span className="text-rose-600">*</span>
                    </label>
                    {detectedFields.department && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        <Check className="w-2.5 h-2.5 text-emerald-600" />
                        <span>Otomatis</span>
                      </span>
                    )}
                  </div>
                  <select
                    value={departmentId}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : "";
                      setDepartmentId(val);
                      setDetectedFields((prev) => ({ ...prev, department: false }));
                      if (val && jobPositionId) {
                        const curPos = jobPositions.find((p) => p.id === Number(jobPositionId));
                        if (curPos && curPos.departmentId !== val) {
                          setJobPositionId("");
                        }
                      }
                    }}
                    className={`w-full px-3 py-2 text-xs rounded-xl border bg-white text-slate-800 focus:outline-none cursor-pointer transition ${
                      !departmentId && selectedFile
                        ? "border-amber-300 bg-amber-50/20 focus:border-amber-500"
                        : "border-slate-300 focus:border-blue-600"
                    }`}
                  >
                    <option value="">Pilih Departemen...</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.code ? `(${d.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Job Level */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-800">
                      Job Level <span className="text-rose-600">*</span>
                    </label>
                    {detectedFields.jobLevel && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        <Check className="w-2.5 h-2.5 text-emerald-600" />
                        <span>Otomatis</span>
                      </span>
                    )}
                  </div>
                  <select
                    value={jobLevelId}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : "";
                      setJobLevelId(val);
                      setDetectedFields((prev) => ({ ...prev, jobLevel: false }));
                      if (val && jobPositionId) {
                        const curPos = jobPositions.find((p) => p.id === Number(jobPositionId));
                        if (curPos && curPos.jobLevelId !== val) {
                          setJobPositionId("");
                        }
                      }
                    }}
                    className={`w-full px-3 py-2 text-xs rounded-xl border bg-white text-slate-800 focus:outline-none cursor-pointer transition ${
                      !jobLevelId && selectedFile
                        ? "border-amber-300 bg-amber-50/20 focus:border-amber-500"
                        : "border-slate-300 focus:border-blue-600"
                    }`}
                  >
                    <option value="">Pilih Job Level...</option>
                    {jobLevels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} {l.code ? `(${l.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Job Position (Jabatan) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-800">
                      Job Position <span className="text-slate-400 font-normal">(Jabatan)</span>
                    </label>
                    {detectedFields.jobPosition && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        <Check className="w-2.5 h-2.5 text-emerald-600" />
                        <span>Otomatis</span>
                      </span>
                    )}
                  </div>
                  <select
                    value={jobPositionId}
                    onChange={(e) => handlePositionChange(e.target.value ? Number(e.target.value) : "")}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 focus:border-blue-600 focus:outline-none cursor-pointer transition"
                  >
                    <option value="">Pilih Job Position (Opsional)...</option>
                    {filteredPositions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.code ? `(${p.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Periode Tahun */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-800">
                      Periode Tahun <span className="text-rose-600">*</span>
                    </label>
                    {detectedFields.periodYear && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        <Check className="w-2.5 h-2.5 text-emerald-600" />
                        <span>Otomatis</span>
                      </span>
                    )}
                  </div>
                  <select
                    value={periodYear}
                    onChange={(e) => {
                      setPeriodYear(e.target.value);
                      setDetectedFields((prev) => ({ ...prev, periodYear: false }));
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 focus:border-blue-600 focus:outline-none cursor-pointer"
                  >
                    {periods.length > 0 ? (
                      periods.map((p) => (
                        <option key={p.id} value={String(p.year)}>
                          Tahun {p.year} {p.status === "ACTIVE" ? "(Aktif)" : ""}
                        </option>
                      ))
                    ) : (
                      <option value="2026">Tahun 2026</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Nama Template Pratinjau */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Nama Master Template yang Akan Dihasilkan
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={templateName}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-100 text-slate-700 font-semibold cursor-not-allowed select-none"
                />
              </div>
            </div>
          </div>

          {/* Toolbar Navigasi Stage 1 */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push("/setup/templates")}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs"
            >
              Batalkan
            </button>

            <button
              type="button"
              onClick={handleProcessToPreview}
              disabled={!selectedFile || !departmentId || !jobLevelId || isParsingSheet}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isParsingSheet ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Menguraikan Berkas &amp; Membandingkan...</span>
                </>
              ) : (
                <>
                  <span>Lanjut ke Mapping &amp; Preview</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* STAGE 2: MAPPING & PREVIEW (DENGAN KOMPARASI MASTER)                  */}
      {/* ==================================================================== */}
      {currentStage === "MAPPING_PREVIEW" && (
        <div className="space-y-4">
          {/* Header Ringkasan Master Template */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-slate-900">{templateName}</h2>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                    Sheet: {selectedSheetName}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {(employeeName || detectedEmployeeName) && (
                    <>
                      Nama: <strong className="text-slate-900">{employeeName || detectedEmployeeName}</strong>
                      {(selectedNik || detectedEmployeeNik) ? ` (${selectedNik || detectedEmployeeNik})` : ""}{" "}
                      |{" "}
                    </>
                  )}
                  Departemen: <strong>{selectedDept?.name}</strong> | Job Level:{" "}
                  <strong>{selectedLevel?.name}</strong>
                  {selectedPosition ? (
                    <>
                      {" "}| Jabatan: <strong>{selectedPosition.name}</strong>
                    </>
                  ) : null}{" "}
                  | Periode: <strong>{periodYear}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-bold border border-blue-200 font-mono">
                  Total Bobot: {Math.round(parsedCategories.reduce((acc, c) => acc + c.weight, 0) * 100)}%
                </span>
              </div>
            </div>
          </div>

          {/* Banner Peringatan Parsing jika ada */}
          {parseWarnings.length > 0 && (
            <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold">Catatan Pembacaan:</span>
                {parseWarnings.map((w, idx) => (
                  <p key={idx} className="text-[11px] text-amber-800">
                    • {w}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Banner Tambahkan Semua ke Kamus jika ada indikator belum terpetakan */}
          {validationResult.unmatchedCount > 0 && (
            <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 flex items-center justify-between flex-wrap gap-2.5 shadow-2xs">
              <div className="flex items-center gap-2 text-xs text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  Terdapat <strong>{validationResult.unmatchedCount}</strong> indikator yang belum terdaftar di Kamus Parameter ({selectedDept?.name}). Anda dapat mendaftarkannya satu per satu pada tabel atau sekaligus sekarang.
                </span>
              </div>
              <button
                type="button"
                onClick={handleBatchAddToMaster}
                disabled={isAddingBatch}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isAddingBatch ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Daftarkan Semua ({validationResult.unmatchedCount}) ke Kamus</span>
              </button>
            </div>
          )}

          {/* Tabel Pratinjau Hirarki & Komparasi */}
          <TemplateImportPreviewTable
            categories={parsedCategories}
            masterParameters={localMasterParameters}
            departmentId={departmentId}
            departmentName={selectedDept?.name}
            onUpdateIndicatorMasterId={handleUpdateIndicatorMasterId}
            onAddIndicatorToMaster={handleAddIndicatorToMaster}
            addingParamKey={addingParamKey}
            comparisonMap={comparisonEvaluation.comparisonMap}
            removedIndicators={comparisonEvaluation.removedIndicators}
            hasExistingMaster={comparisonEvaluation.hasExisting}
            onUpdateBandScore={handleUpdateBandScore}
            onUpdateBandOperator={handleUpdateBandOperator}
            onUpdateBandCriteriaValue={handleUpdateBandCriteriaValue}
            onUpdateIndicatorWeight={handleUpdateIndicatorWeight}
            onUpdateCategoryWeight={handleUpdateCategoryWeight}
            onAutoBalanceIndicatorWeights={handleAutoBalanceIndicatorWeights}
            onAutoHarmonizeParamBands={handleAutoHarmonizeParamBands}
            onAutoHarmonizeAllBands={handleAutoHarmonizeAllBands}
          />

          {/* Toolbar Navigasi Stage 2 */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentStage("UPLOAD_CONFIG")}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali ke Upload &amp; Konfigurasi</span>
              </button>
              <button
                type="button"
                onClick={handleCancelImport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100/80 text-xs font-semibold text-rose-700 transition cursor-pointer shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Batalkan &amp; Bersihkan Berkas</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setCurrentStage("VALIDATE_CONFIRM")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
            >
              <span>Lanjut ke Validasi &amp; Konfirmasi</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* STAGE 3: VALIDASI & KONFIRMASI                                       */}
      {/* ==================================================================== */}
      {currentStage === "VALIDATE_CONFIRM" && (
        <div className="space-y-4">
          {/* Banner Aksi Cepat: Kamus Parameter */}
          {validationResult.unmatchedCount > 0 && (
            <div className="bg-blue-50/90 border border-blue-200 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3 shadow-2xs">
              <div className="flex items-start gap-2.5 text-xs text-blue-950">
                <Info className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">Selesaikan Pemetaan Kamus Parameter dengan Satu Klik</p>
                  <p className="text-[11px] text-slate-600">
                    Daftarkan sekaligus <strong>{validationResult.unmatchedCount}</strong> indikator baru ke Kamus Parameter departemen <strong>{selectedDept?.name}</strong> agar validasi lolos.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleBatchAddToMaster}
                disabled={isAddingBatch}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isAddingBatch ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Daftarkan Semua ({validationResult.unmatchedCount}) Sekarang</span>
              </button>
            </div>
          )}

          {/* Rincian Daftar Temuan Kesalahan (Errors) */}
          {validationResult.errors.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="bg-rose-50 px-4 py-3 border-b border-rose-200 flex items-center justify-between">
                <span className="text-xs font-bold text-rose-900">
                  Rincian Detail Kesalahan ({validationResult.errors.length})
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentStage("MAPPING_PREVIEW")}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-900 cursor-pointer underline"
                >
                  Kembali ke Mapping &amp; Preview untuk Memperbaiki
                </button>
              </div>

              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {validationResult.errors.map((err, idx) => (
                  <div key={idx} className="p-3 text-xs flex items-start gap-2.5">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 shrink-0 mt-0.5">
                      {err.code}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-800 font-medium">{err.message}</p>
                      {err.paramName && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Lokasi: Parameter <strong>{err.paramName}</strong>
                          {err.indicatorName ? ` > Indikator: ${err.indicatorName}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rincian Catatan & Peringatan Pemeriksaan Manual */}
          {validationResult.warnings.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="bg-amber-50 px-4 py-3 border-b border-amber-200 flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Catatan &amp; Peringatan Pemeriksaan Manual ({validationResult.warnings.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentStage("MAPPING_PREVIEW")}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-900 cursor-pointer underline"
                >
                  Kembali ke Mapping &amp; Preview
                </button>
              </div>

              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {validationResult.warnings.map((w, idx) => (
                  <div key={idx} className="p-3 text-xs flex items-start gap-2.5">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 shrink-0 mt-0.5">
                      {w.code}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-800 font-medium">{w.message}</p>
                      {w.paramName && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Lokasi: Parameter <strong>{w.paramName}</strong>
                          {w.indicatorName ? ` > Indikator: ${w.indicatorName}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ringkasan Konfirmasi Master Template yang Akan Disimpan */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Ringkasan Konfirmasi Penyimpanan
            </h3>

            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs space-y-2">
              <div className="flex justify-between border-b border-slate-200/80 pb-1.5 items-center">
                <span className="text-slate-500 font-medium">Status Publikasi:</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                  <Check className="w-3 h-3 text-emerald-600" />
                  Auto Publish (Aktif)
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-200/80 pb-1.5">
                <span className="text-slate-500 font-medium">Nama Master Template:</span>
                <span className="font-bold text-slate-900">{templateName}</span>
              </div>
              {(employeeName || detectedEmployeeName || selectedNik || detectedEmployeeNik) && (
                <div className="flex justify-between border-b border-slate-200/80 pb-1.5 items-center">
                  <span className="text-slate-500 font-medium">Penugasan Otomatis:</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs">
                    👤 {selectedNik || detectedEmployeeNik ? `${selectedNik || detectedEmployeeNik} - ` : ""}
                    {employeeName || detectedEmployeeName}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-b border-slate-200/80 pb-1.5">
                <span className="text-slate-500 font-medium">Departemen:</span>
                <span className="font-semibold text-slate-800">{selectedDept?.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/80 pb-1.5">
                <span className="text-slate-500 font-medium">Job Level:</span>
                <span className="font-semibold text-slate-800">{selectedLevel?.name}</span>
              </div>
              {detectedJobPosition && (
                <div className="flex justify-between border-b border-slate-200/80 pb-1.5">
                  <span className="text-slate-500 font-medium">Job Position:</span>
                  <span className="font-semibold text-slate-800">{detectedJobPosition}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-slate-200/80 pb-1.5">
                <span className="text-slate-500 font-medium">Periode Tahun:</span>
                <span className="font-semibold text-slate-800">{periodYear}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Struktur Parameter / Indikator:</span>
                <span className="font-bold text-blue-700">
                  {validationResult.paramCount} Parameter | {validationResult.indicatorCount} Indikator (Total Bobot {validationResult.totalWeightPct}%)
                </span>
              </div>
            </div>
          </div>

          {/* Toolbar Navigasi Stage 3 */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentStage("MAPPING_PREVIEW")}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali ke Mapping &amp; Preview</span>
              </button>
              <button
                type="button"
                onClick={handleCancelImport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100/80 text-xs font-semibold text-rose-700 transition cursor-pointer shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Batalkan &amp; Bersihkan</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={!validationResult.isValid || isSaving}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memproses Publish &amp; Penugasan...</span>
                </>
              ) : (
                <>
                  <FileCheck2 className="w-4 h-4" />
                  <span>Publish &amp; Tugaskan ke Karyawan</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* KONFIRMASI SUKSES TERSIMPAN                                          */}
      {/* ==================================================================== */}
      {currentStage === "SUCCESS" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-8 text-center space-y-6 max-w-xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-bold text-slate-900">
              Master Template Berhasil Dipublish &amp; Ditugaskan
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
              Template telah resmi <strong>dipublish (aktif)</strong> dan otomatis <strong>ditugaskan ke karyawan</strong> terkait. Anda tinggal menentukan Penilai / Asesor di menu Penugasan.
            </p>
          </div>

          {/* Rincian Template Tersimpan */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-left space-y-2">
            <div className="flex justify-between border-b border-slate-200/80 pb-1.5">
              <span className="text-slate-500 font-medium">Nama Template:</span>
              <span className="font-bold text-slate-900">{createdTemplateName}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200/80 pb-1.5 items-center">
              <span className="text-slate-500 font-medium">Status Publikasi:</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <Check className="w-3 h-3 text-emerald-600" />
                PUBLISHED (Aktif)
              </span>
            </div>
            {(employeeName || detectedEmployeeName || selectedNik || detectedEmployeeNik) && (
              <div className="flex justify-between border-b border-slate-200/80 pb-1.5 items-center">
                <span className="text-slate-500 font-medium">Ditugaskan ke:</span>
                <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  👤 {selectedNik || detectedEmployeeNik ? `${selectedNik || detectedEmployeeNik} - ` : ""}
                  {employeeName || detectedEmployeeName}
                </span>
              </div>
            )}
            <div className="flex justify-between border-b border-slate-200/80 pb-1.5">
              <span className="text-slate-500 font-medium">Departemen:</span>
              <span className="font-semibold text-slate-800">{selectedDept?.name}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200/80 pb-1.5">
              <span className="text-slate-500 font-medium">Job Level:</span>
              <span className="font-semibold text-slate-800">{selectedLevel?.name}</span>
            </div>
            {selectedPosition && (
              <div className="flex justify-between border-b border-slate-200/80 pb-1.5">
                <span className="text-slate-500 font-medium">Job Position:</span>
                <span className="font-semibold text-slate-800">{selectedPosition.name}</span>
              </div>
            )}
            <div className="flex justify-between border-b border-slate-200/80 pb-1.5">
              <span className="text-slate-500 font-medium">Periode:</span>
              <span className="font-semibold text-slate-800">{periodYear}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Total Parameter / Indikator:</span>
              <span className="font-bold text-blue-700">
                {parsedCategories.length} Parameter ({parsedCategories.reduce((acc, c) => acc + c.params.length, 0)} Indikator)
              </span>
            </div>
          </div>

          {/* Aksi Lanjutan */}
          <div className="flex items-center justify-center flex-wrap gap-2.5 pt-2">
            <button
              type="button"
              onClick={resetImportFlow}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Import File Lain</span>
            </button>

            <button
              type="button"
              onClick={() => router.push("/setup/templates")}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs"
            >
              <span>Daftar Template</span>
            </button>

            <button
              type="button"
              onClick={() => router.push("/setup/assignments?tab=penugasan-asesor")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
            >
              <span>Tugaskan Penilai (Asesor)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

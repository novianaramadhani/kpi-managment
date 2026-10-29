"use client";

import React, { useState, useMemo, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  type ApprovalWorkflowConfig,
  type WorkflowMode,
  type WorkflowStageConfig,
  type ApproverBasis,
  type HierarchyRelationType,
  type StageScopeType,
  type RevisionRuleType,
  type WorkflowVersionRecord,
  type MasterResolutionContext,
} from "@/lib/approval-workflow-utils";
import {
  saveWorkflowDraftAction,
  publishWorkflowConfigAction,
  rollbackWorkflowVersionAction,
} from "@/lib/approval-actions";

interface StagingApprovalRbacClientProps {
  initialState: {
    publishedConfig: ApprovalWorkflowConfig;
    draftConfig: ApprovalWorkflowConfig | null;
    hasUnpublishedDraft: boolean;
    versions: WorkflowVersionRecord[];
  };
  masterContext: MasterResolutionContext;
}

interface SearchableNikSelectProps {
  employees: MasterResolutionContext["allEmployees"];
  selectedEmployeeId: number | null | undefined;
  defaultOptionLabel: string;
  onSelectEmployee: (emp: MasterResolutionContext["allEmployees"][0] | null) => void;
  ariaLabel?: string;
}

function SearchableNikSelect({
  employees,
  selectedEmployeeId,
  defaultOptionLabel,
  onSelectEmployee,
  ariaLabel,
}: SearchableNikSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedEmp = useMemo(
    () => (selectedEmployeeId ? employees.find((e) => e.id === selectedEmployeeId) || null : null),
    [employees, selectedEmployeeId]
  );

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.nik.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        (e.jobPosition || "").toLowerCase().includes(q)
    );
  }, [employees, query]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const displayText = selectedEmp
    ? `${selectedEmp.nik} - ${selectedEmp.name}`
    : defaultOptionLabel;

  return (
    <div ref={containerRef} className="relative w-full max-w-[260px]">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => {
          setOpen((prev) => !prev);
          setQuery("");
        }}
        className="mt-0.5 flex w-full items-center justify-between gap-2 border-b border-slate-200 bg-transparent py-0.5 text-left text-[11px] font-medium text-sky-800 hover:border-sky-400 focus:border-sky-500 focus:outline-hidden cursor-pointer"
      >
        <span className="truncate">{displayText}</span>
        <span className="text-[10px] text-slate-400 shrink-0">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari NIK atau nama karyawan..."
            className="mb-1.5 w-full rounded border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:outline-hidden"
          />

          <div className="max-h-52 overflow-y-auto divide-y divide-slate-50 text-xs">
            <button
              type="button"
              onClick={() => {
                onSelectEmployee(null);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition cursor-pointer ${
                !selectedEmp
                  ? "bg-sky-50 font-semibold text-sky-900"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="truncate">{defaultOptionLabel}</span>
            </button>

            {filteredEmployees.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-slate-400">
                Karyawan tidak ditemukan
              </div>
            ) : (
              filteredEmployees.map((emp) => {
                const isSelected = selectedEmp?.id === emp.id;
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => {
                      onSelectEmployee(emp);
                      setOpen(false);
                    }}
                    className={`flex w-full flex-col rounded px-2 py-1.5 text-left transition cursor-pointer ${
                      isSelected
                        ? "bg-sky-50 text-sky-950"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="font-medium truncate">
                      {emp.nik} - {emp.name}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate">
                      {emp.jobPosition}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function StagingApprovalRbacClient({
  initialState,
  masterContext,
}: StagingApprovalRbacClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [publishedConfig, setPublishedConfig] = useState<ApprovalWorkflowConfig>(
    initialState.publishedConfig
  );
  const [hasDraft, setHasDraft] = useState<boolean>(initialState.hasUnpublishedDraft);
  const [versions, setVersions] = useState<WorkflowVersionRecord[]>(initialState.versions);

  const [config, setConfig] = useState<ApprovalWorkflowConfig>(
    initialState.draftConfig || initialState.publishedConfig
  );
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState<boolean>(false);

  const activeEmployees = useMemo(
    () => masterContext.allEmployees.filter((e) => e.isActive),
    [masterContext.allEmployees]
  );

  const sortedStages = useMemo(
    () => [...(config.stages || [])].sort((a, b) => a.order - b.order),
    [config.stages]
  );

  const getStageAutoLabel = (st: WorkflowStageConfig): string => {
    if (st.approverBy === "HIERARCHY") {
      return st.hierarchyRelation === "MANAGER"
        ? "Otomatis: Manager Karyawan"
        : st.hierarchyRelation === "APPRAISER"
        ? "Otomatis: Penilai"
        : "Otomatis: Head Dept Karyawan";
    }
    if (st.approverBy === "ROLE") {
      return `Otomatis: Role ${st.roleCode || "HR"}`;
    }
    if (st.approverBy === "JOB_LEVEL") {
      const lvl = masterContext.allJobLevels.find((l) => l.id === st.jobLevelId);
      return `Otomatis: Level ${lvl?.name || "-"}`;
    }
    if (st.approverBy === "JOB_POSITION") {
      const pos = masterContext.allJobPositions.find((p) => p.id === st.jobPositionId);
      return `Otomatis: Jabatan ${pos?.name || "-"}`;
    }
    return "Pilih NIK Approver...";
  };

  const handleSelectMode = (mode: WorkflowMode) => {
    setConfig((prev) => ({ ...prev, mode }));
    setFeedback(null);
  };

  const handleAddStage = () => {
    setConfig((prev) => {
      const nextOrder = prev.stages.length + 1;
      const newStage: WorkflowStageConfig = {
        id: `stage-${Date.now()}`,
        stageKey: `STAGE_${nextOrder}`,
        order: nextOrder,
        name: `Tahap ${nextOrder}`,
        description: `Tahap ${nextOrder}`,
        approverBy: "HIERARCHY",
        hierarchyRelation: "HEAD_DEPT",
        roleCode: "HEAD_DEPT",
        scopeType: "OWN_DEPT",
        customDepartmentIds: [],
        canEditScore: false,
        revisionRule: "PREVIOUS_STAGE",
        isMandatory: true,
        autoSkipIfSameAsPrevious: false,
      };
      return {
        ...prev,
        stages: [...prev.stages, newStage],
      };
    });
  };

  const handleUpdateStage = (stageId: string, patch: Partial<WorkflowStageConfig>) => {
    setConfig((prev) => ({
      ...prev,
      stages: prev.stages.map((st) => (st.id === stageId ? { ...st, ...patch } : st)),
    }));
  };

  // Pilih NIK approver langsung dari kartu View per staging
  const handleSelectStageEmployeeFromCard = (
    stage: WorkflowStageConfig,
    emp: MasterResolutionContext["allEmployees"][0] | null
  ) => {
    if (!emp) {
      const key = (stage.stageKey || stage.name || "").toUpperCase();
      if (key.includes("HR")) {
        handleUpdateStage(stage.id, {
          approverBy: "ROLE",
          roleCode: "HR",
          specificEmployeeId: null,
          specificEmployeeNik: null,
          specificEmployeeName: null,
        });
      } else if (key.includes("MANAGER")) {
        handleUpdateStage(stage.id, {
          approverBy: "HIERARCHY",
          hierarchyRelation: "MANAGER",
          specificEmployeeId: null,
          specificEmployeeNik: null,
          specificEmployeeName: null,
        });
      } else {
        handleUpdateStage(stage.id, {
          approverBy: "HIERARCHY",
          hierarchyRelation: "HEAD_DEPT",
          specificEmployeeId: null,
          specificEmployeeNik: null,
          specificEmployeeName: null,
        });
      }
      return;
    }

    handleUpdateStage(stage.id, {
      approverBy: "NIK",
      specificEmployeeId: emp.id,
      specificEmployeeNik: emp.nik,
      specificEmployeeName: emp.name,
    });
  };

  const handleDeleteStage = (stageId: string) => {
    setConfig((prev) => {
      const remaining = prev.stages
        .filter((st) => st.id !== stageId)
        .map((st, idx) => ({ ...st, order: idx + 1 }));
      return {
        ...prev,
        stages: remaining,
      };
    });
  };

  const handleMoveStage = (index: number, direction: "UP" | "DOWN") => {
    setConfig((prev) => {
      const arr = [...prev.stages];
      const targetIdx = direction === "UP" ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= arr.length) return prev;
      const temp = arr[index];
      arr[index] = arr[targetIdx];
      arr[targetIdx] = temp;
      return {
        ...prev,
        stages: arr.map((st, idx) => ({ ...st, order: idx + 1 })),
      };
    });
  };

  const handleToggleCustomDept = (stageId: string, deptId: number) => {
    setConfig((prev) => ({
      ...prev,
      stages: prev.stages.map((st) => {
        if (st.id !== stageId) return st;
        const cur = st.customDepartmentIds || [];
        const exists = cur.includes(deptId);
        return {
          ...st,
          customDepartmentIds: exists ? cur.filter((id) => id !== deptId) : [...cur, deptId],
        };
      }),
    }));
  };

  const handleSaveDraft = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await saveWorkflowDraftAction({ config });
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "Gagal menyimpan draft." });
        return;
      }
      if (res.draftConfig) setConfig(res.draftConfig);
      setHasDraft(true);
      setFeedback({ type: "info", message: "Draft tersimpan." });
      router.refresh();
    });
  };

  const handlePublishConfig = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await publishWorkflowConfigAction({ config });
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "Gagal menyimpan konfigurasi." });
        return;
      }
      if (res.publishedConfig) {
        setPublishedConfig(res.publishedConfig);
        setConfig(res.publishedConfig);
      }
      if (res.versions) setVersions(res.versions);
      setHasDraft(false);
      setFeedback({
        type: "success",
        message: `Alur v${res.publishedConfig?.version} telah diterapkan.`,
      });
      router.refresh();
    });
  };

  const handleRollback = (versionNumber: number) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await rollbackWorkflowVersionAction({ targetVersionNumber: versionNumber });
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "Gagal mengaktifkan versi." });
        return;
      }
      if (res.publishedConfig) {
        setPublishedConfig(res.publishedConfig);
        setConfig(res.publishedConfig);
      }
      if (res.versions) setVersions(res.versions);
      setHasDraft(false);
      setShowVersionHistory(false);
      setFeedback({
        type: "success",
        message: `Versi v${versionNumber} diaktifkan kembali.`,
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 text-slate-800">
      {/* 1. TOOLBAR ATAS MINIMALIS */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="workflow-mode-select" className="text-xs font-medium text-slate-500">
              Mode Alur:
            </label>
            <select
              id="workflow-mode-select"
              value={config.mode}
              onChange={(e) => handleSelectMode(e.target.value as WorkflowMode)}
              className="border-b border-slate-300 bg-transparent py-1 pr-6 text-xs font-semibold text-slate-800 focus:border-sky-500 focus:outline-hidden cursor-pointer"
            >
              <option value="DIRECT_TO_REPORT">Langsung ke Report</option>
              <option value="SINGLE_HR_VALIDATION">Validasi HR (By NIK)</option>
              <option value="MULTI_STAGE">Persetujuan Berjenjang</option>
            </select>
          </div>

          {config.mode === "MULTI_STAGE" && (
            <button
              type="button"
              onClick={handleAddStage}
              className="text-xs font-semibold text-sky-700 hover:text-sky-900 transition cursor-pointer"
            >
              + Tambah Tahap
            </button>
          )}

          {hasDraft && (
            <span className="text-[11px] text-amber-700 font-medium">
              • Draft belum disimpan
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowVersionHistory((prev) => !prev)}
            className="text-xs text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            {showVersionHistory ? "Tutup Riwayat" : `Riwayat (v${publishedConfig.version})`}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={handleSaveDraft}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50 transition cursor-pointer"
          >
            Draft
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={handlePublishConfig}
            className="rounded-md bg-sky-100/90 px-3.5 py-1.5 text-xs font-semibold text-sky-950 hover:bg-sky-200/80 disabled:opacity-50 transition cursor-pointer"
          >
            {isPending ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>

      {/* FEEDBACK INLINE */}
      {feedback && (
        <div
          className={`flex items-center justify-between border-l-2 pl-3 py-1 text-xs ${
            feedback.type === "success"
              ? "border-emerald-500 text-emerald-700"
              : feedback.type === "error"
              ? "border-rose-500 text-rose-700"
              : "border-sky-500 text-sky-800"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* RIWAYAT VERSI (HANYA MUNCUL JIKA DIKLIK) */}
      {showVersionHistory && (
        <div className="border-y border-slate-200 py-2 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] text-slate-400 font-medium">
                <th className="py-1.5 pr-3 w-16">Versi</th>
                <th className="py-1.5 px-3">Ringkasan</th>
                <th className="py-1.5 px-3 w-32">Oleh</th>
                <th className="py-1.5 px-3 w-28">Tanggal</th>
                <th className="py-1.5 pl-3 text-right w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {versions.map((ver) => {
                const isCurrent = ver.versionNumber === publishedConfig.version;
                return (
                  <tr key={ver.versionNumber}>
                    <td className="py-1.5 pr-3 font-semibold text-slate-700">
                      v{ver.versionNumber}
                    </td>
                    <td className="py-1.5 px-3 text-slate-600">{ver.summary}</td>
                    <td className="py-1.5 px-3 text-slate-500">{ver.publishedBy}</td>
                    <td className="py-1.5 px-3 text-slate-400">
                      {new Date(ver.publishedAt).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-1.5 pl-3 text-right">
                      {!isCurrent ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleRollback(ver.versionNumber)}
                          className="text-[11px] font-medium text-sky-700 hover:underline cursor-pointer"
                        >
                          Pakai
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Aktif</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 2. TABEL TAHAPAN (KHUSUS MODE BERJENJANG UNTUK EDIT NAMA & ATURAN DETAIL) */}
      {config.mode === "MULTI_STAGE" && (
        <div className="border-y border-slate-200 bg-white">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-sky-50/70 text-[11px] font-semibold text-sky-950">
                <th className="py-2.5 px-3 w-14 text-center">#</th>
                <th className="py-2.5 px-3 w-48">Tahap</th>
                <th className="py-2.5 px-3">Approver</th>
                <th className="py-2.5 px-3 w-44">Cakupan</th>
                <th className="py-2.5 px-3 w-52">Opsi</th>
                <th className="py-2.5 px-2 text-center w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {config.stages.map((stage, idx) => {
                const isExpanded = expandedStageId === stage.id;
                return (
                  <React.Fragment key={stage.id}>
                    <tr className="hover:bg-slate-50/50 align-middle">
                      <td className="py-2 px-3 text-center">
                        <div className="inline-flex items-center gap-1">
                          <span className="font-medium text-slate-500 w-3">{idx + 1}</span>
                          <div className="flex flex-col">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveStage(idx, "UP")}
                              className="text-[9px] leading-none text-slate-300 hover:text-sky-700 disabled:opacity-20 cursor-pointer"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              disabled={idx === config.stages.length - 1}
                              onClick={() => handleMoveStage(idx, "DOWN")}
                              className="text-[9px] leading-none text-slate-300 hover:text-sky-700 disabled:opacity-20 cursor-pointer"
                            >
                              ▼
                            </button>
                          </div>
                        </div>
                      </td>

                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={stage.name}
                          onChange={(e) =>
                            handleUpdateStage(stage.id, {
                              name: e.target.value,
                              description: e.target.value,
                            })
                          }
                          placeholder="Nama tahap..."
                          className="w-full rounded px-1.5 py-1 text-xs font-semibold text-slate-800 bg-transparent hover:bg-slate-100/70 focus:bg-sky-50/50 focus:outline-hidden"
                        />
                      </td>

                      <td className="py-2 px-3">
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                          <select
                            value={stage.approverBy}
                            onChange={(e) =>
                              handleUpdateStage(stage.id, {
                                approverBy: e.target.value as ApproverBasis,
                              })
                            }
                            className="rounded px-1.5 py-1 text-xs text-slate-500 bg-transparent hover:bg-slate-100/70 focus:bg-sky-50/50 focus:outline-hidden cursor-pointer"
                          >
                            <option value="HIERARCHY">Atasan</option>
                            <option value="NIK">By NIK</option>
                            <option value="ROLE">Role</option>
                            <option value="JOB_LEVEL">Level</option>
                            <option value="JOB_POSITION">Jabatan</option>
                          </select>

                          <span className="text-slate-300">/</span>

                          {stage.approverBy === "HIERARCHY" && (
                            <select
                              value={stage.hierarchyRelation || "HEAD_DEPT"}
                              onChange={(e) => {
                                const rel = e.target.value as HierarchyRelationType;
                                handleUpdateStage(stage.id, {
                                  hierarchyRelation: rel,
                                  stageKey:
                                    rel === "HEAD_DEPT"
                                      ? "HEAD_DEPT"
                                      : rel === "MANAGER"
                                      ? "MANAGER"
                                      : stage.stageKey,
                                });
                              }}
                              className="flex-1 rounded px-1.5 py-1 text-xs font-medium text-slate-800 bg-transparent hover:bg-slate-100/70 focus:bg-sky-50/50 focus:outline-hidden cursor-pointer"
                            >
                              <option value="HEAD_DEPT">Head Dept</option>
                              <option value="MANAGER">Manager</option>
                              <option value="APPRAISER">Penilai</option>
                            </select>
                          )}

                          {stage.approverBy === "NIK" && (
                            <SearchableNikSelect
                              employees={activeEmployees}
                              selectedEmployeeId={stage.specificEmployeeId}
                              defaultOptionLabel="Pilih NIK..."
                              onSelectEmployee={(emp) =>
                                handleUpdateStage(stage.id, {
                                  specificEmployeeId: emp ? emp.id : null,
                                  specificEmployeeNik: emp ? emp.nik : null,
                                  specificEmployeeName: emp ? emp.name : null,
                                })
                              }
                            />
                          )}

                          {stage.approverBy === "ROLE" && (
                            <select
                              value={stage.roleCode || "HR"}
                              onChange={(e) =>
                                handleUpdateStage(stage.id, {
                                  roleCode: e.target.value,
                                  stageKey: e.target.value === "HR" ? "HR" : stage.stageKey,
                                })
                              }
                              className="flex-1 rounded px-1.5 py-1 text-xs font-medium text-slate-800 bg-transparent hover:bg-slate-100/70 focus:bg-sky-50/50 focus:outline-hidden cursor-pointer"
                            >
                              <option value="HEAD_DEPT">HEAD_DEPT</option>
                              <option value="MANAGER">MANAGER</option>
                              <option value="HR">HR</option>
                              <option value="PENILAI">PENILAI</option>
                              <option value="ADMIN">ADMIN</option>
                            </select>
                          )}

                          {stage.approverBy === "JOB_LEVEL" && (
                            <select
                              value={stage.jobLevelId || ""}
                              onChange={(e) =>
                                handleUpdateStage(stage.id, {
                                  jobLevelId: e.target.value ? Number(e.target.value) : null,
                                })
                              }
                              className="flex-1 rounded px-1.5 py-1 text-xs font-medium text-slate-800 bg-transparent hover:bg-slate-100/70 focus:bg-sky-50/50 focus:outline-hidden cursor-pointer"
                            >
                              <option value="">Pilih Level...</option>
                              {masterContext.allJobLevels.map((lvl) => (
                                <option key={lvl.id} value={lvl.id}>
                                  {lvl.name}
                                </option>
                              ))}
                            </select>
                          )}

                          {stage.approverBy === "JOB_POSITION" && (
                            <select
                              value={stage.jobPositionId || ""}
                              onChange={(e) =>
                                handleUpdateStage(stage.id, {
                                  jobPositionId: e.target.value ? Number(e.target.value) : null,
                                })
                              }
                              className="flex-1 rounded px-1.5 py-1 text-xs font-medium text-slate-800 bg-transparent hover:bg-slate-100/70 focus:bg-sky-50/50 focus:outline-hidden cursor-pointer"
                            >
                              <option value="">Pilih Jabatan...</option>
                              {masterContext.allJobPositions.map((pos) => (
                                <option key={pos.id} value={pos.id}>
                                  {pos.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>

                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1">
                          <select
                            value={stage.scopeType}
                            onChange={(e) => {
                              const nextScope = e.target.value as StageScopeType;
                              handleUpdateStage(stage.id, { scopeType: nextScope });
                              setExpandedStageId(nextScope === "CUSTOM_DEPT" ? stage.id : null);
                            }}
                            className="w-full rounded px-1.5 py-1 text-xs text-slate-700 bg-transparent hover:bg-slate-100/70 focus:bg-sky-50/50 focus:outline-hidden cursor-pointer"
                          >
                            <option value="OWN_DEPT">Dept Karyawan</option>
                            <option value="ALL_DEPT">Semua Dept</option>
                            <option value="CUSTOM_DEPT">
                              Pilih ({(stage.customDepartmentIds || []).length})
                            </option>
                          </select>
                          {stage.scopeType === "CUSTOM_DEPT" && (
                            <button
                              type="button"
                              onClick={() => setExpandedStageId(isExpanded ? null : stage.id)}
                              className="text-[11px] text-sky-700 hover:underline shrink-0 cursor-pointer"
                            >
                              {isExpanded ? "Tutup" : "Atur"}
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-2 px-3">
                        <div className="flex items-center gap-3 text-[11px] text-slate-600">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={stage.canEditScore}
                              onChange={(e) =>
                                handleUpdateStage(stage.id, { canEditScore: e.target.checked })
                              }
                              className="h-3.5 w-3.5 accent-sky-600"
                            />
                            <span>Edit Nilai</span>
                          </label>

                          <select
                            value={stage.revisionRule}
                            onChange={(e) =>
                              handleUpdateStage(stage.id, {
                                revisionRule: e.target.value as RevisionRuleType,
                              })
                            }
                            className="rounded px-1 py-0.5 text-[11px] text-slate-500 bg-transparent hover:bg-slate-100/70 focus:outline-hidden cursor-pointer"
                          >
                            <option value="PREVIOUS_STAGE">Revisi -1</option>
                            <option value="DIRECT_TO_PENILAI">Ke Penilai</option>
                          </select>
                        </div>
                      </td>

                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          disabled={config.stages.length <= 1}
                          onClick={() => handleDeleteStage(stage.id)}
                          className="text-sm text-slate-300 hover:text-rose-600 disabled:opacity-20 transition cursor-pointer"
                          title="Hapus tahap"
                        >
                          ×
                        </button>
                      </td>
                    </tr>

                    {isExpanded && stage.scopeType === "CUSTOM_DEPT" && (
                      <tr className="bg-slate-50/40">
                        <td colSpan={6} className="px-4 py-2">
                          <div className="flex flex-wrap gap-3">
                            {masterContext.allDepartments.map((dept) => {
                              const checked = (stage.customDepartmentIds || []).includes(dept.id);
                              return (
                                <label
                                  key={dept.id}
                                  className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => handleToggleCustomDept(stage.id, dept.id)}
                                    className="h-3 w-3 accent-sky-600"
                                  />
                                  <span>{dept.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. KARTU VIEW ALUR PERSETUJUAN (DENGAN FITUR SEARCH NIK PER STAGING) */}
      <div className="border border-slate-200 bg-white rounded-xl px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            <span className="text-xs font-semibold text-slate-800">
              Pratinjau Tampilan Alur pada Form KPI
            </span>
          </div>

          {config.mode === "DIRECT_TO_REPORT" && (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={config.directConfig.autoLockOnSubmit}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    directConfig: {
                      ...prev.directConfig,
                      autoLockOnSubmit: e.target.checked,
                    },
                  }))
                }
                className="h-3.5 w-3.5 accent-sky-600"
              />
              <span>Kunci otomatis setelah submit</span>
            </label>
          )}

          {config.mode === "SINGLE_HR_VALIDATION" && (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={config.singleHrConfig.canEditScore}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    singleHrConfig: {
                      ...prev.singleHrConfig,
                      canEditScore: e.target.checked,
                    },
                  }))
                }
                className="h-3.5 w-3.5 accent-sky-600"
              />
              <span>HR bisa koreksi nilai</span>
            </label>
          )}

          {config.mode === "MULTI_STAGE" && (
            <span className="text-[11px] text-slate-400">
              Klik pada setiap tahap untuk mencari &amp; memilih NIK pejabat approver
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-3.5">
          {/* TAHAP 1: PENILAI (TANPA TULISAN ATASAN LANGSUNG) */}
          <div className="flex items-center gap-2.5 min-w-[120px] flex-1">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500 text-xs font-semibold text-white">
              1
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-800 truncate">Penilai</div>
            </div>
            <span className="hidden sm:inline text-slate-300 text-xs shrink-0">&rsaquo;</span>
          </div>

          {/* TAHAP TENGAH: MODE VALIDASI HR (DENGAN SEARCH NIK) */}
          {config.mode === "SINGLE_HR_VALIDATION" && (
            <div className="flex items-center gap-2.5 min-w-[240px] flex-1">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                2
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-800 truncate">Validasi HR</div>
                <SearchableNikSelect
                  employees={activeEmployees}
                  selectedEmployeeId={config.singleHrConfig.validatorEmployeeId}
                  defaultOptionLabel="Semua Akun Role HR (Semua Dept)"
                  ariaLabel="Cari & Pilih NIK Approver Validasi HR"
                  onSelectEmployee={(emp) =>
                    setConfig((prev) => ({
                      ...prev,
                      singleHrConfig: {
                        ...prev.singleHrConfig,
                        validatorEmployeeId: emp ? emp.id : null,
                        validatorNik: emp ? emp.nik : null,
                        validatorName: emp ? emp.name : null,
                        validatorJobPosition: emp ? emp.jobPosition : null,
                      },
                    }))
                  }
                />
              </div>
              <span className="hidden sm:inline text-slate-300 text-xs shrink-0">&rsaquo;</span>
            </div>
          )}

          {/* TAHAP TENGAH: MODE BERJENJANG (DENGAN SEARCH NIK PER STAGING) */}
          {config.mode === "MULTI_STAGE" &&
            sortedStages.map((stage, idx) => {
              const stepNum = idx + 2;
              const selectedEmployeeId =
                stage.approverBy === "NIK" ? stage.specificEmployeeId : null;

              return (
                <div
                  key={stage.id}
                  className="flex items-center gap-2.5 min-w-[200px] flex-1"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {stepNum}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-800 truncate">
                      {stage.name || `Tahap ${idx + 1}`}
                    </div>
                    <SearchableNikSelect
                      employees={activeEmployees}
                      selectedEmployeeId={selectedEmployeeId}
                      defaultOptionLabel={getStageAutoLabel(stage)}
                      ariaLabel={`Cari & Pilih NIK Approver untuk ${stage.name}`}
                      onSelectEmployee={(emp) => handleSelectStageEmployeeFromCard(stage, emp)}
                    />
                  </div>
                  <span className="hidden sm:inline text-slate-300 text-xs shrink-0">&rsaquo;</span>
                </div>
              );
            })}

          {/* TAHAP AKHIR: FINAL */}
          <div className="flex items-center gap-2.5 min-w-[140px] flex-1">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
              {config.mode === "DIRECT_TO_REPORT"
                ? 2
                : config.mode === "SINGLE_HR_VALIDATION"
                ? 3
                : sortedStages.length + 2}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-800 truncate">Final</div>
              <div className="text-[11px] text-slate-500 truncate">KPI Resmi (Report)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

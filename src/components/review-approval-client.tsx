"use client";

import React, { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import {
  CheckCircle2,
  Award,
  Eye,
  Pencil,
  Lock,
  Search,
  X,
  FileCheck2,
  FileText,
  Clock,
  Sparkles,
  ExternalLink,
  RotateCcw,
  Check,
  AlertTriangle,
} from "lucide-react";
import { fmtPct, performanceActionOf } from "@/lib/scoring";
import { setAppraisalStatus } from "@/lib/actions";
import {
  getAppraisalReviewDetailAction,
  validateAppraisalByHeadDeptAction,
  validateAppraisalByManagerAction,
  approveAppraisalByHrAction,
} from "@/lib/approval-actions";
import type { MonthlyAssessmentDetailResult } from "@/types/monthly-assessment";

export interface ReviewItem {
  id: number;
  status: string;
  currentStage?: string | null;
  rejectionReason?: string | null;
  finalScore: number;
  notes: string | null;
  employeeId: number;
  empName: string;
  nik: string;
  jobPosition: string;
  levelName: string;
  operatingUnit: string;
  deptId: number;
  deptName: string;
  appraiserId: number | null;
  appraiserName: string;
  submittedAt?: string | Date | null;
  headDeptApprovedAt?: string | Date | null;
  headDeptNotes?: string | null;
  managerValidatedAt?: string | Date | null;
  managerNotes?: string | null;
  hrApprovedAt?: string | Date | null;
  hrNotes?: string | null;
  reviewedAt?: string | Date | null;
  finalizedAt?: string | Date | null;
}

interface ReviewApprovalClientProps {
  items: ReviewItem[];
  departments: { id: number; name: string }[];
  periodName: string;
  userRole?: string;
  currentUser?: { id?: number | null; name: string; role: string } | null;
}

type TabType =
  | "PENDING_HEAD_DEPT"
  | "PENDING_MANAGER"
  | "PENDING_HR"
  | "REVISED"
  | "FINAL"
  | "DRAFT"
  | "ALL";

export function ReviewApprovalClient({
  items,
  departments,
  periodName,
  userRole = "ADMIN",
  currentUser,
}: ReviewApprovalClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Modal Review Form States
  const [selectedReviewItem, setSelectedReviewItem] = useState<ReviewItem | null>(null);
  const [reviewDetail, setReviewDetail] = useState<MonthlyAssessmentDetailResult | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Active Tab: Default according to logged in user role
  const defaultTab: TabType = useMemo(() => {
    const role = (userRole || "ADMIN").toUpperCase();
    if (role === "HEAD_DEPT") return "PENDING_HEAD_DEPT";
    if (role === "MANAGER") return "PENDING_MANAGER";
    if (role === "HR") return "PENDING_HR";
    return "PENDING_HEAD_DEPT";
  }, [userRole]);

  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState<string>("ALL");
  const [selectedOU, setSelectedOU] = useState<string>("ALL");

  // Tab Counts
  const counts = useMemo(() => {
    let pendingHead = 0;
    let pendingMgr = 0;
    let pendingHr = 0;
    let revised = 0;
    let final = 0;
    let draft = 0;

    items.forEach((it) => {
      const st = it.status.toUpperCase();
      if (st === "PENDING_HEAD_DEPT" || st === "SUBMITTED") pendingHead++;
      else if (st === "PENDING_MANAGER") pendingMgr++;
      else if (st === "PENDING_HR" || st === "REVIEWED") pendingHr++;
      else if (st.startsWith("REVISED_")) revised++;
      else if (st === "FINAL") final++;
      else draft++;
    });

    return {
      PENDING_HEAD_DEPT: pendingHead,
      PENDING_MANAGER: pendingMgr,
      PENDING_HR: pendingHr,
      REVISED: revised,
      FINAL: final,
      DRAFT: draft,
      ALL: items.length,
    };
  }, [items]);

  // Filtered List
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Tab filter
      const st = item.status.toUpperCase();
      if (activeTab === "PENDING_HEAD_DEPT" && st !== "PENDING_HEAD_DEPT" && st !== "SUBMITTED") {
        return false;
      }
      if (activeTab === "PENDING_MANAGER" && st !== "PENDING_MANAGER") {
        return false;
      }
      if (activeTab === "PENDING_HR" && st !== "PENDING_HR" && st !== "REVIEWED") {
        return false;
      }
      if (activeTab === "REVISED" && !st.startsWith("REVISED_")) {
        return false;
      }
      if (activeTab === "FINAL" && st !== "FINAL") {
        return false;
      }
      if (activeTab === "DRAFT" && st !== "DRAFT") {
        return false;
      }

      // Department filter
      if (selectedDept !== "ALL" && String(item.deptId) !== selectedDept) {
        return false;
      }

      // Operating Unit filter
      if (selectedOU !== "ALL" && item.operatingUnit.toUpperCase() !== selectedOU) {
        return false;
      }

      // Search query filter (nama, NIK, jabatan, penilai)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          item.empName.toLowerCase().includes(q) ||
          item.nik.toLowerCase().includes(q) ||
          item.jobPosition.toLowerCase().includes(q) ||
          item.deptName.toLowerCase().includes(q) ||
          item.appraiserName.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [items, activeTab, selectedDept, selectedOU, searchQuery]);

  // Buka Modal Detail Review Penilaian
  const handleOpenReviewModal = async (item: ReviewItem) => {
    setSelectedReviewItem(item);
    setReviewDetail(null);
    setIsLoadingDetail(true);

    try {
      const res = await getAppraisalReviewDetailAction(item.id);
      if (res.success && res.data) {
        setReviewDetail(res.data);
      } else {
        Swal.fire({
          icon: "error",
          title: "Gagal Memuat Detail",
          text: res.error || "Tidak dapat memuat detail formulir penilaian.",
        });
      }
    } catch {
      Swal.fire({
        icon: "error",
        title: "Kesalahan",
        text: "Terjadi kesalahan saat memuat data penilaian.",
      });
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCloseReviewModal = () => {
    setSelectedReviewItem(null);
    setReviewDetail(null);
  };

  // Setujui & Teruskan Berjenjang (Head Dept -> Manager -> HR -> Final)
  const handleApproveForward = async () => {
    if (!selectedReviewItem) return;
    const item = selectedReviewItem;
    const st = item.status.toUpperCase();
    const stage = (item.currentStage || "").toUpperCase();

    const isHeadStage =
      st === "PENDING_HEAD_DEPT" || st === "SUBMITTED" || stage === "HEAD_DEPT";
    const isManagerStage =
      st === "PENDING_MANAGER" || st === "REVISED_MGR" || stage === "MANAGER";
    const isHrStage =
      st === "PENDING_HR" || st === "REVIEWED" || stage === "HR";

    let targetNextText = "ke tahap selanjutnya";
    let targetActionText = "Ya, Setujui & Teruskan";

    if (isHeadStage) {
      targetNextText = "ke Manager Divisi untuk validasi";
      targetActionText = "Ya, Teruskan ke Manager";
    } else if (isManagerStage) {
      targetNextText = "ke HR untuk proses persetujuan akhir";
      targetActionText = "Ya, Teruskan ke HR";
    } else if (isHrStage) {
      targetNextText = "sebagai Selesai & Final (Terkunci Resmi)";
      targetActionText = "Ya, Finalisasi Resmi";
    }

    const { isConfirmed, value: notes } = await Swal.fire({
      title: "Setujui Penilaian?",
      text: `Penilaian kinerja "${item.empName}" akan disetujui dan diteruskan ${targetNextText}.`,
      icon: "question",
      input: "textarea",
      inputPlaceholder: "Tulis catatan review persetujuan (opsional)...",
      showCancelButton: true,
      confirmButtonColor: "#059669",
      cancelButtonColor: "#64748b",
      confirmButtonText: targetActionText,
      cancelButtonText: "Batal",
    });

    if (!isConfirmed) return;

    setIsProcessingAction(true);
    try {
      const actor = {
        id: currentUser?.id ?? null,
        name: currentUser?.name || "Reviewer",
        role: userRole || "ADMIN",
      };

      let res;
      if (isHeadStage) {
        res = await validateAppraisalByHeadDeptAction({
          appraisalId: item.id,
          action: "FORWARD",
          notes: notes || "",
          actor,
        });
      } else if (isManagerStage) {
        res = await validateAppraisalByManagerAction({
          appraisalId: item.id,
          action: "FORWARD",
          notes: notes || "",
          actor,
        });
      } else if (isHrStage) {
        res = await approveAppraisalByHrAction({
          appraisalId: item.id,
          action: "APPROVE",
          notes: notes || "",
          actor,
        });
      } else {
        res = await validateAppraisalByHeadDeptAction({
          appraisalId: item.id,
          action: "FORWARD",
          notes: notes || "",
          actor,
        });
      }

      if (res.success) {
        handleCloseReviewModal();
        await Swal.fire({
          icon: "success",
          title: "Berhasil Disetujui!",
          text: res.message || "Status penilaian berhasil diperbarui.",
          confirmButtonColor: "#059669",
          timer: 1800,
        });
        router.refresh();
      } else {
        Swal.fire({
          icon: "error",
          title: "Gagal Memproses",
          text: res.error || "Terjadi kesalahan saat memproses approval.",
          confirmButtonColor: "#0284c7",
        });
      }
    } catch (err: unknown) {
      Swal.fire({
        icon: "error",
        title: "Kesalahan",
        text: err instanceof Error ? err.message : "Terjadi kesalahan.",
        confirmButtonColor: "#0284c7",
      });
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Kembalikan Penilaian untuk Revisi (ke jenjang sebelumnya)
  const handleRejectRevise = async () => {
    if (!selectedReviewItem) return;
    const item = selectedReviewItem;
    const st = item.status.toUpperCase();
    const stage = (item.currentStage || "").toUpperCase();

    const isHeadStage =
      st === "PENDING_HEAD_DEPT" || st === "SUBMITTED" || stage === "HEAD_DEPT";
    const isManagerStage =
      st === "PENDING_MANAGER" || st === "REVISED_MGR" || stage === "MANAGER";
    const isHrStage =
      st === "PENDING_HR" || st === "REVIEWED" || stage === "HR";

    let targetPrevText = "ke jenjang sebelumnya";
    if (isHeadStage) {
      targetPrevText = "ke Penilai / Supervisor untuk perbaikan nilai";
    } else if (isManagerStage) {
      targetPrevText = "ke Head Department untuk ditinjau ulang";
    } else if (isHrStage) {
      targetPrevText = "ke Manager untuk ditinjau ulang";
    }

    const { isConfirmed, value: notes } = await Swal.fire({
      title: "Kembalikan untuk Revisi?",
      text: `Penilaian kinerja "${item.empName}" akan dikembalikan ${targetPrevText}.`,
      icon: "warning",
      input: "textarea",
      inputPlaceholder: "Tuliskan alasan/catatan revisi yang wajib diperbaiki (wajib)...",
      inputValidator: (val) => (!val?.trim() ? "Alasan revisi wajib diisi." : null),
      showCancelButton: true,
      confirmButtonColor: "#d97706",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Kembalikan untuk Revisi",
      cancelButtonText: "Batal",
    });

    if (!isConfirmed) return;

    setIsProcessingAction(true);
    try {
      const actor = {
        id: currentUser?.id ?? null,
        name: currentUser?.name || "Reviewer",
        role: userRole || "ADMIN",
      };

      let res;
      if (isHeadStage) {
        res = await validateAppraisalByHeadDeptAction({
          appraisalId: item.id,
          action: "REVISE",
          notes: notes || "",
          actor,
        });
      } else if (isManagerStage) {
        res = await validateAppraisalByManagerAction({
          appraisalId: item.id,
          action: "REVISE",
          notes: notes || "",
          actor,
        });
      } else if (isHrStage) {
        res = await approveAppraisalByHrAction({
          appraisalId: item.id,
          action: "REVISE",
          notes: notes || "",
          actor,
        });
      } else {
        res = await validateAppraisalByHeadDeptAction({
          appraisalId: item.id,
          action: "REVISE",
          notes: notes || "",
          actor,
        });
      }

      if (res.success) {
        handleCloseReviewModal();
        await Swal.fire({
          icon: "success",
          title: "Dikembalikan untuk Revisi",
          text: res.message || "Penilaian berhasil dikembalikan untuk revisi.",
          confirmButtonColor: "#d97706",
          timer: 1800,
        });
        router.refresh();
      } else {
        Swal.fire({
          icon: "error",
          title: "Gagal Memproses",
          text: res.error || "Terjadi kesalahan.",
          confirmButtonColor: "#0284c7",
        });
      }
    } catch (err: unknown) {
      Swal.fire({
        icon: "error",
        title: "Kesalahan",
        text: err instanceof Error ? err.message : "Terjadi kesalahan.",
        confirmButtonColor: "#0284c7",
      });
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleFinalize = async (item: ReviewItem) => {
    const confirm = await Swal.fire({
      title: "Finalisasi Penilaian?",
      text: `Kunci nilai akhir ${item.finalScore > 0 ? fmtPct(item.finalScore) : ""} untuk "${item.empName}". Nilai akan dicatat permanen dalam riwayat evaluasi tahunan.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#059669",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Finalisasi Resmi",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const fd = new FormData();
    fd.append("id", String(item.id));
    fd.append("status", "FINAL");

    startTransition(async () => {
      try {
        await setAppraisalStatus(fd);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Penilaian Final!",
          text: `Hasil evaluasi "${item.empName}" telah resmi difinalisasi dan terkunci.`,
          confirmButtonColor: "#059669",
          timer: 1600,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal memfinalisasi.";
        await Swal.fire({ icon: "error", title: "Gagal", text: msg, confirmButtonColor: "#f59e0b" });
      }
    });
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12">
      {/* 1. HEADER HALAMAN: Clean, Modern, Elegant */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 border border-sky-200 shadow-2xs">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Review & Approval
                <span className="text-[11px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                  {periodName}
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Verifikasi pengajuan kinerja bulanan · persetujuan bertingkat Head Dept · finalisasi skor resmi
              </p>
            </div>
          </div>
        </div>

        {/* Quick Links Header */}
        <div className="flex items-center gap-2">
          <Link
            href="/input-kpi"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer"
            title="Buka form teknis pengisian nilai KPI"
          >
            <Pencil className="w-3.5 h-3.5 text-slate-400" />
            <span>Input KPI</span>
          </Link>
          <Link
            href="/report"
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white px-3 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer"
            title="Lihat rekapitulasi laporan evaluasi"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Laporan & Export</span>
          </Link>
        </div>
      </div>

      {/* 2. TABS NAVIGASI: Clean Border-bottom Tabs with 4-Tier Hierarchy Counters */}
      <div className="border-b border-slate-200 flex items-center gap-1 sm:gap-4 overflow-x-auto text-xs font-semibold">
        {/* Menunggu Head Dept */}
        <button
          type="button"
          onClick={() => setActiveTab("PENDING_HEAD_DEPT")}
          className={`pb-2.5 transition flex items-center gap-1.5 relative cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "PENDING_HEAD_DEPT"
              ? "text-sky-600 border-sky-500 font-bold"
              : "text-slate-500 border-transparent hover:text-slate-800"
          }`}
        >
          <span>Menunggu Head Dept</span>
          <span
            className={`rounded-full px-2 py-0.2 text-[11px] ${
              activeTab === "PENDING_HEAD_DEPT"
                ? "bg-sky-100 text-sky-800 font-bold"
                : counts.PENDING_HEAD_DEPT > 0
                ? "bg-amber-100 text-amber-900 font-bold"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {counts.PENDING_HEAD_DEPT}
          </span>
        </button>

        {/* Menunggu Manager */}
        <button
          type="button"
          onClick={() => setActiveTab("PENDING_MANAGER")}
          className={`pb-2.5 transition flex items-center gap-1.5 relative cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "PENDING_MANAGER"
              ? "text-sky-600 border-sky-500 font-bold"
              : "text-slate-500 border-transparent hover:text-slate-800"
          }`}
        >
          <span>Menunggu Manager</span>
          <span
            className={`rounded-full px-2 py-0.2 text-[11px] ${
              activeTab === "PENDING_MANAGER"
                ? "bg-sky-100 text-sky-800 font-bold"
                : counts.PENDING_MANAGER > 0
                ? "bg-blue-100 text-blue-900 font-bold"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {counts.PENDING_MANAGER}
          </span>
        </button>

        {/* Menunggu HR */}
        <button
          type="button"
          onClick={() => setActiveTab("PENDING_HR")}
          className={`pb-2.5 transition flex items-center gap-1.5 relative cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "PENDING_HR"
              ? "text-sky-600 border-sky-500 font-bold"
              : "text-slate-500 border-transparent hover:text-slate-800"
          }`}
        >
          <span>Menunggu HR</span>
          <span
            className={`rounded-full px-2 py-0.2 text-[11px] ${
              activeTab === "PENDING_HR"
                ? "bg-sky-100 text-sky-800 font-bold"
                : counts.PENDING_HR > 0
                ? "bg-indigo-100 text-indigo-900 font-bold"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {counts.PENDING_HR}
          </span>
        </button>

        {/* Perlu Revisi */}
        <button
          type="button"
          onClick={() => setActiveTab("REVISED")}
          className={`pb-2.5 transition flex items-center gap-1.5 relative cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "REVISED"
              ? "text-amber-600 border-amber-500 font-bold"
              : "text-slate-500 border-transparent hover:text-slate-800"
          }`}
          title="Pengajuan yang dikembalikan ke tahapan sebelumnya untuk direvisi"
        >
          <span>Perlu Revisi</span>
          <span
            className={`rounded-full px-2 py-0.2 text-[11px] ${
              activeTab === "REVISED"
                ? "bg-amber-100 text-amber-900 font-bold"
                : counts.REVISED > 0
                ? "bg-rose-100 text-rose-800 font-bold"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {counts.REVISED}
          </span>
        </button>

        {/* Selesai / Final */}
        <button
          type="button"
          onClick={() => setActiveTab("FINAL")}
          className={`pb-2.5 transition flex items-center gap-1.5 relative cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "FINAL"
              ? "text-sky-600 border-sky-500 font-bold"
              : "text-slate-500 border-transparent hover:text-slate-800"
          }`}
        >
          <span>Selesai / Final</span>
          <span
            className={`rounded-full px-2 py-0.2 text-[11px] ${
              activeTab === "FINAL" ? "bg-sky-100 text-sky-800 font-bold" : "bg-slate-100 text-slate-600"
            }`}
          >
            {counts.FINAL}
          </span>
        </button>

        {/* Draft */}
        <button
          type="button"
          onClick={() => setActiveTab("DRAFT")}
          className={`pb-2.5 transition flex items-center gap-1.5 relative cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "DRAFT"
              ? "text-sky-600 border-sky-500 font-bold"
              : "text-slate-500 border-transparent hover:text-slate-800"
          }`}
          title="Karyawan yang masih dalam tahap draft awal"
        >
          <span>Draft (Penilai)</span>
          <span
            className={`rounded-full px-2 py-0.2 text-[11px] ${
              activeTab === "DRAFT" ? "bg-sky-100 text-sky-800 font-bold" : "bg-slate-100 text-slate-600"
            }`}
          >
            {counts.DRAFT}
          </span>
        </button>

        {/* Semua Data */}
        <button
          type="button"
          onClick={() => setActiveTab("ALL")}
          className={`pb-2.5 transition flex items-center gap-1.5 relative cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "ALL"
              ? "text-sky-600 border-sky-500 font-bold"
              : "text-slate-500 border-transparent hover:text-slate-800"
          }`}
        >
          <span>Semua Data</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.2 text-[11px] text-slate-600">
            {counts.ALL}
          </span>
        </button>
      </div>

      {/* 3. TOOLBAR PENCARIAN & FILTER: Ultra Clean */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama karyawan, NIK, jabatan..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-1.5 pl-9 pr-7 text-xs text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-400 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Department Filter */}
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-700 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-400 cursor-pointer"
          >
            <option value="ALL">Semua Departemen</option>
            {departments.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Operating Unit Filter */}
          <select
            value={selectedOU}
            onChange={(e) => setSelectedOU(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-700 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-400 cursor-pointer"
          >
            <option value="ALL">Semua Unit (Site)</option>
            <option value="HO">Head Office (HO)</option>
            <option value="GAM">Site GAM</option>
            <option value="AKP">Site AKP</option>
          </select>
        </div>

        {/* Count Indicator */}
        <div className="text-xs text-slate-500 font-medium px-2 shrink-0">
          {filteredItems.length} data
        </div>
      </div>

      {/* 4. CLEAN DATA TABLE: No Bulky Cards, Pure Icon Actions Without Background */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="py-14 text-center text-slate-400">
            <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-[1.5]" />
            <div className="text-xs font-semibold text-slate-600">Tidak ada pengajuan pada tab ini</div>
            <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
              {activeTab === "PENDING_HEAD_DEPT" || activeTab === "PENDING_MANAGER" || activeTab === "PENDING_HR"
                ? "Semua penilaian pada antrean tahap ini telah divalidasi dan tidak ada antrean pending."
                : activeTab === "REVISED"
                ? "Tidak ada dokumen penilaian yang membutuhkan revisi saat ini."
                : activeTab === "DRAFT"
                ? "Seluruh staf telah menyelesaikan pengisian draft penilaian mereka."
                : "Coba sesuaikan kata kunci pencarian atau filter di atas."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold text-[11px] uppercase tracking-wider">
                  <th className="px-4 py-3">Karyawan</th>
                  <th className="px-4 py-3">Departemen & Site</th>
                  <th className="px-4 py-3">Jabatan & Level</th>
                  <th className="px-4 py-3">Penilai</th>
                  <th className="px-4 py-3">Skor & Grade</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const score = item.finalScore;
                  const hasScore = score > 0;
                  const pa = performanceActionOf(score * 100);
                  const isSubmitted = item.status.toUpperCase() === "SUBMITTED";
                  const isReviewed = item.status.toUpperCase() === "REVIEWED";
                  const isFinal = item.status.toUpperCase() === "FINAL";
                  const isDraft = item.status.toUpperCase() === "DRAFT";

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isSubmitted ? "bg-sky-50/20" : ""
                      }`}
                    >
                      {/* 1. Karyawan */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 text-xs sm:text-sm">
                          {item.empName}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {item.nik}
                        </div>
                      </td>

                      {/* 2. Departemen & Site */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{item.deptName}</div>
                        <div className="text-[11px] text-slate-500">Unit: {item.operatingUnit}</div>
                      </td>

                      {/* 3. Jabatan & Level */}
                      <td className="px-4 py-3">
                        <div className="text-slate-800 font-medium">{item.jobPosition}</div>
                        <div className="text-[11px] text-slate-400">{item.levelName}</div>
                      </td>

                      {/* 4. Penilai & Catatan */}
                      <td className="px-4 py-3">
                        <div className="text-slate-700 font-medium">
                          {item.appraiserName || "Supervisor"}
                        </div>
                        {item.notes ? (
                          <div
                            className="text-[11px] text-slate-500 truncate max-w-[180px] italic"
                            title={item.notes}
                          >
                            &ldquo;{item.notes}&rdquo;
                          </div>
                        ) : null}
                      </td>

                      {/* 5. Skor & Grade */}
                      <td className="px-4 py-3">
                        {hasScore ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm">
                              {fmtPct(score)}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.2 text-[10px] font-bold text-white ${pa.color}`}
                              title={`${pa.label} - ${pa.action}`}
                            >
                              {pa.grade}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            {isDraft ? "Draft" : "Kalkulasi"}
                          </span>
                        )}
                      </td>

                      {/* 6. Status: Draft / Waiting Approval / Approved */}
                      <td className="px-4 py-3">
                        {isFinal ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Approved
                          </span>
                        ) : isDraft ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Draft
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Waiting Approval
                          </span>
                        )}
                      </td>

                      {/* 7. Aksi: Lihat Form (Modal), Edit (Input KPI), Lock jika final */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Tombol Lihat Form (Membuka Modal Pratinjau) */}
                          <button
                            type="button"
                            onClick={() => handleOpenReviewModal(item)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition active:scale-95 cursor-pointer"
                            title="Buka pratinjau form dan proses approval"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            <span>Lihat Form</span>
                          </button>

                          {/* Tombol Edit Form Langsung ke Input KPI */}
                          <Link
                            href={`/input-kpi?id=${item.id}&employeeId=${item.employeeId}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 shadow-2xs transition active:scale-95"
                            title="Edit nilai langsung di formulir input KPI"
                          >
                            <Pencil className="w-3.5 h-3.5 text-slate-400" />
                            <span>Edit</span>
                          </Link>

                          {/* Status Final Terkunci */}
                          {isFinal && (
                            <span
                              className="p-1.5 text-emerald-600 cursor-default"
                              title="Penilaian Telah Difinalisasi dan Terkunci"
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 5. MODAL PRATINJAU FORMULIR PENILAIAN & ALUR APPROVAL                */}
      {/* ==================================================================== */}
      {selectedReviewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          {/* Backdrop Blur */}
          <div
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs transition-opacity"
            onClick={handleCloseReviewModal}
          />

          {/* Modal Container */}
          <div
            className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-slate-200/90 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold text-sm shadow-2xs">
                  {selectedReviewItem.empName
                    .split(" ")
                    .filter(Boolean)
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-base text-slate-900 tracking-tight truncate">
                      {selectedReviewItem.empName}
                    </h3>
                    <span className="text-[11px] font-mono text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                      NIK: {selectedReviewItem.nik}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {selectedReviewItem.jobPosition} • {selectedReviewItem.deptName} • Unit: {selectedReviewItem.operatingUnit}
                  </p>
                </div>
              </div>

              {/* Skor & Close Button */}
              <div className="flex items-center gap-2.5 shrink-0">
                <div className="rounded-lg bg-emerald-50 px-3 py-1.5 border border-emerald-200 text-center">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                    Skor Akhir
                  </span>
                  <div className="flex items-baseline gap-1 justify-center">
                    <span className="text-base font-extrabold text-emerald-800">
                      {selectedReviewItem.finalScore > 0 ? fmtPct(selectedReviewItem.finalScore) : "-"}
                    </span>
                    <span className="text-[11px] font-bold text-emerald-600">
                      ({performanceActionOf(selectedReviewItem.finalScore * 100).grade})
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCloseReviewModal}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition cursor-pointer"
                  title="Tutup Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Alert Catatan Revisi Sebelumnya jika ada */}
              {selectedReviewItem.rejectionReason && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800 mb-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Catatan Pengembalian / Revisi Sebelumnya:</span>
                  </div>
                  <p className="italic pl-5">"{selectedReviewItem.rejectionReason}"</p>
                </div>
              )}

              {/* Table Indikator KPI (Ringkas) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Rincian Capaian Indikator KPI ({periodName})
                  </h4>
                  {reviewDetail?.templateName && (
                    <span className="text-[11px] font-medium text-slate-500">
                      Template: <b>{reviewDetail.templateName}</b>
                    </span>
                  )}
                </div>

                {isLoadingDetail ? (
                  <div className="py-12 text-center text-slate-400">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-r-transparent mb-2" />
                    <p className="text-xs font-medium text-slate-500">Memuat rincian indikator...</p>
                  </div>
                ) : reviewDetail && reviewDetail.categories.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                          <th className="p-2.5 w-12 text-center">No</th>
                          <th className="p-2.5">Indikator KPI</th>
                          <th className="p-2.5 text-right w-24">Target</th>
                          <th className="p-2.5 text-right w-28">Realisasi</th>
                          <th className="p-2.5 text-center w-20">Satuan</th>
                          <th className="p-2.5 text-center w-20">Skor Poin</th>
                          <th className="p-2.5 text-center w-20">Bobot</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {reviewDetail.categories.map((cat, catIdx) => (
                          <React.Fragment key={cat.categoryId}>
                            {/* Kategori Header Row */}
                            <tr className="bg-slate-100/70">
                              <td colSpan={7} className="px-3 py-1.5 font-bold text-slate-800 text-[11px]">
                                {catIdx + 1}. {cat.categoryName} (Bobot: {Math.round(cat.categoryWeight * 100)}%)
                              </td>
                            </tr>
                            {cat.indicators.map((ind, indIdx) => {
                              const targetDisplay =
                                ind.target !== null && ind.target !== undefined
                                  ? ind.target.toLocaleString("id-ID")
                                  : "-";
                              const actualDisplay =
                                ind.annualActual !== null && ind.annualActual !== undefined
                                  ? ind.annualActual.toLocaleString("id-ID")
                                  : "-";
                              const scorePoin =
                                ind.annualScore !== null && ind.annualScore !== undefined
                                  ? ind.annualScore
                                  : ind.score ?? "-";
                              const weightPct = `${Math.round(ind.indicatorWeight * 100)}%`;

                              return (
                                <tr key={ind.appraisalItemId} className="hover:bg-slate-50/60">
                                  <td className="p-2.5 text-center text-slate-400 font-mono text-[11px]">
                                    {ind.indicatorCode || `${catIdx + 1}.${indIdx + 1}`}
                                  </td>
                                  <td className="p-2.5 font-medium text-slate-800">
                                    {ind.indicatorName}
                                  </td>
                                  <td className="p-2.5 text-right font-mono font-semibold text-slate-700">
                                    {targetDisplay}
                                  </td>
                                  <td className="p-2.5 text-right font-mono font-bold text-indigo-700">
                                    {actualDisplay}
                                  </td>
                                  <td className="p-2.5 text-center text-slate-500">
                                    {ind.unit || "-"}
                                  </td>
                                  <td className="p-2.5 text-center">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded font-bold text-[11px] bg-slate-100 text-slate-800">
                                      {scorePoin} pt
                                    </span>
                                  </td>
                                  <td className="p-2.5 text-center font-semibold text-slate-600">
                                    {weightPct}
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    Belum ada data indikator KPI untuk penilaian ini.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="border-t border-slate-200 bg-slate-50/70 px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              {/* Left: Direct Edit Form Button */}
              <Link
                href={`/input-kpi?id=${selectedReviewItem.id}&employeeId=${selectedReviewItem.employeeId}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition"
                title="Buka form input lengkap di halaman KPI"
              >
                <Pencil className="w-3.5 h-3.5 text-slate-500" />
                <span>Edit Form di Input KPI</span>
              </Link>

              {/* Right: Close, Revise, Approve */}
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={handleCloseReviewModal}
                  className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition cursor-pointer"
                >
                  Tutup
                </button>

                {/* Tombol Kembalikan (Revisi) */}
                {selectedReviewItem.status.toUpperCase() !== "FINAL" && (
                  <button
                    type="button"
                    disabled={isProcessingAction}
                    onClick={handleRejectRevise}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 px-3.5 py-2 text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                    <span>Kembalikan (Revisi)</span>
                  </button>
                )}

                {/* Tombol Setujui / Teruskan */}
                {selectedReviewItem.status.toUpperCase() !== "FINAL" && (
                  <button
                    type="button"
                    disabled={isProcessingAction}
                    onClick={handleApproveForward}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4 text-white" />
                    <span>Setujui &amp; Teruskan</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

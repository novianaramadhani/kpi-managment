import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { MonthlyIndicatorItem } from "@/types/monthly-assessment";

export interface EvaluationPdfParams {
  employee: {
    name: string;
    nik: string;
    jobPosition: string;
    departmentName: string;
    templateName: string;
  };
  period: {
    year: number;
    name?: string;
  };
  summary: {
    overallScoreDisplay: string;
    grade: string;
  };
  categories: Array<{
    categoryId?: number;
    categoryNumber: number;
    categoryName: string;
    categoryWeight: number;
    scorePercentage?: number;
    annualScorePercentage?: number;
    indicators: MonthlyIndicatorItem[];
  }>;
  approvalLine?: {
    appraiser?: { name?: string | null; jobPosition?: string | null } | null;
    headDept?: { name?: string | null; jobPosition?: string | null } | null;
    manager?: { name?: string | null; jobPosition?: string | null } | null;
  } | null;
}

function formatTargetStr(target: number | null | undefined, unit?: string | null): string {
  if (target === null || target === undefined) return "-";
  const numStr = Number(target).toLocaleString("id-ID", { maximumFractionDigits: 2 });
  if (unit === "%") return `${numStr}%`;
  if (unit) return `${numStr} ${unit}`;
  return numStr;
}

export function generateEvaluationPdfDoc(params: EvaluationPdfParams): jsPDF {
  const { employee, period, summary, categories, approvalLine } = params;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Title Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text("FORMULIR HASIL EVALUASI KINERJA (KPI)", margin, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(
    `Rekapitulasi lengkap capaian indikator dan perhitungan skor akhir tahun ${period.year}`,
    margin,
    23
  );

  // Horizontal divider
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.5);
  doc.line(margin, 26, margin + contentWidth, 26);

  // Info Box
  const infoY = 29;
  const infoH = 22;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(margin, infoY, contentWidth, infoH, 2, 2, "F");
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, infoY, contentWidth, infoH, 2, 2, "S");

  // Col 1: Karyawan
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text("KARYAWAN", margin + 4, infoY + 5);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(employee.name || "-", margin + 4, infoY + 10);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`NIK: ${employee.nik || "-"}`, margin + 4, infoY + 15);

  // Col 2: Posisi & Dept
  const col2X = margin + 50;
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text("POSISI & DEPT", col2X, infoY + 5);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(employee.jobPosition || "-", col2X, infoY + 10);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(employee.departmentName || "-", col2X, infoY + 15);

  // Col 3: Master Template & Periode
  const col3X = margin + 98;
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text("MASTER TEMPLATE & PERIODE", col3X, infoY + 5);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  const truncatedTemplate =
    (employee.templateName || "-").length > 25
      ? `${(employee.templateName || "-").slice(0, 23)}...`
      : employee.templateName || "-";
  doc.text(truncatedTemplate, col3X, infoY + 10);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`Tahun ${period.year}`, col3X, infoY + 15);

  // Col 4: Total Skor Akhir Card
  const scoreBoxX = margin + 140;
  const scoreBoxW = contentWidth - 140;
  doc.setFillColor(236, 253, 245); // emerald-50
  doc.setDrawColor(167, 243, 208); // emerald-200
  doc.roundedRect(scoreBoxX, infoY + 2, scoreBoxW - 3, infoH - 4, 1.5, 1.5, "FD");

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(4, 120, 87); // emerald-700
  doc.text("TOTAL SKOR AKHIR", scoreBoxX + 3, infoY + 7);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(6, 95, 70); // emerald-800
  doc.text(summary.overallScoreDisplay || "-", scoreBoxX + 3, infoY + 15);

  doc.setFillColor(5, 150, 105); // emerald-600
  doc.roundedRect(scoreBoxX + 23, infoY + 10.5, 13, 5, 1, 1, "F");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`Grade ${summary.grade || "-"}`, scoreBoxX + 24.5, infoY + 14);

  // Table Data construction
  const tableRows: any[] = [];

  for (const cat of categories) {
    const isTargetKerja =
      cat.categoryNumber === 1 ||
      cat.categoryName.toLowerCase().includes("target kerja");

    const catWeightStr = `${Math.round(cat.categoryWeight * 100)}%`;
    const catScoreStr = `${(cat.annualScorePercentage ?? cat.scorePercentage ?? 0).toFixed(1)}%`;

    if (isTargetKerja) {
      // 1. Target Kerja: Struktur Parameter Utama -> Sub-Parameter
      tableRows.push([
        {
          content: `${cat.categoryNumber}. ${cat.categoryName.toUpperCase()}`,
          colSpan: 2,
          styles: { fontStyle: "bold", fillColor: [241, 245, 249], textColor: [15, 23, 42] },
        },
        {
          content: `${cat.indicators.length} Sub-Parameter`,
          styles: { fontStyle: "normal", fillColor: [241, 245, 249], textColor: [100, 116, 139] },
        },
        {
          content: "-",
          styles: { halign: "center", fillColor: [241, 245, 249], textColor: [148, 163, 184] },
        },
        {
          content: catWeightStr,
          styles: { halign: "center", fontStyle: "bold", fillColor: [241, 245, 249], textColor: [30, 41, 59] },
        },
        {
          content: catScoreStr,
          styles: { halign: "right", fontStyle: "bold", fillColor: [241, 245, 249], textColor: [22, 58, 125] },
        },
      ]);

      // Sub-Parameter Rows (Menampilkan Bobot Internal)
      cat.indicators.forEach((ind, pIdx) => {
        const targetStr = formatTargetStr(ind.target, ind.unit);
        const effectiveScore = ind.annualScore !== null && ind.annualScore !== undefined ? ind.annualScore : ind.score;
        const scoreStr = effectiveScore !== null && effectiveScore !== undefined ? `${effectiveScore} pt` : "-";
        const weightStr = `${Math.round(ind.indicatorWeight * 100)}%`;
        const finalScoreStr = ind.annualFinalScoreDisplay || ind.finalScoreDisplay || "-";
        const codeStr = ind.indicatorCode || `1.${pIdx + 1}`;

        tableRows.push([
          {
            content: codeStr,
            styles: { fontStyle: "bold", textColor: [100, 116, 139], halign: "center" },
          },
          {
            content: ind.indicatorName,
            styles: { fontStyle: "normal", textColor: [15, 23, 42] },
          },
          {
            content: targetStr,
            styles: { halign: "center", textColor: [51, 65, 85] },
          },
          {
            content: scoreStr,
            styles: { halign: "center", fontStyle: "bold", textColor: [15, 23, 42] },
          },
          {
            content: weightStr,
            styles: { halign: "center", textColor: [71, 85, 105] },
          },
          {
            content: finalScoreStr,
            styles: { halign: "right", fontStyle: "bold", textColor: [15, 23, 42] },
          },
        ]);
      });
    } else {
      // 2. Parameter General (Kehadiran & Disiplin, Keselamatan Kerja, Kepatuhan & SP, Inovasi & Improvement):
      // Cukup tampilkan satu baris untuk masing-masing parameter utama, tanpa baris turunan (2.1, 3.1, dsb.)
      // Langsung menggunakan Bobot Utama (tidak menampilkan Bobot Internal).
      const ind = cat.indicators[0];
      const targetStr = ind ? formatTargetStr(ind.target, ind.unit) : "-";
      const effectiveScore = ind ? (ind.annualScore !== null && ind.annualScore !== undefined ? ind.annualScore : ind.score) : null;
      const scoreStr = effectiveScore !== null && effectiveScore !== undefined ? `${effectiveScore} pt` : "-";
      const finalScoreStr = ind ? (ind.annualFinalScoreDisplay || ind.finalScoreDisplay || catScoreStr) : catScoreStr;

      tableRows.push([
        {
          content: String(cat.categoryNumber),
          styles: { fontStyle: "bold", textColor: [100, 116, 139], halign: "center" },
        },
        {
          content: cat.categoryName,
          styles: { fontStyle: "bold", textColor: [15, 23, 42] },
        },
        {
          content: targetStr,
          styles: { halign: "center", textColor: [51, 65, 85] },
        },
        {
          content: scoreStr,
          styles: { halign: "center", fontStyle: "bold", textColor: [15, 23, 42] },
        },
        {
          content: catWeightStr,
          styles: { halign: "center", fontStyle: "bold", textColor: [30, 41, 59] },
        },
        {
          content: finalScoreStr,
          styles: { halign: "right", fontStyle: "bold", textColor: [22, 58, 125] },
        },
      ]);
    }
  }

  // Summary Row
  tableRows.push([
    {
      content: "TOTAL HASIL PENILAIAN AKHIR KPI",
      colSpan: 4,
      styles: {
        fontStyle: "bold",
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
      },
    },
    {
      content: "100%",
      styles: {
        halign: "center",
        fontStyle: "bold",
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
      },
    },
    {
      content: summary.overallScoreDisplay || "-",
      styles: {
        halign: "right",
        fontStyle: "bold",
        fillColor: [241, 245, 249],
        textColor: [5, 150, 105],
      },
    },
  ]);

  autoTable(doc, {
    startY: infoY + infoH + 5,
    margin: { left: margin, right: margin },
    head: [
      [
        { content: "Kode", styles: { halign: "center", cellWidth: 14 } },
        { content: "Parameter / Indikator KPI", styles: { halign: "left" } },
        { content: "Target", styles: { halign: "center", cellWidth: 26 } },
        { content: "Realisasi (Skor)", styles: { halign: "center", cellWidth: 28 } },
        { content: "Bobot", styles: { halign: "center", cellWidth: 18 } },
        { content: "Skor Akhir", styles: { halign: "right", cellWidth: 24 } },
      ],
    ],
    body: tableRows,
    theme: "grid",
    headStyles: {
      fillColor: [240, 244, 248],
      textColor: [51, 65, 85],
      fontSize: 8,
      fontStyle: "bold",
      lineColor: [219, 226, 234],
      lineWidth: 0.3,
    },
    bodyStyles: {
      fontSize: 8,
      lineColor: [219, 226, 234],
      lineWidth: 0.2,
      cellPadding: 2,
    },
    styles: {
      font: "helvetica",
      overflow: "linebreak",
    },
  });

  // Signatures at bottom
  let finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 12 : 230;
  if (finalY > 245) {
    doc.addPage();
    finalY = 25;
  }

  const sigWidth = contentWidth / 4;
  const sigTitles = [
    "Karyawan Yang Dinilai",
    "Penilai (Supervisor)",
    "Head Department",
    "Manager Divisi",
  ];
  const sigNames = [
    employee.name || "-",
    approvalLine?.appraiser?.name || "Atasan Langsung",
    approvalLine?.headDept?.name || "Head Department",
    approvalLine?.manager?.name || "Manager",
  ];

  for (let i = 0; i < 4; i++) {
    const x = margin + i * sigWidth;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(sigTitles[i], x + sigWidth / 2, finalY, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(sigNames[i], x + sigWidth / 2, finalY + 20, { align: "center" });

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(x + 5, finalY + 21.5, x + sigWidth - 5, finalY + 21.5);
  }

  return doc;
}

export function downloadEvaluationPdf(params: EvaluationPdfParams) {
  const doc = generateEvaluationPdfDoc(params);
  const safeName = (params.employee.name || "Karyawan").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `Hasil_Evaluasi_KPI_${safeName}_${params.period.year}.pdf`;
  doc.save(fileName);
}

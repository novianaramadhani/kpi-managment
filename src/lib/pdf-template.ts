import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { KpiCategory, KpiParameter, KpiBand, KpiTemplate } from "@/db/schema";
import { formatCriteriaExcel } from "./excel-template-kpi";

export interface TemplatePdfParams {
  template: KpiTemplate;
  departmentName?: string;
  jobLevelName?: string;
  categories: KpiCategory[];
  parameters: KpiParameter[];
  bands: KpiBand[];
}

export function generateTemplatePdfDoc(params: TemplatePdfParams): jsPDF {
  const { template, departmentName, jobLevelName, categories, parameters, bands } = params;

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
  doc.text("MASTER TEMPLATE KPI", margin, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(
    "Dokumen resmi struktur parameter, indikator kinerja, kriteria penilaian, dan bobot",
    margin,
    23
  );

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(margin, 26, margin + contentWidth, 26);

  // Metadata Box
  const infoY = 29;
  const infoH = 20;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, infoY, contentWidth, infoH, 2, 2, "F");
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, infoY, contentWidth, infoH, 2, 2, "S");

  // Col 1: Template Name
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text("NAMA TEMPLATE", margin + 4, infoY + 5);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  const truncatedName =
    template.name.length > 35 ? `${template.name.slice(0, 33)}...` : template.name;
  doc.text(truncatedName, margin + 4, infoY + 11);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`Status: ${template.isActive ? "Published" : "Draft"}`, margin + 4, infoY + 16);

  // Col 2: Departemen & Job Level
  const col2X = margin + 70;
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text("DEPARTEMEN & JOB LEVEL", col2X, infoY + 5);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(departmentName || "-", col2X, infoY + 11);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(jobLevelName || "-", col2X, infoY + 16);

  // Col 3: Target Bobot
  const col3X = margin + 140;
  const col3W = contentWidth - 140;
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(col3X, infoY + 2, col3W - 3, infoH - 4, 1.5, 1.5, "FD");

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(22, 101, 52);
  doc.text("TARGET TOTAL BOBOT", col3X + 3, infoY + 7);

  const targetPct = Math.round(Number(template.totalWeight) * 100);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(21, 128, 61);
  doc.text(`${targetPct}%`, col3X + 3, infoY + 15);

  // Construct Table Rows
  const sortedCats = [...categories].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id
  );

  const tableRows: any[] = [];

  for (let catIdx = 0; catIdx < sortedCats.length; catIdx++) {
    const cat = sortedCats[catIdx];
    const catWeightPct = Math.round(Number(cat.weight) * 100);
    const catParams = parameters
      .filter((p) => p.categoryId === cat.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);

    const isTargetKerja =
      catIdx === 0 || cat.name.toLowerCase().includes("target kerja");

    if (isTargetKerja) {
      // 1. Target Kerja: Struktur Parameter Utama -> Sub-Parameter
      // Category Header Row
      tableRows.push([
        {
          content: `${catIdx + 1}`,
          styles: { fontStyle: "bold", halign: "center", fillColor: [241, 245, 249], textColor: [15, 23, 42] },
        },
        {
          content: cat.name.toUpperCase(),
          colSpan: 2,
          styles: { fontStyle: "bold", fillColor: [241, 245, 249], textColor: [15, 23, 42] },
        },
        {
          content: "-",
          styles: { halign: "center", fillColor: [241, 245, 249], textColor: [148, 163, 184] },
        },
        {
          content: "-",
          styles: { halign: "center", fillColor: [241, 245, 249], textColor: [148, 163, 184] },
        },
        {
          content: "Kamus Acuan Departemen",
          styles: { fontStyle: "italic", fillColor: [241, 245, 249], textColor: [100, 116, 139] },
        },
        {
          content: "-",
          styles: { halign: "center", fillColor: [241, 245, 249], textColor: [148, 163, 184] },
        },
        {
          content: `${catWeightPct}%`,
          styles: { halign: "center", fontStyle: "bold", fillColor: [241, 245, 249], textColor: [30, 41, 59] },
        },
      ]);

      // Sub-Parameter Rows
      for (let pIdx = 0; pIdx < catParams.length; pIdx++) {
        const p = catParams[pIdx];
        const pWeightPct = Math.round(Number(p.weight) * 100);
        const pBands = bands
          .filter((b) => b.parameterId === p.id)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || Number(b.score ?? 0) - Number(a.score ?? 0));

        const targetStr = p.target || "100";
        const unitStr = p.unit || "%";

        if (pBands.length === 0) {
          tableRows.push([
            { content: `${catIdx + 1}.${pIdx + 1}`, styles: { halign: "center", fontStyle: "bold", textColor: [100, 116, 139] } },
            { content: cat.name, styles: { textColor: [100, 116, 139] } },
            { content: p.name, styles: { fontStyle: "bold", textColor: [15, 23, 42] } },
            { content: targetStr, styles: { halign: "center", textColor: [51, 65, 85] } },
            { content: unitStr, styles: { halign: "center", textColor: [51, 65, 85] } },
            { content: "-", styles: { textColor: [148, 163, 184] } },
            { content: "25", styles: { halign: "center", textColor: [15, 23, 42] } },
            { content: `${pWeightPct}%`, styles: { halign: "center", fontStyle: "bold", textColor: [15, 23, 42] } },
          ]);
        } else {
          for (let bIdx = 0; bIdx < pBands.length; bIdx++) {
            const b = pBands[bIdx];
            const critStr = formatCriteriaExcel(b.label, b.operator, b.minValue, b.maxValue, p.unit);

            tableRows.push([
              { content: bIdx === 0 ? `${catIdx + 1}.${pIdx + 1}` : "", styles: { halign: "center", fontStyle: "bold", textColor: [100, 116, 139] } },
              { content: bIdx === 0 ? cat.name : "", styles: { textColor: [100, 116, 139] } },
              { content: bIdx === 0 ? p.name : "", styles: { fontStyle: "bold", textColor: [15, 23, 42] } },
              { content: bIdx === 0 ? targetStr : "", styles: { halign: "center", textColor: [51, 65, 85] } },
              { content: bIdx === 0 ? unitStr : "", styles: { halign: "center", textColor: [51, 65, 85] } },
              { content: critStr, styles: { textColor: [51, 65, 85] } },
              { content: String(b.score ?? "-"), styles: { halign: "center", fontStyle: "bold", textColor: [15, 23, 42] } },
              { content: bIdx === 0 ? `${pWeightPct}%` : "", styles: { halign: "center", fontStyle: "bold", textColor: [15, 23, 42] } },
            ]);
          }
        }
      }
    } else {
      // 2. Parameter General (Kehadiran & Disiplin, Keselamatan Kerja, Kepatuhan & SP, Inovasi & Improvement):
      // Satu baris untuk masing-masing parameter utama, tanpa baris turunan (2.1, 3.1, dsb.)
      // Langsung menggunakan Bobot Utama (tidak menampilkan Bobot Internal).
      const p = catParams[0];
      const pBands = p
        ? bands
            .filter((b) => b.parameterId === p.id)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || Number(b.score ?? 0) - Number(a.score ?? 0))
        : [];

      const targetStr = p?.target || "-";
      const unitStr = p?.unit || "%";

      if (pBands.length === 0) {
        tableRows.push([
          { content: String(catIdx + 1), styles: { halign: "center", fontStyle: "bold", textColor: [100, 116, 139] } },
          { content: cat.name, styles: { fontStyle: "bold", textColor: [15, 23, 42] } },
          { content: "-", styles: { halign: "center", textColor: [148, 163, 184] } },
          { content: targetStr, styles: { halign: "center", textColor: [51, 65, 85] } },
          { content: unitStr, styles: { halign: "center", textColor: [51, 65, 85] } },
          { content: "-", styles: { textColor: [148, 163, 184] } },
          { content: "25", styles: { halign: "center", textColor: [15, 23, 42] } },
          { content: `${catWeightPct}%`, styles: { halign: "center", fontStyle: "bold", textColor: [30, 41, 59] } },
        ]);
      } else {
        for (let bIdx = 0; bIdx < pBands.length; bIdx++) {
          const b = pBands[bIdx];
          const critStr = formatCriteriaExcel(b.label, b.operator, b.minValue, b.maxValue, p?.unit);

          tableRows.push([
            { content: bIdx === 0 ? String(catIdx + 1) : "", styles: { halign: "center", fontStyle: "bold", textColor: [100, 116, 139] } },
            { content: bIdx === 0 ? cat.name : "", styles: { fontStyle: "bold", textColor: [15, 23, 42] } },
            { content: bIdx === 0 ? "-" : "", styles: { halign: "center", textColor: [148, 163, 184] } },
            { content: bIdx === 0 ? targetStr : "", styles: { halign: "center", textColor: [51, 65, 85] } },
            { content: bIdx === 0 ? unitStr : "", styles: { halign: "center", textColor: [51, 65, 85] } },
            { content: critStr, styles: { textColor: [51, 65, 85] } },
            { content: String(b.score ?? "-"), styles: { halign: "center", fontStyle: "bold", textColor: [15, 23, 42] } },
            { content: bIdx === 0 ? `${catWeightPct}%` : "", styles: { halign: "center", fontStyle: "bold", textColor: [30, 41, 59] } },
          ]);
        }
      }
    }
  }

  // Summary Row Total Bobot
  tableRows.push([
    {
      content: "TOTAL BOBOT SELURUH PARAMETER",
      colSpan: 7,
      styles: {
        fontStyle: "bold",
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        halign: "right",
      },
    },
    {
      content: `${targetPct}%`,
      styles: {
        halign: "center",
        fontStyle: "bold",
        fillColor: [241, 245, 249],
        textColor: [21, 128, 61],
      },
    },
  ]);

  autoTable(doc, {
    startY: infoY + infoH + 5,
    margin: { left: margin, right: margin },
    head: [
      [
        { content: "No", styles: { halign: "center", cellWidth: 10 } },
        { content: "Parameter Utama", styles: { halign: "left", cellWidth: 32 } },
        { content: "Sub-Parameter", styles: { halign: "left", cellWidth: 34 } },
        { content: "Target", styles: { halign: "center", cellWidth: 16 } },
        { content: "Satuan", styles: { halign: "center", cellWidth: 14 } },
        { content: "Kriteria Penilaian", styles: { halign: "left" } },
        { content: "Skor", styles: { halign: "center", cellWidth: 12 } },
        { content: "Bobot", styles: { halign: "center", cellWidth: 16 } },
      ],
    ],
    body: tableRows,
    theme: "grid",
    headStyles: {
      fillColor: [240, 244, 248],
      textColor: [51, 65, 85],
      fontSize: 7.5,
      fontStyle: "bold",
      lineColor: [219, 226, 234],
      lineWidth: 0.3,
    },
    bodyStyles: {
      fontSize: 7.5,
      lineColor: [219, 226, 234],
      lineWidth: 0.2,
      cellPadding: 1.8,
    },
    styles: {
      font: "helvetica",
      overflow: "linebreak",
    },
  });

  return doc;
}

export function exportKpiTemplateToPdf(params: TemplatePdfParams) {
  const doc = generateTemplatePdfDoc(params);
  const safeName = params.template.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  doc.save(`${safeName}_Master_Template.pdf`);
}

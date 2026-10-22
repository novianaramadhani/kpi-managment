import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appraisals, appraisalEvidence, kpiParameters } from "@/db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { parseEvidenceExcel, compareEvidence } from "@/lib/excel-evidence";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = new Set([".pdf", ".xlsx", ".xls", ".csv", ".jpg", ".jpeg", ".png"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "image/jpeg",
  "image/png",
  "application/octet-stream",
]);

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const appraisalIdStr = formData.get("appraisalId") as string | null;
    const parameterIdStr = formData.get("parameterId") as string | null;
    const fileType = (formData.get("fileType") as string | null) || "ATTACHMENT";
    const description = (formData.get("description") as string | null) || null;
    const currentInputsStr = formData.get("currentInputs") as string | null;
    const monthStr = formData.get("month") as string | null;
    const month = monthStr ? Number(monthStr) : null;

    if (!file || !appraisalIdStr || !parameterIdStr) {
      return NextResponse.json(
        { error: "File, appraisalId, dan parameterId wajib diunggah." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Ukuran file melebihi batas maksimum 10MB." },
        { status: 400 }
      );
    }

    const originalName = path.basename(file.name || "uploaded_file");
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: "Format file tidak diizinkan. Hanya PDF, Excel, CSV, dan gambar yang diperbolehkan." },
        { status: 400 }
      );
    }

    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Tipe MIME file tidak diizinkan." },
        { status: 400 }
      );
    }

    const appraisalId = Number(appraisalIdStr);
    const parameterId = Number(parameterIdStr);

    const [appraisal] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId));
    if (!appraisal) {
      return NextResponse.json({ error: "Data appraisal tidak ditemukan." }, { status: 404 });
    }

    const isAuthorized =
      currentUser.role === "ADMIN" ||
      currentUser.role === "HR" ||
      appraisal.employeeId === currentUser.id ||
      appraisal.appraiserId === currentUser.id ||
      appraisal.headDeptId === currentUser.id ||
      appraisal.managerId === currentUser.id;

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin untuk mengunggah bukti pada penilaian ini." },
        { status: 403 }
      );
    }

    const [param] = await db.select().from(kpiParameters).where(eq(kpiParameters.id, parameterId));
    if (!param) {
      return NextResponse.json({ error: "Parameter KPI tidak ditemukan." }, { status: 404 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadDir = path.join(process.cwd(), "public", "uploads", "evidence");
    await fs.mkdir(uploadDir, { recursive: true });

    const safeFileUUID = crypto.randomUUID();
    const uniqueFileName = `${Date.now()}_${safeFileUUID}${ext}`;
    const filePath = path.join(uploadDir, uniqueFileName);
    const publicUrl = `/uploads/evidence/${uniqueFileName}`;

    await fs.writeFile(filePath, buffer);

    let extractedValue: number | null = null;
    let extractedData: Record<string, any> | null = null;
    let matchStatus: string = "ATTACHMENT";
    let parsedResult = null;
    let comparisonResult = null;

    if (fileType === "EXCEL_DATA") {
      try {
        parsedResult = parseEvidenceExcel(buffer, param);
        extractedValue = parsedResult.extractedValue;
        extractedData = parsedResult.extractedData;

        let currentInputObj = { actual: null, target: null, monthlyActuals: [] };
        if (currentInputsStr) {
          try {
            currentInputObj = JSON.parse(currentInputsStr);
          } catch {
            // invalid JSON fallback
          }
        }

        comparisonResult = compareEvidence(currentInputObj, parsedResult.extractedData, param);
        matchStatus = comparisonResult.status;
      } catch (parseErr: any) {
        console.error("Error parsing Excel evidence:", parseErr);
        matchStatus = "MISMATCH";
      }
    }

    const [inserted] = await db
      .insert(appraisalEvidence)
      .values({
        appraisalId,
        parameterId,
        month,
        fileType,
        fileName: originalName,
        filePath: publicUrl,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        extractedValue: extractedValue !== null ? String(extractedValue) : null,
        extractedData,
        matchStatus,
        description,
        uploadedBy: currentUser.name || currentUser.nik,
      })
      .returning();

    return NextResponse.json({
      success: true,
      evidence: inserted,
      parsedResult,
      comparisonResult,
    });
  } catch (err: any) {
    console.error("Error uploading evidence:", err);
    return NextResponse.json(
      { error: "Gagal mengunggah file bukti." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appraisalEvidence, kpiParameters } from "@/db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs/promises";
import { parseEvidenceExcel, compareEvidence } from "@/lib/excel-evidence";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
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

    const appraisalId = Number(appraisalIdStr);
    const parameterId = Number(parameterIdStr);

    const [param] = await db.select().from(kpiParameters).where(eq(kpiParameters.id, parameterId));
    if (!param) {
      return NextResponse.json({ error: "Parameter KPI tidak ditemukan." }, { status: 404 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Pastikan folder penyimpanan lokal tersedia
    const uploadDir = path.join(process.cwd(), "public", "uploads", "evidence");
    await fs.mkdir(uploadDir, { recursive: true });

    // Sanitasi nama file
    const originalName = file.name || "uploaded_file";
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueFileName = `${Date.now()}_${sanitizedName}`;
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
            // ignore JSON parse error
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
        uploadedBy: "penilai",
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
      { error: err.message || "Gagal mengunggah file bukti." },
      { status: 500 }
    );
  }
}

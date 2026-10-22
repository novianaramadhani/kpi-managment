import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appraisals, appraisalEvidence } from "@/db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs/promises";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const evidenceId = Number(id);

    if (!evidenceId) {
      return NextResponse.json({ error: "ID bukti tidak valid." }, { status: 400 });
    }

    const [record] = await db
      .select()
      .from(appraisalEvidence)
      .where(eq(appraisalEvidence.id, evidenceId));

    if (!record) {
      return NextResponse.json({ error: "Data bukti tidak ditemukan." }, { status: 404 });
    }

    const [appraisal] = await db
      .select()
      .from(appraisals)
      .where(eq(appraisals.id, record.appraisalId));

    const isUploader = record.uploadedBy === currentUser.name || record.uploadedBy === currentUser.nik;
    const isAuthorized =
      currentUser.role === "ADMIN" ||
      currentUser.role === "HR" ||
      (appraisal && appraisal.employeeId === currentUser.id && isUploader) ||
      (appraisal && appraisal.appraiserId === currentUser.id);

    if (!isAuthorized) {
      return NextResponse.json({ error: "Anda tidak memiliki izin untuk menghapus file ini." }, { status: 403 });
    }

    // Safely remove file from disk with path traversal protection
    if (record.filePath && record.filePath.startsWith("/uploads/evidence/")) {
      const safeBaseName = path.basename(record.filePath);
      const diskPath = path.join(process.cwd(), "public", "uploads", "evidence", safeBaseName);
      try {
        await fs.unlink(diskPath);
      } catch {
        // file might already be removed
      }
    }

    await db.delete(appraisalEvidence).where(eq(appraisalEvidence.id, evidenceId));

    return NextResponse.json({ success: true, message: "Bukti berhasil dihapus." });
  } catch (err: any) {
    console.error("Error deleting evidence:", err);
    return NextResponse.json(
      { error: "Gagal menghapus file bukti." },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const evidenceId = Number(id);

    const [record] = await db
      .select()
      .from(appraisalEvidence)
      .where(eq(appraisalEvidence.id, evidenceId));

    if (!record) {
      return NextResponse.json({ error: "Data bukti tidak ditemukan." }, { status: 404 });
    }

    const [appraisal] = await db
      .select()
      .from(appraisals)
      .where(eq(appraisals.id, record.appraisalId));

    const isAuthorized =
      currentUser.role === "ADMIN" ||
      currentUser.role === "HR" ||
      (appraisal && (
        appraisal.employeeId === currentUser.id ||
        appraisal.appraiserId === currentUser.id ||
        appraisal.headDeptId === currentUser.id ||
        appraisal.managerId === currentUser.id
      ));

    if (!isAuthorized) {
      return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
    }

    return NextResponse.json({ success: true, evidence: record });
  } catch (err: any) {
    console.error("Error fetching evidence:", err);
    return NextResponse.json(
      { error: "Gagal mengambil data bukti." },
      { status: 500 }
    );
  }
}

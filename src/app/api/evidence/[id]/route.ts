import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appraisalEvidence } from "@/db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs/promises";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    // Hapus file fisik dari disk jika ada
    if (record.filePath && record.filePath.startsWith("/uploads/")) {
      const diskPath = path.join(process.cwd(), "public", record.filePath);
      try {
        await fs.unlink(diskPath);
      } catch {
        // file mungkin sudah tidak ada, lanjutkan penghapusan row DB
      }
    }

    await db.delete(appraisalEvidence).where(eq(appraisalEvidence.id, evidenceId));

    return NextResponse.json({ success: true, message: "Bukti berhasil dihapus." });
  } catch (err: any) {
    console.error("Error deleting evidence:", err);
    return NextResponse.json(
      { error: err.message || "Gagal menghapus file bukti." },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const evidenceId = Number(id);

    const [record] = await db
      .select()
      .from(appraisalEvidence)
      .where(eq(appraisalEvidence.id, evidenceId));

    if (!record) {
      return NextResponse.json({ error: "Data bukti tidak ditemukan." }, { status: 404 });
    }

    return NextResponse.json({ success: true, evidence: record });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Gagal mengambil data bukti." },
      { status: 500 }
    );
  }
}

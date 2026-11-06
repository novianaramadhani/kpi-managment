import { NextRequest, NextResponse } from "next/server";
import {
  getGenerateTemplatePreviewAction,
  executeGenerateTemplateAction,
  type ExecuteGenerateTemplatePayload,
} from "@/lib/template-generate-actions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const departmentId = Number(searchParams.get("departmentId") || 0);
    const jobCategoryId = Number(searchParams.get("jobCategoryId") || 0);
    const periodIdRaw = searchParams.get("periodId");
    const periodId = periodIdRaw ? Number(periodIdRaw) : undefined;

    const result = await getGenerateTemplatePreviewAction({
      departmentId,
      jobCategoryId,
      periodId,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat preview Generate Template KPI.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ExecuteGenerateTemplatePayload;
    const result = await executeGenerateTemplateAction(body);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal mengeksekusi Generate Template KPI.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}


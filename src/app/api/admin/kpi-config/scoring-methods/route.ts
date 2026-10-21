import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getKpiScoringMethods,
  saveKpiScoringMethod,
  deleteKpiScoringMethod,
} from "@/lib/kpi-config-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || (currentUser.role !== "ADMIN" && currentUser.role !== "HR")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const isActiveParam = searchParams.get("isActive");
    const isActive = isActiveParam !== null ? isActiveParam === "true" : undefined;

    const data = await getKpiScoringMethods({ search, isActive });
    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat metode penilaian.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || (currentUser.role !== "ADMIN" && currentUser.role !== "HR")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { id, code, name, description, requiresBands, requiresFormula, sortOrder, isActive } = body;

    if (!code || !name) {
      return NextResponse.json({ error: "Kode dan Nama metode penilaian wajib diisi." }, { status: 400 });
    }

    const result = await saveKpiScoringMethod({
      id: id ? Number(id) : undefined,
      code,
      name,
      description,
      requiresBands,
      requiresFormula,
      sortOrder: sortOrder ? Number(sortOrder) : 0,
      isActive,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menyimpan metode penilaian.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || (currentUser.role !== "ADMIN" && currentUser.role !== "HR")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));

    if (!id) {
      return NextResponse.json({ error: "ID metode penilaian wajib disertakan." }, { status: 400 });
    }

    await deleteKpiScoringMethod(id);
    return NextResponse.json({ success: true, message: "Metode penilaian berhasil dinonaktifkan." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menghapus metode penilaian.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getMeasurementTypes,
  saveMeasurementType,
  deleteMeasurementType,
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

    const data = await getMeasurementTypes({ search, isActive });
    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat tipe pengukuran.";
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
    const { id, code, name, description, formatPattern, defaultUnit, isNumeric, sortOrder, isActive } = body;

    if (!code || !name) {
      return NextResponse.json({ error: "Kode dan Nama tipe pengukuran wajib diisi." }, { status: 400 });
    }

    const result = await saveMeasurementType({
      id: id ? Number(id) : undefined,
      code,
      name,
      description,
      formatPattern,
      defaultUnit,
      isNumeric,
      sortOrder: sortOrder ? Number(sortOrder) : 0,
      isActive,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menyimpan tipe pengukuran.";
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
      return NextResponse.json({ error: "ID tipe pengukuran wajib disertakan." }, { status: 400 });
    }

    await deleteMeasurementType(id);
    return NextResponse.json({ success: true, message: "Tipe pengukuran berhasil dinonaktifkan." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menghapus tipe pengukuran.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

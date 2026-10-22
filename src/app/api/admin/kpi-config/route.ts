import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getMeasurementTypes,
  getKpiDirections,
  getKpiScoringMethods,
} from "@/lib/kpi-config-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized: Sesi login diperlukan." }, { status: 401 });
    }
    if (currentUser.role !== "ADMIN" && currentUser.role !== "HR") {
      return NextResponse.json({ error: "Forbidden: Akses khusus Admin atau HR." }, { status: 403 });
    }

    const [measurementTypes, directions, scoringMethods] = await Promise.all([
      getMeasurementTypes({ isActive: true }),
      getKpiDirections({ isActive: true }),
      getKpiScoringMethods({ isActive: true }),
    ]);

    return NextResponse.json({
      success: true,
      config: {
        measurementTypes,
        directions,
        scoringMethods,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat konfigurasi KPI.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

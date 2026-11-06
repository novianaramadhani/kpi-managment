import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userOnboarding, type OnboardingStatusType } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

let tableEnsured = false;

async function ensureOnboardingTable() {
  if (tableEnsured) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_onboarding (
        id serial PRIMARY KEY,
        employee_id integer REFERENCES employees(id) ON DELETE CASCADE,
        nik text NOT NULL UNIQUE,
        status text NOT NULL DEFAULT 'NOT_STARTED',
        current_step integer NOT NULL DEFAULT 1,
        started_at timestamp,
        completed_at timestamp,
        skipped_at timestamp,
        updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_user_onboarding_nik ON user_onboarding(nik);
      CREATE INDEX IF NOT EXISTS idx_user_onboarding_emp ON user_onboarding(employee_id);
    `);
    tableEnsured = true;
  } catch (err) {
    console.error("[Onboarding API] Failed to ensure user_onboarding table:", err);
  }
}

const VALID_STATUSES: OnboardingStatusType[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "SKIPPED",
];

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !user.nik) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    await ensureOnboardingTable();

    const [record] = await db
      .select()
      .from(userOnboarding)
      .where(eq(userOnboarding.nik, user.nik))
      .limit(1);

    if (!record) {
      return NextResponse.json({
        ok: true,
        nik: user.nik,
        status: "NOT_STARTED" as OnboardingStatusType,
        currentStep: 1,
      });
    }

    return NextResponse.json({
      ok: true,
      nik: record.nik,
      status: record.status as OnboardingStatusType,
      currentStep: record.currentStep || 1,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      skippedAt: record.skippedAt,
      updatedAt: record.updatedAt,
    });
  } catch (err) {
    console.error("[GET /api/onboarding] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Gagal memuat status panduan pengguna." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.nik) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    await ensureOnboardingTable();

    const body = await req.json();
    const rawStatus = String(body.status || "IN_PROGRESS").toUpperCase() as OnboardingStatusType;
    const status: OnboardingStatusType = VALID_STATUSES.includes(rawStatus)
      ? rawStatus
      : "IN_PROGRESS";

    const rawStep = Number(body.currentStep);
    const currentStep = Number.isFinite(rawStep)
      ? Math.max(1, Math.min(6, Math.round(rawStep)))
      : 1;

    const now = new Date();

    const [existing] = await db
      .select()
      .from(userOnboarding)
      .where(eq(userOnboarding.nik, user.nik))
      .limit(1);

    if (!existing) {
      const [inserted] = await db
        .insert(userOnboarding)
        .values({
          employeeId: user.id || null,
          nik: user.nik,
          status,
          currentStep,
          startedAt: now,
          completedAt: status === "COMPLETED" ? now : null,
          skippedAt: status === "SKIPPED" ? now : null,
          updatedAt: now,
        })
        .returning();

      return NextResponse.json({
        ok: true,
        nik: inserted.nik,
        status: inserted.status as OnboardingStatusType,
        currentStep: inserted.currentStep,
      });
    }

    const [updated] = await db
      .update(userOnboarding)
      .set({
        employeeId: user.id || existing.employeeId,
        status,
        currentStep,
        startedAt: existing.startedAt || now,
        completedAt: status === "COMPLETED" ? now : existing.completedAt,
        skippedAt: status === "SKIPPED" ? now : existing.skippedAt,
        updatedAt: now,
      })
      .where(eq(userOnboarding.nik, user.nik))
      .returning();

    return NextResponse.json({
      ok: true,
      nik: updated.nik,
      status: updated.status as OnboardingStatusType,
      currentStep: updated.currentStep,
    });
  } catch (err) {
    console.error("[POST /api/onboarding] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan status panduan pengguna." },
      { status: 500 }
    );
  }
}


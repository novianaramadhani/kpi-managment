import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import {
  employees,
  departments,
  jobLevels,
  jobPositions,
  appraisals,
  kpiTemplates,
} from "@/db/schema";
import { eq, and, desc, asc, ilike, or, sql, isNotNull, isNull } from "drizzle-orm";
import { bulkAssignTemplateToEmployees } from "@/lib/assessor-assignment-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || (currentUser.role !== "ADMIN" && currentUser.role !== "HR")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const periodId = Number(searchParams.get("periodId"));
    if (!periodId) {
      return NextResponse.json({ error: "periodId wajib disertakan" }, { status: 400 });
    }

    const deptId = searchParams.get("departmentId") ? Number(searchParams.get("departmentId")) : null;
    const levelId = searchParams.get("jobLevelId") ? Number(searchParams.get("jobLevelId")) : null;
    const positionId = searchParams.get("jobPositionId") ? Number(searchParams.get("jobPositionId")) : null;
    const status = searchParams.get("status") || "ALL"; // 'ALL' | 'ASSIGNED' | 'UNASSIGNED'
    const q = (searchParams.get("search") || "").trim().toLowerCase();
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(10, Number(searchParams.get("limit")) || 50));
    const offset = (page - 1) * limit;

    const conditions = [eq(employees.isActive, true)];

    if (deptId) {
      conditions.push(eq(employees.departmentId, deptId));
    }
    if (levelId) {
      conditions.push(eq(employees.jobLevelId, levelId));
    }
    if (positionId) {
      conditions.push(eq(employees.jobPositionId, positionId));
    }
    if (status === "ASSIGNED") {
      conditions.push(isNotNull(appraisals.templateId));
    } else if (status === "UNASSIGNED") {
      conditions.push(isNull(appraisals.templateId));
    }

    if (q) {
      conditions.push(
        or(
          ilike(employees.name, `%${q}%`),
          ilike(employees.nik, `%${q}%`),
          ilike(employees.jobPosition, `%${q}%`),
          ilike(kpiTemplates.name, `%${q}%`)
        )!
      );
    }

    const baseQuery = db
      .select({
        employeeId: employees.id,
        nik: employees.nik,
        name: employees.name,
        departmentId: employees.departmentId,
        departmentName: departments.name,
        departmentCode: departments.code,
        jobLevelId: employees.jobLevelId,
        jobLevelName: jobLevels.name,
        jobLevelRank: jobLevels.rank,
        jobPositionId: employees.jobPositionId,
        jobPosition: employees.jobPosition,
        templateId: appraisals.templateId,
        templateName: kpiTemplates.name,
        appraisalId: appraisals.id,
        appraisalStatus: appraisals.status,
      })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(jobLevels, eq(employees.jobLevelId, jobLevels.id))
      .leftJoin(jobPositions, eq(employees.jobPositionId, jobPositions.id))
      .leftJoin(
        appraisals,
        and(eq(appraisals.employeeId, employees.id), eq(appraisals.periodId, periodId))
      )
      .leftJoin(kpiTemplates, eq(appraisals.templateId, kpiTemplates.id))
      .where(and(...conditions));

    const totalCountRes = await db
      .select({ count: sql<number>`count(*)` })
      .from(employees)
      .leftJoin(
        appraisals,
        and(eq(appraisals.employeeId, employees.id), eq(appraisals.periodId, periodId))
      )
      .leftJoin(kpiTemplates, eq(appraisals.templateId, kpiTemplates.id))
      .where(and(...conditions));

    const total = Number(totalCountRes[0]?.count || 0);

    const rows = await baseQuery
      .orderBy(asc(departments.code), asc(jobLevels.rank), asc(employees.name))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat penugasan template KPI.";
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
    const { periodId, templateId, employeeIds } = body;

    if (!periodId || !templateId || !employeeIds || !Array.isArray(employeeIds)) {
      return NextResponse.json(
        { error: "periodId, templateId, dan array employeeIds wajib disertakan." },
        { status: 400 }
      );
    }

    const result = await bulkAssignTemplateToEmployees({
      periodId: Number(periodId),
      templateId: Number(templateId),
      employeeIds: employeeIds.map(Number),
      actorId: currentUser.id,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memasang template KPI.";
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
    const periodId = Number(searchParams.get("periodId"));
    const employeeId = Number(searchParams.get("employeeId"));

    if (!periodId || !employeeId) {
      return NextResponse.json(
        { error: "periodId dan employeeId wajib disertakan." },
        { status: 400 }
      );
    }

    // Set templateId to null on the appraisal
    await db
      .update(appraisals)
      .set({
        templateId: null,
        updatedAt: new Date(),
      })
      .where(and(eq(appraisals.periodId, periodId), eq(appraisals.employeeId, employeeId)));

    return NextResponse.json({
      success: true,
      message: "Penugasan template KPI berhasil dilepas.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal melepas penugasan template KPI.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

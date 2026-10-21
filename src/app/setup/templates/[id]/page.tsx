import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { departments, jobLevels, kpiBands, kpiCategories, kpiParameters, kpiTemplates, kpiCalculationRules } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import {
  addBand, addCategory, addParameter, deleteBand, deleteCategory, deleteParameter,
  duplicateParameter, updateBand, updateCategory, updateParameter, updateTemplate,
  getConfig, importTemplateStructure, getMasterParameters, normalizeTemplateSortOrders,
} from "@/lib/actions";
import { TemplateWizardEditor } from "@/components/template-wizard-editor";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tplId = Number(id);
  if (!tplId || isNaN(tplId)) {
    redirect("/setup/templates");
  }
  const [tpl] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, tplId));
  if (!tpl) {
    redirect("/setup/templates");
  }

  // Normalize any duplicate or uninitialized sort orders for consistent 1..n sequencing
  await normalizeTemplateSortOrders(tplId);

  const [deps, lvls, cats, masterParams, calcRules] = await Promise.all([
    db.select().from(departments),
    db.select().from(jobLevels).orderBy(asc(jobLevels.rank)),
    db.select().from(kpiCategories).where(eq(kpiCategories.templateId, tplId)).orderBy(asc(kpiCategories.sortOrder), asc(kpiCategories.id)),
    getMasterParameters(tpl.departmentId),
    db.select().from(kpiCalculationRules).where(eq(kpiCalculationRules.status, "ACTIVE")).orderBy(asc(kpiCalculationRules.id)),
  ]);

  const catIds = cats.map((c) => c.id);
  const paramsList = catIds.length
    ? await db.select().from(kpiParameters).where(inArray(kpiParameters.categoryId, catIds)).orderBy(asc(kpiParameters.sortOrder), asc(kpiParameters.id))
    : [];

  const bands = paramsList.length
    ? await db.select().from(kpiBands).where(inArray(kpiBands.parameterId, paramsList.map((p) => p.id))).orderBy(asc(kpiBands.sortOrder), asc(kpiBands.id))
    : [];

  const maxKpiWeight = await getConfig("max_kpi_category_weight", "115");
  const templateTargetPct = Number(maxKpiWeight) || 115;

  return (
    <div className="w-full min-w-0">
      <TemplateWizardEditor
        template={tpl}
        departments={deps}
        jobLevels={lvls}
        categories={cats}
        parameters={paramsList}
        bands={bands}
        masterParams={masterParams}
        calculationRules={calcRules}
        templateTargetPct={templateTargetPct}
        updateTemplateAction={updateTemplate}
        addCategoryAction={addCategory}
        updateCategoryAction={updateCategory}
        deleteCategoryAction={deleteCategory}
        addParameterAction={addParameter}
        updateParameterAction={updateParameter}
        deleteParameterAction={deleteParameter}
        duplicateParameterAction={duplicateParameter}
        addBandAction={addBand}
        updateBandAction={updateBand}
        deleteBandAction={deleteBand}
        importTemplateStructureAction={importTemplateStructure}
      />
    </div>
  );
}

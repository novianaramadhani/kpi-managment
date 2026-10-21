import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCalculationRulesAction } from "@/lib/formula-rules-actions";
import { FormulaRulesClient } from "@/components/formula-rules/formula-rules-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Formula Engine Rules | KPI System",
  description: "Master aturan formula kalkulasi, target achievement, aggregasi bulanan, dan versioning KPI",
};

export default async function FormulaRulesPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  // Admin access check
  if (currentUser.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const rules = await getCalculationRulesAction();

  return (
    <div className="max-w-7xl mx-auto py-2">
      <FormulaRulesClient initialRules={rules} />
    </div>
  );
}

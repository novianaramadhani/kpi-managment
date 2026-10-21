import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SetupRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; unit?: string }>;
}) {
  const { tab = "karyawan", unit = "ALL" } = await searchParams;

  // Master Data mappings
  if (["karyawan", "departemen", "joblevel", "units", "master"].includes(tab)) {
    const targetTab = tab === "master" ? "departemen" : tab;
    redirect(`/setup/master?tab=${targetTab}${unit !== "ALL" ? `&unit=${unit}` : ""}`);
  }

  // Assignments & Delegation mappings
  if (["penugasan-asesor", "delegasi", "bulk-template"].includes(tab)) {
    redirect(`/setup/assignments?tab=${tab}`);
  }

  // Access & Authority mappings
  if (["hak-akses", "approval"].includes(tab)) {
    redirect(`/setup/access?tab=${tab}`);
  }

  // Standalone routes
  if (tab === "periode") {
    redirect("/setup/periode");
  }
  if (tab === "config") {
    redirect("/setup/config");
  }
  if (tab === "parameter") {
    redirect("/setup/templates?view=parameter");
  }
  if (tab === "template" || tab === "templates" || tab === "master-template") {
    redirect("/setup/templates");
  }
  if (tab === "formula" || tab === "formulas") {
    redirect("/setup/formulas");
  }

  // Default fallback
  redirect("/setup/master?tab=karyawan");
}

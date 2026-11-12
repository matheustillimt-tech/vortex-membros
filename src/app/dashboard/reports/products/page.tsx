import { getDb } from "@/db";
import { getProductsReport, reportCached } from "@/lib/dashboard/reports";
import { ReportProductsBoard } from "@/components/dashboard/report-products-board";
import { getAdmin } from "../../data";

export const metadata = { title: "Relatório de produtos" };

export default async function ProductsReportPage() {
  const user = await getAdmin();
  const r = await reportCached(user, "products", () => getProductsReport(getDb(), user));
  return <ReportProductsBoard rows={r.rows} showcases={r.showcases} />;
}

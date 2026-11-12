import { getDb } from "@/db";
import { SalesBoard } from "@/components/dashboard/sales-board";
import { listSales } from "@/lib/sales/sales-store";
import { getAdmin, getDashboardSettings } from "../data";
import { countSaleErrors, listSaleGateways } from "./data";
import { gatewayLabel, listOptions, parseSalesFilters, toSaleRow } from "./rows";

export const metadata = { title: "Vendas" };

export default async function SalesPage({ searchParams }: PageProps<"/dashboard/sales">) {
  const [user, sp, settings] = await Promise.all([getAdmin(), searchParams, getDashboardSettings()]);
  const first = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? null) : null;
  };
  const all = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? [v] : Array.isArray(v) ? v : [];
  };
  const filters = parseSalesFilters(first, all);
  const db = getDb();
  const [page, errorCount, gateways] = await Promise.all([
    listSales(db, user, listOptions(filters)),
    countSaleErrors(db),
    listSaleGateways(db),
  ]);
  return (
    <SalesBoard
      key={JSON.stringify(filters)}
      filters={filters}
      data={{ rows: page.rows.map(toSaleRow), nextCursor: page.nextCursor, limitReached: page.limitReached, errorCount }}
      gateways={[...new Set([...gateways, ...filters.gateways])].map((g) => ({ value: g, label: gatewayLabel(g) }))}
      ignoredProductIds={settings.kiwify.ignoredProductIds}
    />
  );
}

import Link from "next/link";
import { getDb } from "@/db";
import { GatewayPicker } from "@/components/dashboard/deliveries-board";
import { ArrowLeftIcon } from "@/components/dashboard/icons";
import { SalesSubnav } from "@/components/dashboard/sales-subnav";
import { listDeliveries } from "@/lib/sales/deliveries";
import { getAdmin } from "../../../data";

export const metadata = { title: "Nova Entrega" };

/** Passo 1: só a Kiwify por enquanto (a estrutura aceita outros gateways). */
export default async function NewDeliveryPage() {
  const user = await getAdmin();
  const existing = await listDeliveries(getDb(), user, { archived: false, gateway: "kiwify" });
  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div data-backlink="">
              <Link href="/dashboard/sales/deliveries" className="mb-1 inline-flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-600">
                <ArrowLeftIcon className="h-3.5 w-3.5" />
                Entregas
              </Link>
            </div>
            <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">Selecione um Gateway</h1>
            <div className="mt-1 text-sm text-gray-500">
              <p>Escolha por onde você vende para configurar a entrega</p>
            </div>
          </div>
        </div>
      </div>
      <SalesSubnav current="/dashboard/sales/deliveries" />
      <GatewayPicker recent={existing.length > 0} />
    </div>
  );
}

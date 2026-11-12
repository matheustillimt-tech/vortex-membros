import { headers } from "next/headers";
import { getDb } from "@/db";
import { DeliveryForm } from "@/components/dashboard/delivery-form";
import { getAdmin } from "../../../../data";
import { deliveryFormContext } from "../../data";

export const metadata = { title: "Adicionando Entrega" };

/** Passo 2. */
export default async function CreateKiwifyDeliveryPage() {
  const [user, h] = await Promise.all([getAdmin(), headers()]);
  const ctx = await deliveryFormContext(getDb(), user, h);
  return (
    <DeliveryForm
      {...ctx}
      delivery={{ id: null, name: "", type: "single", codes: [], tagIds: [], items: {}, archived: false, studentCount: 0, lastSale: null }}
    />
  );
}

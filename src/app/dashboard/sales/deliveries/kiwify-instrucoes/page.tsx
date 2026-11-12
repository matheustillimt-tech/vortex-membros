import Link from "next/link";
import { ArrowLeftIcon } from "@/components/dashboard/icons";
import { SalesSubnav } from "@/components/dashboard/sales-subnav";
import { getAdmin } from "../../../data";

export const metadata = { title: "Instruções da Kiwify" };

const STEPS: React.ReactNode[] = [
  <>Na Kiwify, abra <strong className="font-medium text-gray-900">Apps → Webhooks</strong> e clique em <strong className="font-medium text-gray-900">Criar webhook</strong>.</>,
  <>Cole a <strong className="font-medium text-gray-900">URL de Postback</strong> da entrega (Entregas → a entrega → Conexão com o gateway → Copiar). É a mesma para todas as entregas.</>,
  <>
    Marque os eventos <strong className="font-medium text-gray-900">Compra aprovada</strong>, <strong className="font-medium text-gray-900">Reembolso</strong>,{" "}
    <strong className="font-medium text-gray-900">Chargeback</strong>, <strong className="font-medium text-gray-900">Assinatura cancelada</strong>,{" "}
    <strong className="font-medium text-gray-900">Assinatura atrasada</strong> e <strong className="font-medium text-gray-900">Assinatura renovada</strong>, e escolha os produtos.
  </>,
  <>Salve. A Kiwify mostra um <strong className="font-medium text-gray-900">token</strong>: copie e cole no campo &quot;Token da Kiwify (opcional)&quot; da entrega para só aceitarmos vendas assinadas.</>,
  <>Em cada entrega, informe no &quot;Código do Produto ou Plano&quot; o ID do produto na Kiwify (todas as ofertas usam o mesmo ID do produto principal).</>,
];

/** Passo a passo da Kiwify (link "Instruções" da entrega). */
export default async function KiwifyInstructionsPage() {
  await getAdmin();
  return (
    <div>
      <div className="mb-6">
        <div className="min-w-0">
          <div data-backlink="">
            <Link href="/dashboard/sales/deliveries" className="mb-1 inline-flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-600">
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              Entregas
            </Link>
          </div>
          <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">Conectar a Kiwify</h1>
          <p className="mt-1 text-sm text-gray-500">Como enviar as vendas da Kiwify para as entregas</p>
        </div>
      </div>
      <SalesSubnav current="/dashboard/sales/deliveries" />
      <div className="min-w-0 max-w-2xl rounded-lg border border-gray-200 bg-white">
        <ol className="painel-linhas">
          {STEPS.map((step, i) => (
            <li key={i} className="flex gap-4 p-5">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-hint font-semibold text-brand-600">{i + 1}</span>
              <p className="text-sm leading-relaxed text-gray-700">{step}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { getSaleAction, reprocessSaleAction } from "@/app/dashboard/sales/actions";
import { PROCESSING, SALE_STATUS, type SaleDetail } from "@/app/dashboard/sales/rows";
import { buttonClass } from "./button";
import { Drawer } from "./drawer";
import { AlertCircleIcon, CheckIcon, CopyIcon, RefreshIcon } from "./icons";
import { Spinner } from "./panel-dialog";
import { toFormData, useAdminAction } from "./use-admin-action";

type Tab = "dados" | "payload";

/**
 * Logo do gateway na caixa 36×36 com borda (coluna Gateway e topo da gaveta). Ainda sem o arquivo
 * do logo da Kiwify no projeto: mostra a inicial do gateway no lugar da imagem.
 */
export function GatewayLogo({ gateway, label, size = "md" }: { gateway: string; label: string; size?: "md" | "lg" | "list" }) {
  // "list": coluna Entrega (caixa cinza sem borda)
  const box =
    size === "list"
      ? "h-10 w-10 rounded-md bg-gray-100"
      : `${size === "lg" ? "h-11 w-11 rounded-xl" : "h-9 w-9 rounded-lg"} border border-gray-200 bg-white`;
  return (
    <div data-gateway={gateway} className={`flex ${box} flex-shrink-0 items-center justify-center`}>
      <span aria-hidden="true" className="text-sm font-semibold text-gray-700">
        {label.slice(0, 1).toUpperCase()}
      </span>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="max-w-[60%] break-words text-right text-sm font-medium text-gray-900">{children}</dd>
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" className="absolute inset-0 z-10 bg-white p-5">
      <span className="sr-only">Carregando…</span>
      <div className="animate-pulse space-y-6" aria-hidden="true">
        {["w-32", "w-20", "w-28"].map((w) => (
          <div key={w} className="space-y-2">
            <div className={`h-3 ${w} rounded bg-gray-200`} />
            <div className="h-10 w-full rounded-lg bg-gray-100" />
          </div>
        ))}
        <div className="h-24 w-full rounded-lg bg-gray-100" />
      </div>
    </div>
  );
}

/** Aviso (erro em vermelho; `notice` de conferência em âmbar) acima dos dados. */
function Callout({ tone, children }: { tone: "danger" | "warning"; children: React.ReactNode }) {
  const colors = tone === "danger" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={`flex rounded-lg border text-sm items-start gap-2 p-3 ${colors} mb-4`}>
      <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="">{children}</div>
      </div>
    </div>
  );
}

function Payload({ json }: { json: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div className="flex flex-1 flex-col">
      <div className="relative flex flex-1 flex-col">
        <button
          className="btn-icone absolute right-3 top-3 z-10"
          type="button"
          aria-label="Copiar payload"
          onClick={() => navigator.clipboard?.writeText(json).then(() => setCopied(true), () => undefined)}
        >
          {copied ? <CheckIcon className="h-4 w-4 text-emerald-500" /> : <CopyIcon className="h-4 w-4" />}
        </button>
        <div className="code-input flex min-h-44 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15">
          <pre
            role="textbox"
            aria-readonly="true"
            aria-label="Payload"
            tabIndex={0}
            className="scroll-fino min-h-0 flex-1 overflow-auto whitespace-pre p-3 pr-12 font-mono text-[.8125rem] leading-[1.4] text-gray-900 outline-none"
          >
            {json}
          </pre>
        </div>
      </div>
    </div>
  );
}

/**
 * Gaveta "Detalhes da Venda": logo e selo do
 * processamento, abas Dados/Payload, erro e aviso, rodapé Fechar + Reprocessar/Forçar Reprocessamento.
 * Renderizar com `key={saleId}`: trocar de venda zera o estado.
 */
export function SaleDrawer({
  saleId,
  onClose,
  onChanged,
  ignoredProductIds,
  onIgnoreProduct,
}: {
  saleId: number | null;
  onClose: () => void;
  /** Depois de reprocessar: a lista recarrega. */
  onChanged: () => void;
  ignoredProductIds: string[];
  onIgnoreProduct: (productId: string) => void;
}) {
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("dados");
  const { pending, error, run } = useAdminAction();

  async function load(id: number) {
    const res = await getSaleAction(toFormData({ id }));
    if (res.ok) {
      setSale(res.sale);
      setLoadError(null);
    } else setLoadError(res.error);
  }

  useEffect(() => {
    if (saleId === null) return;
    let alive = true;
    getSaleAction(toFormData({ id: saleId })).then((res) => {
      if (!alive) return;
      if (res.ok) setSale(res.sale);
      else setLoadError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [saleId]);

  const loading = saleId !== null && !sale && !loadError;
  const failed = sale?.processing === "error" || sale?.processing === "queued";

  function reprocess() {
    if (!sale) return;
    run(reprocessSaleAction, { id: sale.id }, {
      onOk: () => {
        void load(sale.id);
        onChanged();
      },
    });
  }

  const tabClass = (on: boolean) =>
    `flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-wait disabled:opacity-60 flex-1 px-3 text-hint ${
      on ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-700"
    }`;

  return (
    <Drawer
      name="sale-detail"
      open={saleId !== null}
      onClose={onClose}
      title="Detalhes da Venda"
      widthClass="max-w-lg"
      bodyClassName="p-5"
      footer={
        sale ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className={buttonClass("outline", "grow justify-center")}>
              Fechar
            </button>
            <button type="button" disabled={pending} onClick={reprocess} className={buttonClass(failed ? "primary" : "outline", "grow justify-center")}>
              {pending ? <Spinner /> : <RefreshIcon className="h-4 w-4" />}
              {failed ? "Reprocessar" : "Forçar Reprocessamento"}
            </button>
          </div>
        ) : loading ? (
          <div aria-hidden="true" className="h-10 w-full animate-pulse rounded-lg bg-gray-100" />
        ) : undefined
      }
    >
      {loading ? <Skeleton /> : null}
      {loadError ? <Callout tone="danger">{loadError}</Callout> : null}
      {sale ? (
        <div className="flex min-h-full flex-col">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <GatewayLogo gateway={sale.gateway} label={sale.gatewayLabel} />
              <span className="text-sm font-medium text-gray-900">{sale.gatewayLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`selo selo--${PROCESSING[sale.processing].tone}`}>{PROCESSING[sale.processing].label}</span>
            </div>
          </div>
          <div className="scroll-fino mb-5 min-w-0 overflow-x-auto">
            <div className="flex h-[34px] w-full select-none items-center rounded-lg bg-gray-100 p-0.5">
              <button type="button" className={tabClass(tab === "dados")} aria-pressed={tab === "dados"} onClick={() => setTab("dados")}>
                Dados
              </button>
              <button type="button" className={tabClass(tab === "payload")} aria-pressed={tab === "payload"} onClick={() => setTab("payload")}>
                Payload
              </button>
            </div>
          </div>
          {error ? <Callout tone="danger">{error}</Callout> : null}
          {tab === "dados" ? (
            <div>
              {sale.error ? <Callout tone="danger">{sale.error}</Callout> : null}
              {sale.notice ? <Callout tone="warning">{sale.notice}</Callout> : null}
              <dl className="divide-y divide-gray-100">
                <Item label="Recebido em">{sale.receivedAtLong}</Item>
                <Item label="Status da venda">{SALE_STATUS[sale.status].label}</Item>
                {sale.offer ? <Item label="Oferta">{sale.offer}</Item> : null}
                <Item label="Gateway">{sale.gatewayLabel}</Item>
                {sale.orderId ? <Item label="ID da venda">{sale.orderId}</Item> : null}
                {sale.productName ? <Item label="Produto">{sale.productName}</Item> : null}
                {sale.productIds.length ? (
                  <Item label="ID do produto no gateway">
                    {sale.processing === "error" ? (
                      <span className="flex flex-wrap justify-end gap-1">
                        {sale.productIds.map((pid) =>
                          ignoredProductIds.includes(pid) ? (
                            <span key={pid} className="rounded-md border border-gray-200 px-1.5 py-0.5 font-mono text-micro text-gray-400">
                              {pid}
                            </span>
                          ) : (
                            <button
                              key={pid}
                              type="button"
                              title="Adicionar à lista de produtos ignorados"
                              onClick={() => onIgnoreProduct(pid)}
                              className="rounded-md border border-gray-200 px-1.5 py-0.5 font-mono text-micro text-gray-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                            >
                              {pid}
                            </button>
                          ),
                        )}
                      </span>
                    ) : (
                      sale.productIds.join(", ")
                    )}
                  </Item>
                ) : null}
                {sale.amount ? <Item label="Valor">{sale.amount}</Item> : null}
                {sale.paymentMethod ? <Item label="Método de pagamento">{sale.paymentMethod}</Item> : null}
                {sale.name ? <Item label="Cliente">{sale.name}</Item> : null}
                {sale.document ? <Item label="CPF ou CNPJ">{sale.document}</Item> : null}
                {sale.email ? <Item label="E-mail">{sale.email}</Item> : null}
              </dl>
            </div>
          ) : (
            <Payload json={sale.payloadJson} />
          )}
        </div>
      ) : null}
    </Drawer>
  );
}

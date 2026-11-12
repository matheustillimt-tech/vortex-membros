"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  applyDeliveryTagsAction,
  archiveDeliveryAction,
  createDeliveryAction,
  duplicateDeliveryAction,
  renameDeliveryAction,
  restoreDeliveryAction,
  saveSignatureTokenAction,
  updateDeliveryAction,
} from "@/app/dashboard/sales/deliveries/actions";
import type { DeliveryTarget, DeliveryType, DurationType } from "@/db/schema";
import { buttonClass } from "./button";
import { ChipsInput } from "./chips-input";
import { ContentSummary, DeliveryContentTree, type ItemsState, type ScheduleOption, type TreeShowcase } from "./delivery-content-tree";
import { Dropdown, MenuItem } from "./dropdown";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  CopyToIcon,
  ExternalLinkIcon,
  RefreshIcon,
  RotateCcwIcon,
  ShoppingCartIcon,
  SlidersIcon,
  ChevronDownIcon,
  TagIcon,
} from "./icons";
import { InlineName } from "./inline-name";
import { INPUT_CLASS } from "./input";
import { ConfirmDialog } from "./panel-dialog";
import { isSaveBarOpen, SaveBar, useSaveState } from "./save-bar";
import { GatewayLogo } from "./sale-drawer";
import { SalesSubnav } from "./sales-subnav";
import { Tip } from "./settings-form";
import { TagPicker, type TagOption } from "./tag-picker";
import { useAdminAction } from "./use-admin-action";

export type DeliveryFormData = {
  id: number | null;
  name: string;
  type: DeliveryType;
  codes: string[];
  tagIds: number[];
  items: ItemsState;
  archived: boolean;
  studentCount: number;
  lastSale: { relative: string; title: string } | null;
};

/** Itens do estado da árvore → JSON da action (o formato é validado no servidor). */
function itemsPayload(items: ItemsState): string {
  return JSON.stringify(
    Object.entries(items).map(([key, s]) => {
      const [kind, raw] = key === "all" ? ["all", null] : key.split(":");
      const targetType: DeliveryTarget = kind === "all" ? "all" : kind === "s" ? "showcase" : "product";
      const lifetime = s.durationType === "lifetime";
      return {
        targetType,
        targetId: raw === null ? null : Number(raw),
        durationType: s.durationType as DurationType,
        duration: lifetime ? null : s.duration === "" ? null : Number(s.duration),
        scheduleId: s.scheduleId ? Number(s.scheduleId) : null,
      };
    }),
  );
}

const ROW_LABEL = "flex items-center gap-1.5 mb-2 md:mb-0 md:pt-2";

function FieldLabel({ children, tip, htmlFor, required }: { children: React.ReactNode; tip: string; htmlFor?: string; required?: boolean }) {
  const text = (
    <>
      {children} {required ? <span className="text-red-500">*</span> : null}
    </>
  );
  return (
    <div className={ROW_LABEL}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-sm text-gray-700">
          {text}
        </label>
      ) : (
        <span className="text-sm text-gray-700">{text}</span>
      )}
      <Tip text={tip} />
    </div>
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div className="relative w-full">
      <div className="flex h-9 items-center rounded-lg border border-gray-200 bg-gray-50">
        <input
          readOnly
          value={value}
          aria-label={label}
          type="text"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full cursor-pointer bg-transparent px-3 text-hint text-gray-600 outline-none"
        />
        <span className="tooltip flex-shrink-0">
          <button
            type="button"
            aria-label="Copiar"
            title="Copiar"
            onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true), () => undefined)}
            className="flex h-9 w-10 flex-shrink-0 items-center justify-center rounded-r-[calc(var(--radius-lg)-1px)] border-l border-gray-200 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            {copied ? <CheckIcon className="h-4 w-4 text-emerald-500" /> : <CopyIcon className="h-4 w-4" />}
          </button>
        </span>
      </div>
    </div>
  );
}

/**
 * Formulário da entrega: "Adicionando Entrega" e edição
 *. Cards Identificação, Conexão com o gateway e Conteúdo entregue;
 * salva com a save bar (⌘/Ctrl+S).
 */
export function DeliveryForm({
  delivery,
  tree,
  schedules,
  tags: initialTags,
  postbackUrl,
  signatureToken,
}: {
  delivery: DeliveryFormData;
  tree: TreeShowcase[];
  schedules: ScheduleOption[];
  tags: TagOption[];
  postbackUrl: string;
  signatureToken: string;
}) {
  const router = useRouter();
  const editing = delivery.id !== null;
  const { pending, error, run } = useAdminAction();
  const header = useAdminAction();
  const [name, setName] = useState(delivery.name);
  const [type, setType] = useState<DeliveryType>(delivery.type);
  const [codes, setCodes] = useState(delivery.codes);
  const [tagIds, setTagIds] = useState(delivery.tagIds);
  const [tags, setTags] = useState(initialTags);
  const [items, setItems] = useState<ItemsState>(delivery.items);
  const [token, setToken] = useState(signatureToken);
  const [savedToken, setSavedToken] = useState(signatureToken);
  const [dialog, setDialog] = useState<"archive" | "restore" | "applyTags" | null>(null);
  const { dirty, saved, markDirty, markSaved } = useSaveState(() => save());
  const open = isSaveBarOpen({ dirty, saved, pending, error });

  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      markDirty();
    };

  // Criar uma vez só: ⌘S/Enter repetidos não enfileiram outra criação.
  const creating = useRef(false);

  function save() {
    if (pending || creating.current) return;
    const fd = new FormData();
    if (editing) fd.set("id", String(delivery.id));
    if (!editing) fd.set("name", name); // na edição, o nome muda pelo cabeçalho
    fd.set("type", type);
    for (const c of codes) fd.append("codes", c);
    for (const t of tagIds) fd.append("tagIds", String(t));
    fd.set("items", itemsPayload(items));
    if (token.trim() !== savedToken) {
      run(saveSignatureTokenAction, { token }, { onOk: () => setSavedToken(token.trim()) });
    }
    if (editing) {
      run(updateDeliveryAction, fd, { onOk: markSaved });
    } else {
      creating.current = true;
      run(createDeliveryAction, fd, {
        onError: () => {
          creating.current = false;
        },
        onOk: (res) => {
          markSaved();
          if (res.id) router.push(`/dashboard/sales/deliveries/${res.id}/edit`);
        },
      });
    }
  }

  const contextButtons = editing ? (
    <>
      <button
        type="button"
        disabled={header.pending}
        onClick={() =>
          header.run(duplicateDeliveryAction, { id: delivery.id }, { onOk: (res) => res.id && router.push(`/dashboard/sales/deliveries/${res.id}/edit`) })
        }
        className={buttonClass("ghost", "flex-shrink-0")}
      >
        <CopyToIcon className="h-4 w-4" />
        Duplicar
      </button>
      {delivery.archived ? (
        <button type="button" onClick={() => setDialog("restore")} className={buttonClass("ghost", "flex-shrink-0")}>
          <RotateCcwIcon className="h-4 w-4" />
          Restaurar
        </button>
      ) : (
        <button type="button" onClick={() => setDialog("archive")} className={buttonClass("dangerGhost", "flex-shrink-0")}>
          <ArchiveIcon className="h-4 w-4" />
          Arquivar
        </button>
      )}
    </>
  ) : null;

  const shownError = error ?? header.error;

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
            {editing ? (
              <div className="py-1.5">
                <InlineName
                  label={`Renomear a entrega ${delivery.name}`}
                  value={delivery.name}
                  textClassName="text-xl font-semibold text-gray-900"
                  onSave={(n) => header.run(renameDeliveryAction, { id: delivery.id, name: n }, { onOk: () => router.refresh() })}
                />
              </div>
            ) : (
              <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">Adicionando Entrega</h1>
            )}
            <div className="mt-1 text-sm text-gray-500">
              <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span>Kiwify</span>
                {editing ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-brand-600">
                      {delivery.studentCount.toLocaleString("pt-BR")} {delivery.studentCount === 1 ? "aluno" : "alunos"}
                    </span>
                  </>
                ) : null}
              </span>
            </div>
          </div>
        </div>
      </div>

      <SalesSubnav
        current="/dashboard/sales/deliveries"
        actions={
          contextButtons ? (
            <div data-context-actions="" className="flex flex-shrink-0 items-center gap-2 py-1 max-lg:hidden">
              {contextButtons}
            </div>
          ) : undefined
        }
      />

      {editing ? (
        <div data-toolbar="" className="mb-6 flex flex-wrap items-center gap-2 lg:hidden">
          <div data-acoes-botao="" className="ml-auto flex flex-shrink-0 items-center">
            <Dropdown
              trigger={(p) => (
                <button type="button" {...p} className={buttonClass("outline")}>
                  <SlidersIcon className="h-4 w-4" />
                  Ações
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                </button>
              )}
            >
              <MenuItem
                icon={<CopyToIcon className="h-4 w-4 flex-shrink-0" />}
                onSelect={() =>
                  header.run(duplicateDeliveryAction, { id: delivery.id }, { onOk: (res) => res.id && router.push(`/dashboard/sales/deliveries/${res.id}/edit`) })
                }
              >
                Duplicar
              </MenuItem>
              {delivery.archived ? (
                <MenuItem icon={<RotateCcwIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setDialog("restore")}>
                  Restaurar
                </MenuItem>
              ) : (
                <MenuItem tone="danger" icon={<ArchiveIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setDialog("archive")}>
                  Arquivar
                </MenuItem>
              )}
            </Dropdown>
          </div>
        </div>
      ) : null}

      {shownError ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
          {shownError}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className={open ? "savebar-aberta" : undefined}
      >
        <fieldset className="min-w-0 space-y-6">
          <div className="painel-aside grid scroll-mt-24 items-start gap-3 md:grid-cols-[280px_1fr] md:gap-8" id="entrega-config">
            <div className="min-w-0 md:pt-7">
              <h2 className="text-sm font-semibold text-gray-900">Identificação</h2>
              {editing ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      header.setError(null);
                      setDialog("applyTags");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-hint font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <TagIcon className="h-4 w-4" /> Aplicar tags em todos os alunos
                  </button>
                </div>
              ) : null}
            </div>
            <div className="min-w-0 rounded-lg border border-gray-200 bg-white">
              <div className="painel-linhas">
                {!editing ? (
                  <div className="p-5 md:grid md:grid-cols-[2fr_3fr] md:items-start md:gap-8">
                    <FieldLabel htmlFor="nome" required tip="Essa informação vai te ajudar a identificar essa entrega mais tarde.">
                      Nome da Entrega
                    </FieldLabel>
                    <div className="min-w-0 md:flex md:flex-col md:items-end">
                      <input type="text" name="nome" id="nome" maxLength={120} value={name} onChange={(e) => change(setName)(e.target.value)} className={INPUT_CLASS} />
                    </div>
                  </div>
                ) : null}
                <div className="p-5 md:grid md:grid-cols-[2fr_3fr] md:items-start md:gap-8">
                  <FieldLabel tip="O acesso é removido automaticamente quando o gateway informa cancelamento ou reembolso.">Modalidade de Venda</FieldLabel>
                  <div className="min-w-0 md:flex md:flex-col md:items-end">
                    <div role="radiogroup" aria-label="Modalidade de Venda" className="inline-flex max-w-full flex-wrap rounded-lg border border-gray-200 p-0.5">
                      {(
                        [
                          { value: "single", label: "Venda única", Icon: ShoppingCartIcon },
                          { value: "subscription", label: "Assinatura", Icon: RefreshIcon },
                        ] as const
                      ).map(({ value, label, Icon }) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={type === value}
                          onClick={() => type !== value && change(setType)(value)}
                          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-hint font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            type === value ? "bg-brand-50 text-brand-700" : "text-gray-400 hover:text-gray-700"
                          }`}
                        >
                          <Icon className="h-4 w-4" /> {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-5 md:grid md:grid-cols-[1fr_3fr] md:items-center md:gap-8">
                  <div className="mb-2 flex items-center gap-1.5 md:mb-0">
                    <span className="text-sm text-gray-700">Tags</span>
                    <Tip text="Tags aplicadas aos alunos que entrarem por esta entrega." />
                  </div>
                  <div className="min-w-0 md:flex md:flex-col md:items-end">
                    <TagPicker
                      tags={tags}
                      selected={tagIds}
                      onChange={change(setTagIds)}
                      onTagCreated={(t) => setTags((list) => (list.some((x) => x.id === t.id) ? list : [...list, t].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))))}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="painel-aside grid items-start gap-3 md:grid-cols-[280px_1fr] md:gap-8">
            <div className="min-w-0 md:pt-7">
              <h2 className="text-sm font-semibold text-gray-900">Conexão com o gateway</h2>
            </div>
            <div className="min-w-0 rounded-lg border border-gray-200 bg-white">
              <div className="painel-linhas">
                <div className="flex items-center gap-3 p-5">
                  <GatewayLogo gateway="kiwify" label="Kiwify" size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">Kiwify</p>
                    {editing ? (
                      <p className="mt-0.5 text-hint text-gray-500" title={delivery.lastSale?.title}>
                        {delivery.lastSale ? `Última venda recebida ${delivery.lastSale.relative}` : "Nenhuma venda recebida ainda"}
                      </p>
                    ) : null}
                  </div>
                  <a
                    href="/dashboard/sales/deliveries/kiwify-instrucoes"
                    target="_blank"
                    rel="noopener"
                    className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-hint font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:ring-offset-2"
                  >
                    <ExternalLinkIcon className="h-4 w-4" /> Instruções
                  </a>
                </div>
                <div className="p-5 md:grid md:grid-cols-[1fr_3fr] md:items-start md:gap-8">
                  <FieldLabel htmlFor="engineIds" required tip="Cole aqui o identificador que o gateway dá para cada produto ou oferta.">
                    Código do Produto ou Plano
                  </FieldLabel>
                  <div className="min-w-0 md:flex md:flex-col md:items-end">
                    <div className="w-full">
                      <ChipsInput id="engineIds" values={codes} onChange={change(setCodes)} placeholder="Adicionar identificador…" />
                    </div>
                  </div>
                </div>
                <div className="p-5 md:grid md:grid-cols-[1fr_3fr] md:items-start md:gap-8">
                  <FieldLabel tip="Cole este endereço no seu gateway. É por ele que cada venda chega até aqui e libera o acesso do aluno.">URL de Postback</FieldLabel>
                  <div className="min-w-0 md:flex md:flex-col md:items-end">
                    <CopyField value={postbackUrl} label="URL de Postback" />
                  </div>
                </div>
                <div className="p-5 md:grid md:grid-cols-[1fr_3fr] md:items-start md:gap-8">
                  <FieldLabel htmlFor="kiwifyToken" tip="Se preencher, só aceitamos vendas assinadas com este token.">
                    Token da Kiwify (opcional)
                  </FieldLabel>
                  <div className="min-w-0 md:flex md:flex-col md:items-end">
                    <input
                      type="text"
                      id="kiwifyToken"
                      name="kiwifyToken"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={200}
                      value={token}
                      onChange={(e) => change(setToken)(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                      className={`${INPUT_CLASS} font-mono`}
                    />
                    <p className="mt-1.5 w-full text-hint text-gray-500">Se preencher, só aceitamos vendas assinadas com este token.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </fieldset>

        <div className="mt-6 grid items-start gap-3 md:grid-cols-[280px_1fr] md:gap-8">
          <div className="min-w-0 md:pt-3">
            <h2 className="text-sm font-semibold text-gray-900">Conteúdo entregue</h2>
            <ContentSummary tree={tree} items={items} />
          </div>
          <DeliveryContentTree tree={tree} schedules={schedules} items={items} onChange={change(setItems)} />
        </div>

        <SaveBar dirty={dirty} saved={saved} pending={pending} error={error} />
      </form>

      {editing ? (
        <>
          <ConfirmDialog
            open={dialog === "archive"}
            onClose={() => setDialog(null)}
            tone="danger"
            icon={<ArchiveIcon className="h-5 w-5" />}
            title="Arquivar entrega"
            confirmLabel="Sim, arquivar"
            pending={header.pending}
            error={header.error}
            onConfirm={() => header.run(archiveDeliveryAction, { id: delivery.id }, { onOk: () => router.push("/dashboard/sales/deliveries") })}
          >
            Arquivar &quot;{delivery.name}&quot;? Ela deixa de processar novas vendas; os acessos já entregues aos alunos não são alterados. Você pode restaurá-la depois.
          </ConfirmDialog>
          <ConfirmDialog
            open={dialog === "restore"}
            onClose={() => setDialog(null)}
            tone="brand"
            icon={<RotateCcwIcon className="h-5 w-5" />}
            title="Restaurar entrega"
            confirmLabel="Sim, restaurar"
            pending={header.pending}
            error={header.error}
            onConfirm={() =>
              header.run(restoreDeliveryAction, { id: delivery.id }, {
                onOk: () => {
                  setDialog(null);
                  router.refresh();
                },
              })
            }
          >
            Restaurar &quot;{delivery.name}&quot;? Ela volta a aparecer na listagem e a processar as vendas recebidas do gateway.
          </ConfirmDialog>
          <ConfirmDialog
            open={dialog === "applyTags"}
            onClose={() => setDialog(null)}
            tone="brand"
            icon={<TagIcon className="h-5 w-5" />}
            title="Aplicar tags aos alunos?"
            confirmLabel="Sim, aplicar"
            pending={header.pending}
            error={header.error}
            onConfirm={() => header.run(applyDeliveryTagsAction, { id: delivery.id }, { onOk: () => setDialog(null) })}
          >
            Isto aplica as tags desta entrega a todos os alunos que já a possuem. É retroativo e pode afetar muitos alunos — não dá para desfazer em massa.
          </ConfirmDialog>
        </>
      ) : null}
    </div>
  );
}

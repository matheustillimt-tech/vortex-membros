"use client";

import { useEffect, useRef } from "react";
import Sortable from "sortablejs";

export type SortableMove = {
  /** `data-id` do item arrastado. */
  id: number;
  /** `data-parent-id` da lista de origem/destino ("" = topo → null). */
  fromParent: number | null;
  toParent: number | null;
  oldIndex: number;
  newIndex: number;
};

function parentOf(el: HTMLElement): number | null {
  const v = el.dataset.parentId;
  return v ? Number(v) : null;
}

/**
 * Lista arrastável (SortableJS, alça `.handle`). O DOM é devolvido ao lugar original no fim do arraste
 * e a mudança vai para `onMove`; quem renderiza é sempre o React (estado), nunca o Sortable.
 * Os filhos diretos precisam ser só os itens, cada um com `data-id`.
 */
export function SortableList({
  group,
  parentId,
  type,
  onMove,
  disabled = false,
  className,
  nested = false,
  children,
}: {
  /** Listas com o mesmo `group` trocam itens entre si. */
  group: string;
  parentId: number | null;
  /** `data-sortable-type` (vitrine, produto, secao, aula). */
  type: string;
  onMove: (move: SortableMove) => void;
  disabled?: boolean;
  className?: string;
  nested?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sortable = Sortable.create(el, {
      group,
      handle: ".handle",
      draggable: "[data-id]",
      animation: 150,
      emptyInsertThreshold: 24,
      fallbackOnBody: true,
      onEnd(evt) {
        const { item, from, to } = evt;
        const oldIndex = evt.oldDraggableIndex ?? evt.oldIndex ?? 0;
        const newIndex = evt.newDraggableIndex ?? evt.newIndex ?? 0;
        if (from === to && oldIndex === newIndex) return;
        // Desfaz a mudança do Sortable no DOM; o React vai re-renderizar a partir do estado.
        const siblings = Array.from(from.children).filter((c) => c !== item);
        from.insertBefore(item, siblings[oldIndex] ?? null);
        onMoveRef.current({
          id: Number(item.dataset.id),
          fromParent: parentOf(from),
          toParent: parentOf(to),
          oldIndex,
          newIndex,
        });
      },
    });
    return () => sortable.destroy();
  }, [group]);

  useEffect(() => {
    // Sortable guarda as opções; `disabled` muda sem recriar a instância.
    const el = ref.current;
    if (el) Sortable.get(el)?.option("disabled", disabled);
  }, [disabled]);

  return (
    <div
      ref={ref}
      data-sortable-type={type}
      data-parent-id={parentId ?? ""}
      data-nested={nested ? "" : undefined}
      className={className}
    >
      {children}
    </div>
  );
}

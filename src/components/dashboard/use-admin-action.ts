"use client";

import { useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/app/dashboard/action-utils";

export type Fields = Record<string, string | number | null | undefined>;

export function toFormData(fields: Fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.set(k, String(v));
  return fd;
}

/**
 * Executa server actions do painel numa transição e guarda o erro para exibir. As chamadas
 * entram numa fila (uma por vez, na ordem): uma edição feita enquanto outra está em andamento
 * não se perde. Botões que não devem repetir (Duplicar, Excluir…) ficam desativados com `pending`.
 */
export function useAdminAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  function run(
    action: (fd: FormData) => Promise<ActionResult>,
    input: Fields | FormData,
    opts: { onOk?: (res: Extract<ActionResult, { ok: true }>) => void; onError?: () => void } = {},
  ) {
    setError(null);
    const fd = input instanceof FormData ? input : toFormData(input);
    queue.current = queue.current.then(
      () =>
        new Promise<void>((resolve) => {
          startTransition(async () => {
            try {
              const res = await action(fd);
              if (!res.ok) {
                setError(res.error);
                opts.onError?.();
              } else opts.onOk?.(res);
            } catch {
              setError("Não foi possível salvar.");
              opts.onError?.();
            } finally {
              resolve();
            }
          });
        }),
    );
  }

  return { pending, error, setError, run };
}

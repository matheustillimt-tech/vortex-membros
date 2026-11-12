import type { Instrumentation } from "next";

let alerter: ReturnType<typeof import("@/lib/error-alert").alerterFromEnv> | null = null;

/** Erro no servidor (página, rota, server action ou proxy) → e-mail de alerta (src/lib/error-alert.ts). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    alerter ??= (await import("@/lib/error-alert")).alerterFromEnv();
    await alerter(err, request, context);
  } catch {
    // O alerta nunca pode derrubar a resposta.
  }
};

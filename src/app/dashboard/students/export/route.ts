import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { resolveDashboardAccess } from "@/lib/admin/guard";
import { getUserFromRequest } from "@/lib/auth/current-user";
import { safeErrorSummary } from "@/lib/log";
import { studentsCsv } from "@/lib/students/admin";

/** "Exportar alunos" → "Sim, exportar": CSV (UTF-8 com BOM, `;`) de todos os alunos não excluídos, em streaming. */
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (resolveDashboardAccess(user) !== "ok") return new Response("Acesso restrito a administradores.", { status: 403 });
  const rows = studentsCsv(getDb(), user);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await rows.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (e) {
        console.error("[alunos] exportação falhou:", safeErrorSummary(e));
        controller.error(e);
      }
    },
    async cancel() {
      await rows.return(undefined);
    },
  });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="alunos-${day}.csv"`,
      "cache-control": "no-store",
    },
  });
}

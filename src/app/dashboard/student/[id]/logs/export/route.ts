import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { resolveDashboardAccess } from "@/lib/admin/guard";
import { getUserFromRequest } from "@/lib/auth/current-user";
import { logsCsv } from "@/lib/students/admin";

/** "Exportar logs" → "Sim, exportar": CSV com todos os logs do aluno. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(req);
  if (resolveDashboardAccess(user) !== "ok") return new Response("Acesso restrito a administradores.", { status: 403 });
  const { id: raw } = await params;
  if (!/^\d{1,15}$/.test(raw)) return new Response("Not Found", { status: 404 });
  const csv = await logsCsv(getDb(), user, Number(raw));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="logs-aluno-${raw}.csv"`,
      "cache-control": "no-store",
    },
  });
}

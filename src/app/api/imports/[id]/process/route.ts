import { createHash, timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { runImport } from "@/app/dashboard/students/imports/run";

export const maxDuration = 60;

const sha = (s: string) => createHash("sha256").update(s).digest();

/** Continuação de uma importação grande (chamada por ela mesma com o CRON_SECRET). Responde já e processa no after(). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/imports/[id]/process">) {
  const secret = process.env.CRON_SECRET?.trim();
  const header = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(sha(header), sha(`Bearer ${secret}`))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: raw } = await ctx.params;
  if (!/^\d{1,15}$/.test(raw)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  after(() => runImport(Number(raw)));
  return NextResponse.json({ ok: true }, { status: 202 });
}

/**
 * npm run admin:ensure -> garante o admin inicial (BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME).
 * Roda em todo deploy de produção (vercel-build), depois do seed:sync, mas só age uma vez por e-mail
 * (marcador em platform_settings). Não envia e-mail: o dono entra
 * por "Esqueceu sua senha?". Imprime só o resultado (nunca e-mail, senha ou token).
 */
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { platformSettings, users } from "@/db/schema";
import { generateAdminPassword } from "@/lib/admin/administrators";
import { hashPassword } from "@/lib/auth/password";
import { generateLoginToken, normalizeEmail } from "@/lib/auth/tokens";

export type EnsureAdminResult = "created" | "promoted" | "unchanged" | "skipped";

/**
 * Uma vez só por e-mail. Sem e-mail → skipped. O resultado fica marcado em platform_settings
 * (`bootstrapAdmin: { email, at }`); com o marcador já no mesmo e-mail → unchanged, sem tocar no
 * usuário (quem foi removido no painel continua removido). Primeira vez (ou e-mail diferente):
 * já admin → unchanged (só preenche admin_role antigo); cadastro existente (aluno ou excluído) →
 * promoted: admin root com a mesma senha e sessões, e login_token novo; novo → created, com senha
 * aleatória que ninguém vê (descartada) e token novo.
 */
export async function ensureBootstrapAdmin(db: Database, opts: { email?: string; name?: string }): Promise<EnsureAdminResult> {
  const email = normalizeEmail(opts.email ?? "");
  if (!email) return "skipped";
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    await tx.insert(platformSettings).values({ id: 1, data: {} }).onConflictDoNothing();
    const [settingsRow] = await tx.select().from(platformSettings).where(eq(platformSettings.id, 1)).for("update");
    const marker = settingsRow.data.bootstrapAdmin as { email?: unknown } | undefined;
    if (marker && typeof marker.email === "string" && normalizeEmail(marker.email) === email) return "unchanged";

    const result = await applyBootstrapAdmin(tx, email, opts.name);
    await tx
      .update(platformSettings)
      .set({ data: { ...settingsRow.data, bootstrapAdmin: { email, at: new Date().toISOString() } } })
      .where(eq(platformSettings.id, 1));
    return result;
  });
}

async function applyBootstrapAdmin(tx: Database, email: string, name: string | undefined): Promise<Exclude<EnsureAdminResult, "skipped">> {
  const [existing] = await tx.select().from(users).where(eq(users.email, email)).limit(1).for("update");
  if (existing && existing.role === "admin" && !existing.deletedAt) {
    if (!existing.adminRole) await tx.update(users).set({ adminRole: "root" }).where(eq(users.id, existing.id));
    return "unchanged";
  }
  if (existing) {
    await tx
      .update(users)
      .set({ role: "admin", adminRole: "root", deletedAt: null, loginToken: generateLoginToken() })
      .where(eq(users.id, existing.id));
    return "promoted";
  }
  await tx.insert(users).values({
    email,
    name: name?.trim() || email.split("@")[0],
    role: "admin",
    adminRole: "root",
    passwordHash: await hashPassword(generateAdminPassword()),
    loginToken: generateLoginToken(),
  });
  return "created";
}

/** Lê as variáveis de ambiente e imprime só "admin:ensure <resultado>". */
export async function mainEnsureAdmin(db?: Database): Promise<EnsureAdminResult> {
  const own = !db;
  const conn = db ?? (await import("@/db")).getDb();
  try {
    const result = await ensureBootstrapAdmin(conn, {
      email: process.env.BOOTSTRAP_ADMIN_EMAIL,
      name: process.env.BOOTSTRAP_ADMIN_NAME,
    });
    console.log(`admin:ensure ${result}`);
    return result;
  } finally {
    if (own) {
      const client = (conn as unknown as { $client?: { end?: () => Promise<void>; close?: () => Promise<void> } }).$client;
      await (client?.end ?? client?.close)?.call(client);
    }
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/ensure-admin.ts")) {
  (async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local" });
    config();
    await mainEnsureAdmin();
  })().catch((e) => {
    // Só a mensagem: o erro do driver pode trazer a URL do banco.
    console.error("admin:ensure falhou:", e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/\S+/g, "<url>") : "erro desconhecido");
    process.exit(1);
  });
}

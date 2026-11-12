"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { AdminError } from "@/lib/admin/errors";
import { assertAdmin } from "@/lib/admin/guard";
import { getAppUrl } from "@/lib/auth/app-url";
import { getCurrentUser } from "@/lib/auth/current-user";
import { scheduleOutboxFlush } from "@/lib/email/send-now";
import { safeErrorSummary } from "@/lib/log";
import * as adm from "@/lib/students/admin";
import { listStudents } from "@/lib/students/queries";
import { BAD_REQUEST, GENERIC_ERROR, int, runAdminAction, text, type ActionResult } from "../action-utils";
import { filterOptions } from "./data";
import { FILTER_KINDS, listOptions, parseStudentFilters, toStudentRow, type FilterKind, type StudentListRow } from "./rows";

function revalidateStudents() {
  revalidatePath("/dashboard/students");
  revalidatePath("/dashboard/student/[id]", "layout");
}
const run = (fn: Parameters<typeof runAdminAction>[0]) => runAdminAction(fn, revalidateStudents);
const appUrl = async () => getAppUrl(await headers());

/** "Novo Aluno" → "Criar e enviar boas vindas". Campos: `name`, `email`. Devolve o id. */
export async function createStudentAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const out = await adm.createStudent(getDb(), actor, { name: text(fd, "name"), email: text(fd, "email") }, { appUrl: await appUrl() });
    scheduleOutboxFlush();
    return out;
  });
}

/** "Reenviar boas-vindas". Campos: `id`. */
export async function resendWelcomeAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await adm.resendWelcome(getDb(), actor, int(fd, "id"), { appUrl: await appUrl() });
    scheduleOutboxFlush();
  });
}

/** "Excluir aluno". Campos: `id`. */
export async function deleteStudentAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => adm.deleteStudent(getDb(), actor, int(fd, "id")));
}

/** "Restaurar aluno" (Lixeira). Campos: `id`. */
export async function restoreStudentAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => adm.restoreStudent(getDb(), actor, int(fd, "id")));
}

/* ---------- leitura ---------- */

type Read<T> = ({ ok: true } & T) | { ok: false; error: string };

async function read<T>(fn: (actor: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) => Promise<T>): Promise<Read<T>> {
  try {
    const user = await getCurrentUser();
    assertAdmin(user);
    return { ok: true, ...(await fn(user)) };
  } catch (e) {
    if (e instanceof AdminError) return { ok: false, error: e.message };
    console.error("[dashboard] leitura de alunos falhou:", safeErrorSummary(e));
    return { ok: false, error: GENERIC_ERROR };
  }
}

export type StudentsListResult = Read<{ rows: StudentListRow[]; total: number; nextCursor: string | null }>;

/** Página da lista ("Carregar mais resultados"). Campos: os filtros da URL e `cursor`. */
export async function listStudentsAction(fd: FormData): Promise<StudentsListResult> {
  return read(async (actor) => {
    const get = (k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : null);
    const filters = parseStudentFilters(get, (k) => fd.getAll(k).filter((v): v is string => typeof v === "string"));
    const cursor = get("cursor")?.slice(0, 2000) || undefined;
    const page = await listStudents(getDb(), actor, listOptions(filters, cursor));
    const now = new Date();
    return { rows: page.rows.map((r) => toStudentRow(r, now)), total: page.total, nextCursor: page.nextCursor };
  });
}

/** Opções de um chip de filtro. Campos: `kind` (products, showcases, deliveries, tags). */
export async function loadFilterOptionsAction(fd: FormData): Promise<Read<{ options: { value: string; label: string }[] }>> {
  return read(async () => {
    const kind = text(fd, "kind") as FilterKind;
    if (!FILTER_KINDS.includes(kind)) throw new AdminError(BAD_REQUEST);
    return { options: await filterOptions(getDb(), kind) };
  });
}

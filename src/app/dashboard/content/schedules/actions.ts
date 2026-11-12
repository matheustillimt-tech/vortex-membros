"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import * as s from "@/lib/admin/schedules";
import { BadRequest, BAD_REQUEST, int, optionalInt, runAdminAction as run, text, type ActionResult } from "../../action-utils";

/** Painel (lista + aba do produto) e área do aluno (aulas liberam/travam). */
function revalidateSchedules() {
  revalidatePath("/dashboard/content/schedules");
  revalidatePath("/dashboard/content/product/[id]", "layout");
  revalidatePath("/area", "layout");
}
const go = (fn: Parameters<typeof run>[0]) => run(fn, revalidateSchedules);

function target(fd: FormData): s.ScheduleTarget {
  const t = text(fd, "targetType");
  if (t !== "module" && t !== "lesson") throw new BadRequest(BAD_REQUEST);
  return t;
}

/** Campos: `name`, `productId` (opcional: cria já com o produto, pela aba do produto). Devolve o id. */
export async function createScheduleAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => s.createSchedule(getDb(), actor, { name: text(fd, "name"), productId: optionalInt(fd, "productId") }));
}

export async function renameScheduleAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => s.renameSchedule(getDb(), actor, int(fd, "id"), text(fd, "name")));
}

export async function trashScheduleAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => s.trashSchedule(getDb(), actor, int(fd, "id")));
}

export async function restoreScheduleAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => s.restoreSchedule(getDb(), actor, int(fd, "id")));
}

export async function addScheduleProductAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => s.addProductToSchedule(getDb(), actor, int(fd, "scheduleId"), int(fd, "productId")));
}

export async function removeScheduleProductAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => s.removeProductFromSchedule(getDb(), actor, int(fd, "scheduleId"), int(fd, "productId")));
}

/**
 * Regra de um módulo/aula. Campos: `scheduleId`, `targetType` (module|lesson), `targetId`,
 * `mode` ("none" = liberado/herda | "days_after_access" + `days` | "fixed_date" + `date` AAAA-MM-DD).
 */
export async function setScheduleRuleAction(fd: FormData): Promise<ActionResult> {
  return go(async (actor) => {
    const db = getDb();
    const base = { scheduleId: int(fd, "scheduleId"), targetType: target(fd), targetId: int(fd, "targetId") };
    const mode = text(fd, "mode");
    if (mode === "none") return s.clearRule(db, actor, base);
    if (mode === "days_after_access") {
      const raw = text(fd, "days").trim();
      const days = /^\d{1,5}$/.test(raw) ? Number(raw) : NaN;
      return s.setRule(db, actor, { ...base, rule: { mode, days } });
    }
    if (mode === "fixed_date") return s.setRule(db, actor, { ...base, rule: { mode, date: text(fd, "date").trim() } });
    throw new BadRequest(BAD_REQUEST);
  });
}

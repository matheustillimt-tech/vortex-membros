"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import * as content from "@/lib/admin/content";
import {
  parseGeneralForm,
  parseLessonPageForm,
  parseProductPageForm,
  parseTermsForm,
} from "@/lib/admin/product-settings";
import type { ProductPatch } from "@/lib/admin/content";
import { int, revalidateContent, runAdminAction as run, type ActionResult } from "../../../action-utils";

/** Painel + área do aluno (as configurações mudam como o produto e as aulas aparecem). */
function revalidateProduct() {
  revalidateContent();
  revalidatePath("/area", "layout");
}

/** Toda tela de configurações: `productId` + campos do formulário, validados em lib/admin/product-settings. */
function save(fd: FormData, parse: (fd: FormData) => ProductPatch): Promise<ActionResult> {
  return run(async (actor) => {
    const id = int(fd, "productId");
    const patch = parse(fd);
    await content.updateProduct(getDb(), actor, id, patch);
  }, revalidateProduct);
}

export async function saveGeneralAction(fd: FormData): Promise<ActionResult> {
  return save(fd, parseGeneralForm);
}

export async function saveProductPageAction(fd: FormData): Promise<ActionResult> {
  return save(fd, parseProductPageForm);
}

export async function saveLessonPageAction(fd: FormData): Promise<ActionResult> {
  return save(fd, parseLessonPageForm);
}

export async function saveTermsAction(fd: FormData): Promise<ActionResult> {
  return save(fd, parseTermsForm);
}

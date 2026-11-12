"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import * as b from "@/lib/admin/banners";
import { BadRequest, BAD_REQUEST, ids, int, runAdminAction as run, text, type ActionResult } from "../../action-utils";

/** Painel (lista + editor) e a home do aluno (banner). */
function revalidateBanners() {
  revalidatePath("/dashboard/content/banners");
  revalidatePath("/dashboard/content/banners/[id]", "page");
  revalidatePath("/area/vitrine/home");
}
const go = (fn: Parameters<typeof run>[0]) => run(fn, revalidateBanners);

/** Campos: `name`. Devolve o id. */
export async function createBannerAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => b.createBanner(getDb(), actor, { name: text(fd, "name") }));
}

export async function renameBannerAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => b.renameBanner(getDb(), actor, int(fd, "id"), text(fd, "name")));
}

/** Campos: `id`, `status` ("published" | "hidden"; validado na camada de dados). */
export async function setBannerStatusAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => b.setBannerStatus(getDb(), actor, int(fd, "id"), text(fd, "status") as b.BannerStatus));
}

export async function trashBannerAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => b.trashBanner(getDb(), actor, int(fd, "id")));
}

export async function restoreBannerAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => b.restoreBanner(getDb(), actor, int(fd, "id")));
}

/** Campos: `ids` ("1,2,3", todos os banners não excluídos na nova ordem). */
export async function reorderBannersAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => b.reorderBanners(getDb(), actor, ids(fd, "ids")));
}

function heightOf(fd: FormData): number | null {
  const raw = text(fd, "heightPercent").trim();
  if (raw === "") return null;
  if (!/^\d{1,3}$/.test(raw)) throw new BadRequest(`Informe uma altura de ${b.MIN_BANNER_HEIGHT} a ${b.MAX_BANNER_HEIGHT}%.`);
  return Number(raw);
}

function actionOf(fd: FormData): b.BannerAction {
  const type = text(fd, "actionType");
  if (type === "none") return { type };
  if (type === "product") {
    const raw = text(fd, "productId").trim();
    if (!/^\d{1,15}$/.test(raw)) throw new BadRequest("Escolha um produto.");
    return { type, productId: Number(raw) };
  }
  if (type === "external") return { type, url: text(fd, "linkUrl"), newTab: text(fd, "newTab") === "1" };
  throw new BadRequest(BAD_REQUEST);
}

/**
 * Editor do banner. Campos: `id`, `name`, `actionType` (none|product|external) + `productId` ou
 * `linkUrl`/`newTab` ("1"/"0"), `desktopImageUrl`, `mobileImageUrl`, `videoUrl`, `mobileVideoUrl`,
 * `heightPercent` (vazio = padrão).
 */
export async function saveBannerAction(fd: FormData): Promise<ActionResult> {
  return go((actor) =>
    b.updateBanner(getDb(), actor, int(fd, "id"), {
      name: text(fd, "name"),
      action: actionOf(fd),
      desktopImageUrl: text(fd, "desktopImageUrl"),
      mobileImageUrl: text(fd, "mobileImageUrl"),
      videoUrl: text(fd, "videoUrl"),
      mobileVideoUrl: text(fd, "mobileVideoUrl"),
      heightPercent: heightOf(fd),
    }),
  );
}

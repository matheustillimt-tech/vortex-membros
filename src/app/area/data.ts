import { cache } from "react";
import { connection } from "next/server";
import { getDb } from "@/db";
import { requireSession } from "@/lib/auth/current-user";
import { getCachedPlatformSettings } from "@/lib/settings";

// Uma consulta por requisição, mesmo com layout e página pedindo os mesmos dados.
export const getViewerSession = cache(requireSession);
export const getViewer = cache(async () => (await getViewerSession()).user);
export const getSettings = cache(async () => {
  await connection(); // sempre por requisição (nunca no prerender do build)
  return getCachedPlatformSettings(getDb());
});

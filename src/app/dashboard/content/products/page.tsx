import { getDb } from "@/db";
import { listShowcaseTree, listTrash } from "@/lib/admin/content";
import { ProductsBoard, type TrashItem } from "@/components/dashboard/products-board";
import { getAdmin } from "../../data";

export const metadata = { title: "Produtos" };

/** `?pending[0]=` dos links internos (ex.: pendências do Início) → valores do filtro Pendências. */
const PENDING_PARAM: Record<string, string> = { no_lessons: "noLessons", no_cover: "noImage", no_offer: "noOffer" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

function trashItems(rows: { id: number; name: string; deletedAt: Date | null }[]): TrashItem[] {
  return rows.map((r) => ({ id: r.id, name: r.name, deletedAt: r.deletedAt ? dateFmt.format(r.deletedAt) : "" }));
}

export default async function ProductsPage({ searchParams }: PageProps<"/dashboard/content/products">) {
  const user = await getAdmin(); // segunda camada além do proxy; sempre pela sessão
  const sp = await searchParams;
  const raw = [sp["pending[0]"], sp["pending[]"], sp.pending].flat().filter((v): v is string => typeof v === "string");
  const initialPendencias = [...new Set(raw.map((v) => PENDING_PARAM[v]).filter(Boolean))];
  const db = getDb();
  const [tree, showcases, products] = await Promise.all([
    listShowcaseTree(db, user),
    listTrash(db, user, "showcase"),
    listTrash(db, user, "product"),
  ]);
  return (
    <ProductsBoard
      key={initialPendencias.join(",")}
      tree={tree}
      trash={{ showcases: trashItems(showcases), products: trashItems(products) }}
      initialPendencias={initialPendencias}
    />
  );
}

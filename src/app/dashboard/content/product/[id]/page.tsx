import { getDb } from "@/db";
import { listProductTrash } from "@/lib/admin/content";
import { ModuleTree } from "@/components/dashboard/module-tree";
import { getAdmin } from "../../../data";
import { getProductTreeForPage, parseProductId } from "./data";

export const metadata = { title: "Aulas" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });
const fmt = (d: Date | null) => (d ? dateFmt.format(d) : "");

export default async function ProductLessonsPage({ params }: PageProps<"/dashboard/content/product/[id]">) {
  const id = parseProductId((await params).id);
  const [tree, user] = await Promise.all([getProductTreeForPage(id), getAdmin()]);
  const trash = await listProductTrash(getDb(), user, id);
  return (
    <ModuleTree
      productId={id}
      modules={tree.modules}
      trash={{
        modules: trash.modules.map((m) => ({ id: m.id, name: m.title, deletedAt: fmt(m.deletedAt) })),
        lessons: trash.lessons.map((l) => ({ id: l.id, name: l.title, deletedAt: fmt(l.deletedAt), detail: l.moduleTitle })),
      }}
    />
  );
}

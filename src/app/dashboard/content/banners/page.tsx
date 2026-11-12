import { getDb } from "@/db";
import { listBanners, listBannerTrash } from "@/lib/admin/banners";
import { BannersBoard } from "@/components/dashboard/banners-board";
import { getAdmin } from "../../data";

export const metadata = { title: "Banners" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function BannersPage() {
  const user = await getAdmin();
  const db = getDb();
  const [rows, trash] = await Promise.all([listBanners(db, user), listBannerTrash(db, user)]);
  return (
    <BannersBoard
      rows={rows.map(({ id, name, status, imageUrl }) => ({ id, name, status, imageUrl }))}
      trash={trash.map((t) => ({ id: t.id, name: t.name, deletedAt: t.deletedAt ? dateFmt.format(t.deletedAt) : "" }))}
    />
  );
}

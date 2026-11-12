import { getDb } from "@/db";
import { countStudentsByTag, listTags } from "@/lib/sales/tags";
import { TagsBoard } from "@/components/dashboard/tags-board";
import { getAdmin } from "../../data";

export const metadata = { title: "Tags" };

export default async function TagsPage() {
  const user = await getAdmin();
  const db = getDb();
  const [tags, counts] = await Promise.all([listTags(db, user), countStudentsByTag(db, user)]);
  return <TagsBoard rows={tags.map((t) => ({ ...t, students: counts[t.id] ?? 0 }))} />;
}

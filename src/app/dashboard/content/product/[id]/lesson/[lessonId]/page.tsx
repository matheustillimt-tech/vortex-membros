import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { getLessonForEdit } from "@/lib/admin/content";
import { AdminError } from "@/lib/admin/errors";
import { LessonEditor } from "@/components/dashboard/lesson-editor";
import { NomeNoCaminho } from "@/components/dashboard/painel-raiz";
import { getAdmin } from "../../../../../data";
import { parseProductId } from "../../data";

export const metadata = { title: "Aula" };

export default async function LessonEditorPage({ params }: PageProps<"/dashboard/content/product/[id]/lesson/[lessonId]">) {
  const { id, lessonId } = await params;
  const productId = parseProductId(id);
  const lid = parseProductId(lessonId);
  const user = await getAdmin();
  let lesson;
  try {
    lesson = await getLessonForEdit(getDb(), user, productId, lid);
  } catch (e) {
    if (e instanceof AdminError) notFound();
    throw e;
  }
  return (
    <>
      <NomeNoCaminho href={`/dashboard/content/product/${productId}/lesson/${lesson.id}`} nome={lesson.title} />
      <LessonEditor key={lesson.id} productId={productId} lesson={lesson} />
    </>
  );
}

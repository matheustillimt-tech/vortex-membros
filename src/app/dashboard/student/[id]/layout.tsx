import { NomeNoCaminho } from "@/components/dashboard/painel-raiz";
import { StudentCard, type DateLabel } from "@/components/dashboard/student-card";
import { StudentTabs } from "@/components/dashboard/student-tabs";
import { getAppUrl } from "@/lib/auth/app-url";
import { COUNTRIES } from "@/lib/students/countries";
import {
  avatarColor, formatDateTime, formatDocument, formatLongDate, formatPhone, formatRelative, initials, splitPhone, whatsappUrl,
} from "@/lib/students/format";
import { headers } from "next/headers";
import { getStudent, studentId } from "./data";

const DIALS = COUNTRIES.map((c) => c[2]);
const COUNTRY_OPTIONS = COUNTRIES.map(([, name, dial]) => ({ value: dial, label: `${name} +${dial}` }))
  // Um DDI por opção (o Combobox guarda o DDI): o primeiro país de cada código, na ordem da lista.
  .filter((o, i, all) => all.findIndex((x) => x.value === o.value) === i);

/** Perfil do aluno: cartão à esquerda, abas e conteúdo à direita. */
export default async function StudentLayout({ params, children }: LayoutProps<"/dashboard/student/[id]">) {
  const id = studentId((await params).id);
  const [{ profile: p }, h] = await Promise.all([getStudent(id), headers()]);
  const now = new Date();
  const label = (d: Date): DateLabel => ({ long: formatLongDate(d), relative: formatRelative(d, now), title: formatDateTime(d) });
  const phone = splitPhone(p.phone, DIALS);
  return (
    <div className="grid grid-cols-1 gap-6 sm:mt-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <NomeNoCaminho href={`/dashboard/student/${p.id}`} nome={p.name} />
      <div>
        <StudentCard
          key={`${p.id}-${p.name}-${p.email}-${p.document}-${p.phone}-${p.tags.map((t) => t.id).join(",")}`}
          countries={COUNTRY_OPTIONS}
          student={{
            id: p.id,
            name: p.name,
            email: p.email,
            document: formatDocument(p.document),
            documentRaw: p.document,
            phone: formatPhone(p.phone, DIALS),
            phoneDdi: phone.ddi,
            phoneNumber: phone.number,
            whatsapp: whatsappUrl(p.phone, DIALS),
            initials: initials(p.name),
            color: avatarColor(p.id),
            tags: p.tags,
            lastAccess: p.lastAccessAt ? label(p.lastAccessAt) : null,
            firstAccess: p.firstAccessAt ? label(p.firstAccessAt) : null,
            created: label(p.createdAt),
            loginLink: `${getAppUrl(h)}/auth/login?login_token=${encodeURIComponent(p.loginToken)}`,
          }}
        />
      </div>
      <div className="min-w-0">
        <StudentTabs id={p.id} />
        {children}
      </div>
    </div>
  );
}

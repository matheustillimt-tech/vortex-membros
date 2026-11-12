import Link from "next/link";
import { avatarColor, formatDateTime, formatRelativeTime, initials } from "@/lib/students/format";
import { ChevronRightIcon, UserPlusIcon } from "./icons";

export type ActivityItem = { userId: number; name: string; deliveryName: string; at: Date };

/** "Atividade Recente": linha do tempo das últimas inscrições ("{Nome} se inscreveu em {Entrega}"). */
export function RecentActivity({ items, now }: { items: ActivityItem[]; now: Date }) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h2 className="font-medium text-gray-900">Atividade Recente</h2>
      </div>
      <div className="flex-1 py-2">
        {items.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-gray-400">Nenhuma inscrição ainda.</p>
        ) : (
          <ol className="m-0 p-0">
            {items.map((a, i) => {
              const line =
                items.length === 1 ? null : i === 0 ? "top-6 bottom-0" : i === items.length - 1 ? "top-0 bottom-[calc(100%-1.5rem)]" : "top-0 bottom-0";
              return (
                <li key={`${a.userId}-${a.at.getTime()}-${i}`} className="relative list-none">
                  {line ? <span aria-hidden="true" className={`absolute left-[2.1rem] w-px bg-gray-200 ${line}`} /> : null}
                  <Link
                    href={`/dashboard/student/${a.userId}/purchases`}
                    className="group relative flex items-start gap-3 px-5 py-3 transition-colors hover:bg-gray-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                  >
                    <span className="relative z-10 mt-px flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ring-4 ring-white">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                        <UserPlusIcon className="h-3.5 w-3.5" />
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-gray-600">
                        <span className="font-medium text-gray-900">{a.name}</span> se inscreveu em{" "}
                        <span className="font-medium text-gray-900 transition-colors group-hover:text-brand-600">{a.deliveryName}</span>
                      </p>
                      <div className="mt-1 flex items-center gap-1.5 text-label text-gray-400">
                        <div className={`flex !h-4 !w-4 flex-shrink-0 items-center justify-center rounded-full !text-[8px] font-semibold ${avatarColor(a.userId)}`}>
                          <span>{initials(a.name)}</span>
                        </div>
                        <span>Inscrição</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={a.at.toISOString()} title={formatDateTime(a.at)}>
                          {formatRelativeTime(a.at, now)}
                        </time>
                      </div>
                    </div>
                    <ChevronRightIcon className="mt-1 h-4 w-4 flex-shrink-0 text-gray-300 transition-colors group-hover:text-brand-500" />
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

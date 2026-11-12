"use client";

import { useEffect, useOptimistic, useRef, useTransition } from "react";
import { reactAction, toggleCompletedAction } from "@/app/area/conteudo/aula/[id]/actions";
import { ThumbDown, ThumbUp } from "./icons";

type LessonState = { completed: boolean; reaction: 1 | -1 | null };

type Props = {
  lessonId: number;
  completed: boolean;
  reaction: 1 | -1 | null;
  showMarkSeenButton: boolean;
  keepButtonAfterSeen: boolean;
  autoMarkSeen: boolean;
};

/** Curtir/não curtir e marcar como visto. Estado otimista; o servidor revalida a página (lista e progresso). */
export function LessonActions({ lessonId, completed, reaction, showMarkSeenButton, keepButtonAfterSeen, autoMarkSeen }: Props) {
  const [pending, startTransition] = useTransition();
  const [state, setOptimistic] = useOptimistic<LessonState, Partial<LessonState>>({ completed, reaction }, (s, patch) => ({
    ...s,
    ...patch,
  }));

  const setCompleted = (value: boolean) =>
    startTransition(async () => {
      setOptimistic({ completed: value });
      await toggleCompletedAction(lessonId, value);
    });

  const react = (value: 1 | -1) =>
    startTransition(async () => {
      const next = state.reaction === value ? null : value;
      setOptimistic({ reaction: next });
      await reactAction(lessonId, next);
    });

  // "Marcar como visto automaticamente": ao abrir a aula (o player é um iframe de terceiros, sem evento de fim).
  const autoDone = useRef(false);
  useEffect(() => {
    if (autoMarkSeen && !completed && !autoDone.current) {
      autoDone.current = true;
      startTransition(async () => {
        await toggleCompletedAction(lessonId, true);
      });
    }
  }, [autoMarkSeen, completed, lessonId]);

  const reactionClass = (active: boolean) =>
    `grid size-10 place-items-center rounded-full border transition-colors ${
      active ? "border-accent bg-accent/6 text-accent" : "border-line text-text-2 hover:border-line-2 hover:text-hover"
    }`;

  const showButton = showMarkSeenButton && (!state.completed || keepButtonAfterSeen);

  return (
    // 24px entre a avaliação e o "Marcar como visto"; centralizado no celular.
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 md:justify-start">
      <div className="flex items-center gap-2" role="group" aria-label="Avalie esta aula">
        <button type="button" onClick={() => react(1)} aria-pressed={state.reaction === 1} aria-label="Curtir" className={reactionClass(state.reaction === 1)}>
          <ThumbUp className="size-[15px]" />
        </button>
        <button type="button" onClick={() => react(-1)} aria-pressed={state.reaction === -1} aria-label="Não curtir" className={reactionClass(state.reaction === -1)}>
          <ThumbDown className="size-[15px]" />
        </button>
      </div>
      {showButton ? (
        <button
          type="button"
          onClick={() => setCompleted(!state.completed)}
          aria-busy={pending}
          className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-ui transition-colors ${
            state.completed
              ? "border-accent/6 bg-accent/6 text-accent hover:border-accent/30"
              : "border-line text-text-2 hover:border-line-2 hover:text-hover"
          }`}
        >
          {state.completed ? (
            <>
              Desmarcar como visto <span aria-hidden>×</span>
            </>
          ) : (
            "Marcar como visto"
          )}
        </button>
      ) : (
        state.completed && <span className="text-ui text-muted">Aula vista</span>
      )}
    </div>
  );
}

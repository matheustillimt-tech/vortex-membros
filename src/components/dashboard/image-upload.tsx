"use client";

import { useRef, useState, useTransition } from "react";
import { uploadImageAction } from "@/app/dashboard/media-actions";
import { ImageIcon } from "./icons";

type Props = {
  name: string;
  defaultValue?: string | null;
  /** Tamanho da caixa, ex.: "w-48 h-28" (desktop) ou "w-28 h-48" (retrato). */
  boxClassName?: string;
  /** Tipo de uso; o servidor decide o limite (image = 2 MB, banner = 3 MB, logo = 600 KB, icon = 300 KB, email = 200 KB). */
  kind?: "image" | "banner" | "logo" | "icon" | "email";
  /** Avisado quando a imagem muda (enviada ou removida). */
  onChange?: (url: string | null) => void;
};

export function ImageUpload({ name, defaultValue = null, boxClassName = "w-44 h-28", kind = "image", onChange }: Props) {
  const [url, setUrl] = useState<string | null>(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function send(file: File | undefined) {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", kind);
    startTransition(async () => {
      const res = await uploadImageAction(fd);
      if (res.ok) {
        setUrl(res.url);
        onChange?.(res.url);
      }
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <input type="hidden" name={name} value={url ?? ""} />
      <div
        role="button"
        tabIndex={0}
        title="Enviar"
        aria-label="Enviar imagem"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          send(e.dataTransfer.files[0]);
        }}
        className={`${boxClassName} relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 ${
          dragging ? "border-brand-500 bg-brand-50" : url ? "border-gray-200 hover:border-gray-300" : "hover:border-gray-400 border-gray-300 bg-gray-100"
        }`}
      >
        {url ? (
          <img src={url} alt="" className="pointer-events-none h-full w-full object-contain" />
        ) : (
          <div className="pointer-events-none flex flex-col items-center gap-1">
            <ImageIcon className="h-6 w-6 text-gray-300" />
            <span className="text-center text-micro text-gray-400">
              <span className="text-brand-500">Enviar</span> ou arraste
            </span>
          </div>
        )}
        {pending ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50">
            <span className="text-hint font-medium text-white">Enviando…</span>
            <div className="h-1 w-3/4 overflow-hidden rounded-full bg-white/30">
              <div className="h-full w-full animate-pulse bg-brand-500" />
            </div>
          </div>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          send(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {url && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-brand-500 px-2.5 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Enviar
          </button>
          <button
            type="button"
            onClick={() => {
              setUrl(null);
              onChange?.(null);
            }}
            disabled={pending}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Remover
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

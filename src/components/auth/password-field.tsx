"use client";

import { useState } from "react";
import { authInputClass, authLabelClass } from "./styles";

export function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {off ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-6.5 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <path d="M1 1l22 22" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

/** Campo de senha com o botão de olho do login ("Mostrar senha" / "Ocultar senha"). */
export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  autoFocus,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <>
      <label htmlFor={id} className={authLabelClass}>
        {label}
      </label>
      <div className="relative flex">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          className={`${authInputClass} pr-[52px]`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          aria-controls={id}
          aria-pressed={show}
          className="absolute right-[10px] top-[2px] flex size-10 cursor-pointer items-center justify-center rounded-[20px] border-0 bg-transparent p-0 text-[#c1c1c1]"
        >
          <EyeIcon off={show} />
        </button>
      </div>
    </>
  );
}

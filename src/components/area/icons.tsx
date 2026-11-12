/** Ícones de traço (24×24) usados na área do aluno. Sempre decorativos: o texto/aria fica no controle. */
type IconProps = { className?: string; strokeWidth?: number };

function Svg({ className, strokeWidth = 2, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export function ChevronDown(p: IconProps) {
  return (
    <Svg strokeWidth={3} {...p}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function ChevronLeft(p: IconProps) {
  return (
    <Svg strokeWidth={2.4} {...p}>
      <path d="M15 6l-6 6 6 6" />
    </Svg>
  );
}

export function ChevronRight(p: IconProps) {
  return (
    <Svg strokeWidth={2.4} {...p}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export function ArrowLeft(p: IconProps) {
  return (
    <Svg strokeWidth={2.4} {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Svg>
  );
}

export function ArrowRight(p: IconProps) {
  return (
    <Svg strokeWidth={2.4} {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

export function LockIcon(p: IconProps) {
  return (
    <Svg strokeWidth={2.2} {...p}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function LockOpenIcon(p: IconProps) {
  return (
    <Svg strokeWidth={2.2} {...p}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.8-1.2" />
    </Svg>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <Svg strokeWidth={3} {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </Svg>
  );
}

export function BellIcon(p: IconProps) {
  return (
    <Svg strokeWidth={2.4} {...p}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </Svg>
  );
}

export function MenuIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function CheckMark(p: IconProps) {
  return (
    <Svg strokeWidth={3} {...p}>
      <path d="M5 12l5 5 9-10" />
    </Svg>
  );
}

export function ThumbUp(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 10v11H4V10zM7 10l4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 17.7 21H7" />
    </Svg>
  );
}

export function ThumbDown(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M17 14V3h3v11zM17 14l-4 7a2 2 0 0 1-3-2l1-5H5a2 2 0 0 1-2-2.3l1.3-7A2 2 0 0 1 6.3 3H17" />
    </Svg>
  );
}


export function UserCircleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
    </Svg>
  );
}

export function FingerprintIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
      <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
      <path d="M2 12a10 10 0 0 1 18-6" />
      <path d="M2 16h.01" />
      <path d="M21.8 16c.2-2 .131-5.354 0-6" />
      <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
      <path d="M8.65 22c.21-.66.45-1.32.57-2" />
      <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
    </Svg>
  );
}

export function UploadIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3v12" />
      <path d="m17 8-5-5-5 5" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    </Svg>
  );
}

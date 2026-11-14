interface AppHeaderProps {
  title: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  return (
    <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
      <span
        aria-hidden="true"
        className="inline-flex size-9 items-center justify-center rounded-lg bg-orange-500 text-white"
      >
        <svg viewBox="0 0 32 32" className="size-6" fill="none">
          <path
            d="M6 23c4-1 5-7 9-8s5 4 11-6"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{title}</h1>
    </header>
  );
}

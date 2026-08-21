import Link from "next/link";

export default function CliToolsHeader() {
  return (
    <header className="border-b border-border/60 px-6 py-4 lg:px-10">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <Link href="/cli-tools" className="flex min-w-0 items-center gap-2 text-text-main hover:text-primary">
          <span className="material-symbols-outlined text-[22px] text-primary">terminal</span>
          <span className="truncate text-base font-semibold">CLI Tools Setup</span>
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:border-primary/40 hover:text-primary"
        >
          <span className="material-symbols-outlined text-[18px]">dashboard</span>
          Dashboard
        </Link>
      </div>
    </header>
  );
}

import type { ReactNode } from "react";

/** Centered page column shared by all pages. */
export function PageShell({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <main className="mx-auto grid max-w-[880px] gap-5 px-4 pt-8 pb-16" aria-busy={busy}>
      {children}
    </main>
  );
}

/** Bordered card for informational states (not found, misconfigured, errors). */
export function Notice({
  title,
  children,
  alert,
}: {
  title?: string;
  children: ReactNode;
  alert?: boolean;
}) {
  return (
    <section
      className="rounded-xl border border-line bg-surface p-5"
      role={alert ? "alert" : undefined}
    >
      {title && <h1 className="mt-0 mb-2 text-xl font-bold">{title}</h1>}
      {children}
    </section>
  );
}

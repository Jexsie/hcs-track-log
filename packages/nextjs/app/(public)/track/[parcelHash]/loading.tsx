import { Notice, PageShell } from "@/app/components/page-shell";

export default function Loading() {
  return (
    <PageShell busy>
      <Notice>
        <p className="m-0 animate-pulse text-muted">Loading shipment timeline…</p>
      </Notice>
    </PageShell>
  );
}

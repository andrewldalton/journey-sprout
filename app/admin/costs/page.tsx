import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCostSummary,
  getOrderCostBreakdown,
  type CostSummary,
  type CostEvent,
} from "@/lib/cost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = {
  token?: string;
  order?: string;
  format?: string;
};

function authorized(token: string | undefined): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  return typeof token === "string" && token === expected;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtUsdFine(n: number): string {
  return `$${n.toFixed(3)}`;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  if (!authorized(params.token)) {
    notFound();
  }

  const summary = await getCostSummary();
  if (!summary) {
    return (
      <main className="mx-auto max-w-3xl p-8 text-ink">
        <h1 className="text-2xl font-semibold">cost tracker</h1>
        <p className="mt-4 text-sm text-ink/70">
          DATABASE_URL not configured. Set it in env and reload.
        </p>
      </main>
    );
  }

  const orderBreakdown = params.order
    ? await getOrderCostBreakdown(params.order)
    : null;

  if (params.format === "json") {
    return (
      <pre className="p-6 text-xs">
        {JSON.stringify({ summary, orderBreakdown }, null, 2)}
      </pre>
    );
  }

  return (
    <main className="mx-auto max-w-6xl bg-cream p-8 text-ink">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">cost tracker</h1>
          <p className="text-sm text-ink/60">
            per-book image-generation spend — only successful provider calls are logged
          </p>
        </div>
        <Link
          href={`/admin/costs?token=${params.token}&format=json`}
          className="text-xs text-sage underline"
        >
          view json
        </Link>
      </header>

      <TotalsCards summary={summary} />
      <PerBookCard summary={summary} />
      <ProviderSplitTable summary={summary} />
      <RecentOrdersTable summary={summary} token={params.token ?? ""} />
      <OutliersTable summary={summary} token={params.token ?? ""} />

      {orderBreakdown && (
        <OrderDrillIn
          orderId={params.order!}
          events={orderBreakdown}
        />
      )}
    </main>
  );
}

function TotalsCards({ summary }: { summary: CostSummary }) {
  const cells: Array<{ label: string; calls: number; usd: number }> = [
    { label: "today", ...summary.totals.today },
    { label: "last 7 days", ...summary.totals.last7 },
    { label: "last 30 days", ...summary.totals.last30 },
    { label: "all time", ...summary.totals.allTime },
  ];
  return (
    <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      {cells.map((c) => (
        <div
          key={c.label}
          className="rounded-lg border border-border-warm bg-white/60 p-4"
        >
          <div className="text-xs uppercase tracking-wide text-ink/60">
            {c.label}
          </div>
          <div className="mt-1 text-2xl font-semibold">{fmtUsd(c.usd)}</div>
          <div className="text-xs text-ink/60">{c.calls.toLocaleString()} calls</div>
        </div>
      ))}
    </section>
  );
}

function PerBookCard({ summary }: { summary: CostSummary }) {
  const { avgUsd, avgCalls, bookCount } = summary.perBook;
  return (
    <section className="mb-6 rounded-lg border border-border-warm bg-white/60 p-4">
      <div className="text-xs uppercase tracking-wide text-ink/60">per book</div>
      <div className="mt-1 flex items-baseline gap-6">
        <div>
          <div className="text-2xl font-semibold">{fmtUsdFine(avgUsd)}</div>
          <div className="text-xs text-ink/60">avg $/book</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">{avgCalls.toFixed(1)}</div>
          <div className="text-xs text-ink/60">avg calls/book</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">{bookCount.toLocaleString()}</div>
          <div className="text-xs text-ink/60">books tracked</div>
        </div>
      </div>
    </section>
  );
}

function ProviderSplitTable({ summary }: { summary: CostSummary }) {
  if (summary.providerSplit.length === 0) return null;
  const totalUsd = summary.providerSplit.reduce((acc, r) => acc + r.usd, 0);
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink/70">
        provider split
      </h2>
      <div className="overflow-hidden rounded-lg border border-border-warm bg-white/60">
        <table className="w-full text-sm">
          <thead className="bg-cream text-xs uppercase text-ink/60">
            <tr>
              <th className="px-3 py-2 text-left">provider</th>
              <th className="px-3 py-2 text-right">calls</th>
              <th className="px-3 py-2 text-right">spend</th>
              <th className="px-3 py-2 text-right">share</th>
              <th className="px-3 py-2 text-right">avg duration</th>
            </tr>
          </thead>
          <tbody>
            {summary.providerSplit.map((r) => (
              <tr key={r.provider} className="border-t border-border-warm/60">
                <td className="px-3 py-2 font-mono text-xs">{r.provider}</td>
                <td className="px-3 py-2 text-right">{r.calls.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{fmtUsd(r.usd)}</td>
                <td className="px-3 py-2 text-right">
                  {totalUsd ? `${((r.usd / totalUsd) * 100).toFixed(0)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right">{fmtMs(r.avgDurationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentOrdersTable({
  summary,
  token,
}: {
  summary: CostSummary;
  token: string;
}) {
  if (summary.recentOrders.length === 0) {
    return (
      <section className="mb-6 rounded-lg border border-border-warm bg-white/60 p-4 text-sm text-ink/60">
        No logged calls yet. Run an order and reload.
      </section>
    );
  }
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink/70">
        recent orders
      </h2>
      <div className="overflow-hidden rounded-lg border border-border-warm bg-white/60">
        <table className="w-full text-sm">
          <thead className="bg-cream text-xs uppercase text-ink/60">
            <tr>
              <th className="px-3 py-2 text-left">order</th>
              <th className="px-3 py-2 text-left">hero</th>
              <th className="px-3 py-2 text-left">status</th>
              <th className="px-3 py-2 text-right">calls</th>
              <th className="px-3 py-2 text-right">spend</th>
              <th className="px-3 py-2 text-right">last call</th>
            </tr>
          </thead>
          <tbody>
            {summary.recentOrders.map((r) => (
              <tr key={r.orderId} className="border-t border-border-warm/60">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link
                    href={`/admin/costs?token=${token}&order=${r.orderId}`}
                    className="text-sage underline"
                  >
                    {r.orderId}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.heroName ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.status ?? "—"}</td>
                <td className="px-3 py-2 text-right">{r.calls}</td>
                <td className="px-3 py-2 text-right font-semibold">{fmtUsdFine(r.usd)}</td>
                <td className="px-3 py-2 text-right text-xs text-ink/60">
                  {fmtDate(r.lastAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OutliersTable({
  summary,
  token,
}: {
  summary: CostSummary;
  token: string;
}) {
  if (summary.outliers.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-terracotta">
        outliers ({'>'}1.5× avg) — money leaks
      </h2>
      <div className="overflow-hidden rounded-lg border border-border-warm bg-white/60">
        <table className="w-full text-sm">
          <thead className="bg-cream text-xs uppercase text-ink/60">
            <tr>
              <th className="px-3 py-2 text-left">order</th>
              <th className="px-3 py-2 text-left">hero</th>
              <th className="px-3 py-2 text-right">calls</th>
              <th className="px-3 py-2 text-right">spend</th>
              <th className="px-3 py-2 text-right">vs avg</th>
            </tr>
          </thead>
          <tbody>
            {summary.outliers.map((r) => (
              <tr key={r.orderId} className="border-t border-border-warm/60">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link
                    href={`/admin/costs?token=${token}&order=${r.orderId}`}
                    className="text-terracotta underline"
                  >
                    {r.orderId}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.heroName ?? "—"}</td>
                <td className="px-3 py-2 text-right">{r.calls}</td>
                <td className="px-3 py-2 text-right font-semibold">{fmtUsdFine(r.usd)}</td>
                <td className="px-3 py-2 text-right font-semibold text-terracotta">
                  {r.vsAvg.toFixed(1)}×
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OrderDrillIn({
  orderId,
  events,
}: {
  orderId: string;
  events: CostEvent[];
}) {
  const total = events.reduce((acc, e) => acc + e.costUsd, 0);
  const byKind = events.reduce<Record<string, { count: number; usd: number }>>(
    (acc, e) => {
      const k = e.kind;
      if (!acc[k]) acc[k] = { count: 0, usd: 0 };
      acc[k].count += 1;
      acc[k].usd += e.costUsd;
      return acc;
    },
    {}
  );
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink/70">
        order <span className="font-mono">{orderId}</span> — {fmtUsdFine(total)} across {events.length} calls
      </h2>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {Object.entries(byKind).map(([k, v]) => (
          <span
            key={k}
            className="rounded bg-cream px-2 py-1 border border-border-warm"
          >
            {k}: {v.count} × → {fmtUsdFine(v.usd)}
          </span>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border-warm bg-white/60">
        <table className="w-full text-sm">
          <thead className="bg-cream text-xs uppercase text-ink/60">
            <tr>
              <th className="px-3 py-2 text-left">when</th>
              <th className="px-3 py-2 text-left">kind</th>
              <th className="px-3 py-2 text-left">provider</th>
              <th className="px-3 py-2 text-left">model</th>
              <th className="px-3 py-2 text-right">duration</th>
              <th className="px-3 py-2 text-right">cost</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-border-warm/60">
                <td className="px-3 py-2 text-xs text-ink/60">{fmtDate(e.createdAt)}</td>
                <td className="px-3 py-2">{e.kind}</td>
                <td className="px-3 py-2 font-mono text-xs">{e.provider}</td>
                <td className="px-3 py-2 font-mono text-xs">{e.model}</td>
                <td className="px-3 py-2 text-right">{fmtMs(e.durationMs)}</td>
                <td className="px-3 py-2 text-right">{fmtUsdFine(e.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

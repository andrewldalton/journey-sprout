import { Fragment } from "react";
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
      <RecentFailuresTable summary={summary} token={params.token ?? ""} />

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
              <th className="px-3 py-2 text-right">failure rate</th>
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
                <td
                  className={`px-3 py-2 text-right ${
                    r.calls > 0 && r.failureRate > 0 ? "text-terracotta" : ""
                  }`}
                >
                  {r.calls === 0
                    ? "—"
                    : `${(r.failureRate * 100).toFixed(1)}%`}
                </td>
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
                  {r.failedCalls > 0 && (
                    <span
                      className="ml-1 text-terracotta"
                      title={`${r.failedCalls} failed call${r.failedCalls === 1 ? "" : "s"}`}
                    >
                      ⚠
                    </span>
                  )}
                  {r.fallbackCalls > 0 && (
                    <span
                      className="ml-1 text-gold"
                      title={`${r.fallbackCalls} fallback call${r.fallbackCalls === 1 ? "" : "s"}`}
                    >
                      ↪
                    </span>
                  )}
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

function RecentFailuresTable({
  summary,
  token,
}: {
  summary: CostSummary;
  token: string;
}) {
  if (summary.recentFailures.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-terracotta">
        recent failures
      </h2>
      <div className="overflow-hidden rounded-lg border border-border-warm bg-white/60">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-cream text-xs uppercase text-ink/60">
            <tr>
              <th className="w-32 px-3 py-2 text-left">when</th>
              <th className="w-40 px-3 py-2 text-left">order</th>
              <th className="w-20 px-3 py-2 text-left">kind</th>
              <th className="w-24 px-3 py-2 text-left">provider</th>
              <th className="px-3 py-2 text-left">error</th>
            </tr>
          </thead>
          <tbody>
            {summary.recentFailures.map((f, i) => (
              <tr
                key={`${f.orderId ?? "noorder"}-${i}`}
                className="border-t border-border-warm/60"
              >
                <td className="px-3 py-2 text-xs text-ink/60">
                  {fmtDate(f.createdAt)}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {f.orderId ? (
                    <Link
                      href={`/admin/costs?token=${token}&order=${f.orderId}`}
                      className="text-terracotta underline"
                    >
                      {f.orderId}
                    </Link>
                  ) : (
                    <span className="text-ink/50">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{f.kind}</td>
                <td className="px-3 py-2 font-mono text-xs">{f.provider}</td>
                <td
                  className="truncate px-3 py-2 text-xs text-terracotta"
                  title={f.errorMessage ?? ""}
                >
                  {f.errorMessage ?? "—"}
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
  const byKind = events.reduce<
    Record<string, { success: number; failed: number; usd: number }>
  >((acc, e) => {
    const k = e.kind;
    if (!acc[k]) acc[k] = { success: 0, failed: 0, usd: 0 };
    if (e.status === "failed") acc[k].failed += 1;
    else acc[k].success += 1;
    acc[k].usd += e.costUsd;
    return acc;
  }, {});
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
            {k}: <span className="text-sage">{v.success} success</span>
            {v.failed > 0 && (
              <>
                , <span className="text-terracotta">{v.failed} failed</span>
              </>
            )}{" "}
            → {fmtUsdFine(v.usd)}
          </span>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border-warm bg-white/60">
        <table className="w-full text-sm">
          <thead className="bg-cream text-xs uppercase text-ink/60">
            <tr>
              <th className="px-3 py-2 text-left">when</th>
              <th className="px-3 py-2 text-left">status</th>
              <th className="px-3 py-2 text-left">kind</th>
              <th className="px-3 py-2 text-left">provider</th>
              <th className="px-3 py-2 text-left">model</th>
              <th className="px-3 py-2 text-right">duration</th>
              <th className="px-3 py-2 text-right">cost</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const failed = e.status === "failed";
              return (
                <Fragment key={e.id}>
                  <tr
                    className="border-t border-border-warm/60"
                    title={failed && e.errorMessage ? e.errorMessage : undefined}
                  >
                    <td className="px-3 py-2 text-xs text-ink/60">{fmtDate(e.createdAt)}</td>
                    <td
                      className={`px-3 py-2 text-xs ${
                        failed ? "text-terracotta" : "text-sage"
                      }`}
                    >
                      {failed ? "✗ failed" : "✓ success"}
                    </td>
                    <td className="px-3 py-2">{e.kind}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {e.provider}
                      {e.fallbackFrom && (
                        <span
                          className="ml-2 rounded border border-border-warm/60 bg-cream px-1.5 py-0.5 text-[10px] text-gold"
                          title={`fallback from ${e.fallbackFrom}`}
                        >
                          fallback from {e.fallbackFrom}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{e.model}</td>
                    <td className="px-3 py-2 text-right">{fmtMs(e.durationMs)}</td>
                    <td className="px-3 py-2 text-right">{fmtUsdFine(e.costUsd)}</td>
                  </tr>
                  {failed && e.errorMessage && (
                    <tr className="border-t border-border-warm/60 bg-terracotta/5">
                      <td
                        colSpan={7}
                        className="px-3 py-1 text-xs text-terracotta"
                      >
                        {e.errorMessage}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

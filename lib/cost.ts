/**
 * Per-order image-generation cost tracking.
 *
 * Every successful image-gen provider call writes one row to `cost_events`.
 * Cost is computed in JS from a static price table — no billing API scrape.
 * `/admin/costs` reads the aggregates.
 */
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

export type CostProvider = "gemini" | "vertex" | "flux";
export type CostKind = "sheet" | "page" | "cover";

export type CostEvent = {
  id: number;
  orderId: string | null;
  kind: CostKind;
  provider: CostProvider;
  model: string;
  durationMs: number;
  costUsd: number;
  createdAt: Date;
};

// USD per successful image. Updated 2026-04. Same per-image rate for every
// kind (sheet/page/cover) for all three providers today — keyed by kind
// anyway so we can diverge later without reshaping the table.
const PRICE_USD: Record<CostProvider, Record<CostKind, number>> = {
  gemini: { sheet: 0.039, page: 0.039, cover: 0.039 },
  vertex: { sheet: 0.04, page: 0.04, cover: 0.04 },
  flux:   { sheet: 0.04, page: 0.04, cover: 0.04 },
};

export function priceFor(provider: CostProvider, kind: CostKind): number {
  return PRICE_USD[provider]?.[kind] ?? 0;
}

let sqlClient: Sql | null = null;
let schemaReady = false;

function getSql(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!sqlClient) {
    sqlClient = postgres(url, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: "require",
    });
  }
  return sqlClient;
}

async function ensureSchema(sql: Sql): Promise<void> {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS cost_events (
      id           BIGSERIAL PRIMARY KEY,
      order_id     TEXT,
      kind         TEXT NOT NULL,
      provider     TEXT NOT NULL,
      model        TEXT NOT NULL,
      duration_ms  INTEGER NOT NULL,
      cost_usd     NUMERIC(10, 6) NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS cost_events_order_idx ON cost_events (order_id)`;
  await sql`CREATE INDEX IF NOT EXISTS cost_events_created_idx ON cost_events (created_at DESC)`;
  schemaReady = true;
}

/**
 * Log one successful provider call. Best-effort: swallows DB errors so a
 * logging failure never takes down a book render.
 */
export async function logCostEvent(args: {
  orderId?: string | null;
  kind: CostKind;
  provider: CostProvider;
  model: string;
  durationMs: number;
}): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  try {
    await ensureSchema(sql);
    const costUsd = priceFor(args.provider, args.kind);
    await sql`
      INSERT INTO cost_events (order_id, kind, provider, model, duration_ms, cost_usd)
      VALUES (
        ${args.orderId ?? null},
        ${args.kind},
        ${args.provider},
        ${args.model},
        ${args.durationMs},
        ${costUsd}
      )
    `;
  } catch (err) {
    console.warn("[cost] logCostEvent failed:", (err as Error).message);
  }
}

export type CostSummary = {
  totals: {
    allTime: { calls: number; usd: number };
    last30: { calls: number; usd: number };
    last7:  { calls: number; usd: number };
    today:  { calls: number; usd: number };
  };
  perBook: {
    avgUsd: number;
    avgCalls: number;
    bookCount: number;
  };
  providerSplit: Array<{
    provider: CostProvider;
    calls: number;
    usd: number;
    avgDurationMs: number;
  }>;
  recentOrders: Array<{
    orderId: string;
    heroName: string | null;
    status: string | null;
    calls: number;
    usd: number;
    firstAt: Date;
    lastAt: Date;
  }>;
  outliers: Array<{
    orderId: string;
    heroName: string | null;
    calls: number;
    usd: number;
    vsAvg: number; // ratio to per-book avg
  }>;
};

type TotalRow = { calls: string; usd: string };

export async function getCostSummary(): Promise<CostSummary | null> {
  const sql = getSql();
  if (!sql) return null;
  await ensureSchema(sql);

  const [
    allTime,
    last30,
    last7,
    today,
    perBookRow,
    providerRows,
    recentRows,
  ] = await Promise.all([
    sql<TotalRow[]>`SELECT COUNT(*)::text AS calls, COALESCE(SUM(cost_usd), 0)::text AS usd FROM cost_events`,
    sql<TotalRow[]>`SELECT COUNT(*)::text AS calls, COALESCE(SUM(cost_usd), 0)::text AS usd FROM cost_events WHERE created_at > now() - interval '30 days'`,
    sql<TotalRow[]>`SELECT COUNT(*)::text AS calls, COALESCE(SUM(cost_usd), 0)::text AS usd FROM cost_events WHERE created_at > now() - interval '7 days'`,
    sql<TotalRow[]>`SELECT COUNT(*)::text AS calls, COALESCE(SUM(cost_usd), 0)::text AS usd FROM cost_events WHERE created_at::date = (now() AT TIME ZONE 'America/Chicago')::date`,
    sql<{ book_count: string; avg_usd: string; avg_calls: string }[]>`
      SELECT
        COUNT(*)::text          AS book_count,
        COALESCE(AVG(usd), 0)::text   AS avg_usd,
        COALESCE(AVG(calls), 0)::text AS avg_calls
      FROM (
        SELECT order_id, SUM(cost_usd) AS usd, COUNT(*) AS calls
        FROM cost_events
        WHERE order_id IS NOT NULL
        GROUP BY order_id
      ) b
    `,
    sql<{ provider: CostProvider; calls: string; usd: string; avg_duration_ms: string }[]>`
      SELECT
        provider,
        COUNT(*)::text AS calls,
        COALESCE(SUM(cost_usd), 0)::text AS usd,
        COALESCE(AVG(duration_ms), 0)::text AS avg_duration_ms
      FROM cost_events
      GROUP BY provider
      ORDER BY SUM(cost_usd) DESC NULLS LAST
    `,
    sql<{
      order_id: string;
      hero_name: string | null;
      status: string | null;
      calls: string;
      usd: string;
      first_at: Date;
      last_at: Date;
    }[]>`
      SELECT
        c.order_id,
        o.hero_name,
        o.status,
        COUNT(*)::text AS calls,
        COALESCE(SUM(c.cost_usd), 0)::text AS usd,
        MIN(c.created_at) AS first_at,
        MAX(c.created_at) AS last_at
      FROM cost_events c
      LEFT JOIN orders o ON o.id = c.order_id
      WHERE c.order_id IS NOT NULL
      GROUP BY c.order_id, o.hero_name, o.status
      ORDER BY MAX(c.created_at) DESC
      LIMIT 25
    `,
  ]);

  const avgUsd = parseFloat(perBookRow[0]?.avg_usd ?? "0");
  const outliers = recentRows
    .map((r) => ({
      orderId: r.order_id,
      heroName: r.hero_name,
      calls: parseInt(r.calls, 10),
      usd: parseFloat(r.usd),
      vsAvg: avgUsd > 0 ? parseFloat(r.usd) / avgUsd : 0,
    }))
    .filter((r) => r.vsAvg >= 1.5)
    .sort((a, b) => b.vsAvg - a.vsAvg)
    .slice(0, 10);

  const asTotal = (r: TotalRow) => ({
    calls: parseInt(r.calls, 10),
    usd: parseFloat(r.usd),
  });

  return {
    totals: {
      allTime: asTotal(allTime[0]),
      last30: asTotal(last30[0]),
      last7: asTotal(last7[0]),
      today: asTotal(today[0]),
    },
    perBook: {
      avgUsd,
      avgCalls: parseFloat(perBookRow[0]?.avg_calls ?? "0"),
      bookCount: parseInt(perBookRow[0]?.book_count ?? "0", 10),
    },
    providerSplit: providerRows.map((r) => ({
      provider: r.provider,
      calls: parseInt(r.calls, 10),
      usd: parseFloat(r.usd),
      avgDurationMs: parseFloat(r.avg_duration_ms),
    })),
    recentOrders: recentRows.map((r) => ({
      orderId: r.order_id,
      heroName: r.hero_name,
      status: r.status,
      calls: parseInt(r.calls, 10),
      usd: parseFloat(r.usd),
      firstAt: r.first_at,
      lastAt: r.last_at,
    })),
    outliers,
  };
}

export async function getOrderCostBreakdown(orderId: string): Promise<CostEvent[]> {
  const sql = getSql();
  if (!sql) return [];
  await ensureSchema(sql);
  const rows = await sql<{
    id: string;
    order_id: string | null;
    kind: CostKind;
    provider: CostProvider;
    model: string;
    duration_ms: number;
    cost_usd: string;
    created_at: Date;
  }[]>`
    SELECT id::text, order_id, kind, provider, model, duration_ms, cost_usd::text, created_at
    FROM cost_events
    WHERE order_id = ${orderId}
    ORDER BY created_at ASC
  `;
  return rows.map((r) => ({
    id: parseInt(r.id, 10),
    orderId: r.order_id,
    kind: r.kind,
    provider: r.provider,
    model: r.model,
    durationMs: r.duration_ms,
    costUsd: parseFloat(r.cost_usd),
    createdAt: r.created_at,
  }));
}

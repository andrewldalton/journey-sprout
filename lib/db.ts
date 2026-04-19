import { randomBytes } from "node:crypto";
import postgres from "postgres";

/**
 * Postgres data layer for journeysprout's book-builder orders.
 *
 * Backed by Neon Postgres (via the `postgres` driver, template-literal SQL).
 * Consumers should import the typed helpers below — the raw `sql` client is
 * intentionally not exported. Every write goes through a parameterized
 * template literal, so callers cannot introduce SQL injection here.
 *
 * Lifecycle:
 *   - The driver client is a lazy module-level singleton; the first call that
 *     needs the DB builds it, subsequent calls reuse it across warm Vercel
 *     invocations.
 *   - The `orders` table is created on first use via `CREATE TABLE IF NOT
 *     EXISTS`, then a flag short-circuits the DDL on later calls.
 *   - Missing `DATABASE_URL` is fatal: we throw so the caller (route handler)
 *     can decide whether to degrade gracefully.
 */

type Sql = ReturnType<typeof postgres>;

export type OrderStatus =
  | "pending"
  | "generating_sheet"
  | "awaiting_sheet_review"
  | "rendering_pages"
  | "finalizing"
  | "ready"
  | "failed"
  | "emailed";

export type SheetStatus =
  | "pending"            // sheet not yet generated
  | "pending_review"     // sheet rendered, awaiting customer approve/regen
  | "approved"           // customer approved, book render can proceed
  | "regenerating";      // customer clicked "try again", sheet re-rendering

export const MAX_SHEET_REGENS = 2;

export type Order = {
  id: string;
  email: string;
  heroName: string;
  pronouns: string;
  storySlug: string;
  companionSlug: string;
  photoUrl: string | null;
  sheetUrl: string | null;
  pdfUrl: string | null;
  status: OrderStatus;
  pagesDone: number;
  pagesTotal: number;
  sheetStatus: SheetStatus;
  regenCount: number;
  sheetApprovedAt: Date | null;
  error: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderInsert = {
  email: string;
  heroName: string;
  pronouns: string;
  storySlug: string;
  companionSlug: string;
  photoUrl: string;
  ip: string;
  userAgent: string;
};

export type OrderPatch = Partial<{
  status: OrderStatus;
  pagesDone: number;
  sheetUrl: string | null;
  pdfUrl: string | null;
  sheetStatus: SheetStatus;
  regenCount: number;
  sheetApprovedAt: Date | null;
  error: string | null;
}>;

// Row shape as returned by Postgres (snake_case, matches the DDL below).
type OrderRow = {
  id: string;
  email: string;
  hero_name: string;
  pronouns: string;
  story_slug: string;
  companion_slug: string;
  photo_url: string | null;
  sheet_url: string | null;
  pdf_url: string | null;
  status: OrderStatus;
  pages_done: number;
  pages_total: number;
  sheet_status: SheetStatus;
  regen_count: number;
  sheet_approved_at: Date | null;
  error: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
  updated_at: Date;
};

let sqlClient: Sql | null = null;
let schemaReady = false;

function getSql(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL not set");
  }
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
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      hero_name TEXT NOT NULL,
      pronouns TEXT NOT NULL,
      story_slug TEXT NOT NULL,
      companion_slug TEXT NOT NULL,
      photo_url TEXT,
      sheet_url TEXT,
      pdf_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      pages_done INTEGER NOT NULL DEFAULT 0,
      pages_total INTEGER NOT NULL DEFAULT 11,
      sheet_status TEXT NOT NULL DEFAULT 'pending',
      regen_count INTEGER NOT NULL DEFAULT 0,
      sheet_approved_at TIMESTAMPTZ,
      error TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Additive migrations for existing deployments — idempotent.
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS sheet_status TEXT NOT NULL DEFAULT 'pending'`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS regen_count INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS sheet_approved_at TIMESTAMPTZ`;
  schemaReady = true;
}

function generateOrderId(): string {
  return `ord_${randomBytes(6).toString("hex")}`;
}

function mapRow(row: OrderRow): Order {
  return {
    id: row.id,
    email: row.email,
    heroName: row.hero_name,
    pronouns: row.pronouns,
    storySlug: row.story_slug,
    companionSlug: row.companion_slug,
    photoUrl: row.photo_url,
    sheetUrl: row.sheet_url,
    pdfUrl: row.pdf_url,
    status: row.status,
    pagesDone: row.pages_done,
    pagesTotal: row.pages_total,
    sheetStatus: row.sheet_status,
    regenCount: row.regen_count,
    sheetApprovedAt: row.sheet_approved_at,
    error: row.error,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Insert a new order. Returns the inserted row (including the generated id). */
export async function createOrder(input: OrderInsert): Promise<Order> {
  const sql = getSql();
  await ensureSchema(sql);
  const id = generateOrderId();
  const rows = await sql<OrderRow[]>`
    INSERT INTO orders (
      id, email, hero_name, pronouns, story_slug, companion_slug,
      photo_url, ip, user_agent
    )
    VALUES (
      ${id}, ${input.email}, ${input.heroName}, ${input.pronouns},
      ${input.storySlug}, ${input.companionSlug}, ${input.photoUrl},
      ${input.ip}, ${input.userAgent}
    )
    RETURNING *
  `;
  return mapRow(rows[0]);
}

/** Fetch an order by id. Returns null if the row does not exist. */
export async function getOrder(id: string): Promise<Order | null> {
  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql<OrderRow[]>`
    SELECT * FROM orders WHERE id = ${id} LIMIT 1
  `;
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

/**
 * Patch writable fields on an order. `updated_at` is always bumped to now().
 * Throws if no row exists for the given id.
 */
export async function updateOrder(
  id: string,
  patch: OrderPatch,
): Promise<Order> {
  const sql = getSql();
  await ensureSchema(sql);

  // Build a map of explicitly-provided fields → snake_case columns so that
  // passing `undefined` leaves the column untouched and `null` clears it.
  const updates: Record<string, OrderStatus | number | string | null> = {};
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.pagesDone !== undefined) updates.pages_done = patch.pagesDone;
  if (patch.sheetUrl !== undefined) updates.sheet_url = patch.sheetUrl;
  if (patch.pdfUrl !== undefined) updates.pdf_url = patch.pdfUrl;
  if (patch.sheetStatus !== undefined) updates.sheet_status = patch.sheetStatus;
  if (patch.regenCount !== undefined) updates.regen_count = patch.regenCount;
  if (patch.sheetApprovedAt !== undefined)
    updates.sheet_approved_at =
      patch.sheetApprovedAt === null ? null : patch.sheetApprovedAt.toISOString();
  if (patch.error !== undefined) updates.error = patch.error;

  const columns = Object.keys(updates);
  if (columns.length === 0) {
    // Nothing to patch — still bump updated_at so the caller's "touch"
    // semantics are preserved.
    const rows = await sql<OrderRow[]>`
      UPDATE orders
         SET updated_at = now()
       WHERE id = ${id}
       RETURNING *
    `;
    if (rows.length === 0) throw new Error(`Order not found: ${id}`);
    return mapRow(rows[0]);
  }

  // `postgres` supports a helper object for dynamic SET clauses via sql(obj, ...keys).
  const rows = await sql<OrderRow[]>`
    UPDATE orders
       SET ${sql(updates, ...columns)}, updated_at = now()
     WHERE id = ${id}
     RETURNING *
  `;
  if (rows.length === 0) throw new Error(`Order not found: ${id}`);
  return mapRow(rows[0]);
}

/** Atomically bump pages_done by 1 and return the new count. */
export async function incrementPagesDone(id: string): Promise<number> {
  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql<{ pages_done: number }[]>`
    UPDATE orders
       SET pages_done = pages_done + 1,
           updated_at = now()
     WHERE id = ${id}
     RETURNING pages_done
  `;
  if (rows.length === 0) throw new Error(`Order not found: ${id}`);
  return rows[0].pages_done;
}

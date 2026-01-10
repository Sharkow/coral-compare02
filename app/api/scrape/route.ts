import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/* ================= ENV ================= */

// ⚠️ IMPORTANT: NE PAS throw au top-level (sinon Vercel build fail)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SCRAPE_SECRET = process.env.SCRAPE_SECRET || "";

// ✅ crée le client SEULEMENT quand on en a besoin
function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE env vars");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/* ================= TYPES ================= */

type SourceRow = {
  id: string;
  url: string;
  shop_id: string;
  category: string;
  is_active: boolean;
};

type Listing = {
  shop_id: string;
  category: string;
  title_raw: string;
  url: string | null;
  image_url: string | null;

  price_cad: number | null;
  sale_price_cad: number | null;

  status: "available" | "sold_out";
  variant: string | null;
  sale_mode: string | null;
  unit_type: string | null;
  unit_count: number | null;
};

/* ================= UTILS ================= */

const norm = (s = "") => (s || "").replace(/\s+/g, " ").trim();

const priceNum = (s = "") => {
  const t = (s || "").replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const isWysiwyg = (t: string) => (t || "").toLowerCase().includes("wysiwyg");

function enforceTorch(listing: Listing): Listing {
  if (listing.category !== "torch") return listing;
  if (isWysiwyg(listing.title_raw)) return { ...listing, sale_mode: "wysiwyg" };
  return { ...listing, sale_mode: "per_unit", unit_type: "head" };
}

function stripLocale(raw: string) {
  const u = new URL(raw);
  u.pathname = u.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//i, "/");
  return u.toString();
}

function normalizeUrl(raw: string) {
  const cleaned = stripLocale(raw);
  const u = new URL(cleaned);

  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((k) =>
    u.searchParams.delete(k)
  );

  u.pathname = u.pathname.replace(/\/+$/, "");

  const params = Array.from(u.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of params) u.searchParams.append(k, v);

  return u.toString();
}

function canonicalProductUrl(raw: string) {
  const u = new URL(normalizeUrl(raw));
  u.search = "";
  return u.toString();
}

function safePrice(n: number | null): number | null {
  if (n == null) return null;
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return n;
}

function effectivePrice(price: number | null, sale: number | null) {
  return sale ?? price;
}

/* ================= RATE LIMIT HELPERS ================= */

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function parseRetryAfterSeconds(h: string | null): number | null {
  if (!h) return null;
  const n = Number(h);
  if (Number.isFinite(n) && n > 0) return n;
  return null;
}

function jitterMs(max = 300) {
  return Math.floor(Math.random() * max);
}

async function fetchWithRetry(url: string, maxAttempts = 10) {
  let lastErr: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; CoralCompareBot/1.0)",
        "accept-language": "en-CA,en;q=0.9,fr;q=0.8",
      },
      cache: "no-store",
    });

    if (r.ok) return r;

    if (r.status === 429 || (r.status >= 500 && r.status <= 599)) {
      const ra = parseRetryAfterSeconds(r.headers.get("retry-after"));
      const base = ra != null ? ra * 1000 : 0;
      const backoff = base || Math.min(60000, 1200 * Math.pow(2, attempt - 1));
      await sleep(backoff + jitterMs(600));
      lastErr = new Error(`HTTP ${r.status} (${url})`);
      continue;
    }

    throw new Error(`fetch ${r.status} (${url})`);
  }

  throw lastErr || new Error(`fetch failed (${url})`);
}

async function fetchHtml(url: string) {
  const r = await fetchWithRetry(url, 10);
  return r.text();
}

async function fetchJson(url: string) {
  const r = await fetchWithRetry(url, 10);
  return r.json();
}

/* ================= UPSERT ================= */

// ✅ CORRECTION ICI (cast any)
async function upsertIfValid(supabase: ReturnType<typeof createClient>, l: Listing | null) {
  if (!l) return false;
  if (!l.shop_id || String(l.shop_id).trim() === "") return false;
  if (!l.url || String(l.url).trim() === "") return false;
  if (!l.price_cad || l.price_cad <= 0) return false;

  await supabase.from("listings").upsert(l as any, { onConflict: "shop_id,url" });
  return true;
}

/* ================= API ================= */

export async function GET(req: Request) {
  try {
    const supabase = getSupabase();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}

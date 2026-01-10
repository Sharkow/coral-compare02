import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/* ================= ENV ================= */

const SCRAPE_SECRET = process.env.SCRAPE_SECRET || "";

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

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/* ================= AUTH ================= */

function authorized(req: Request) {
  if (!SCRAPE_SECRET) return true;
  if (req.headers.get("authorization") === `Bearer ${SCRAPE_SECRET}`) return true;
  try {
    return new URL(req.url).searchParams.get("secret") === SCRAPE_SECRET;
  } catch {
    return false;
  }
}

/* ================= RUN ================= */

async function run() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE env vars");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // reset listings
  await supabase.from("listings").delete().not("id", "is", null);

  const { data, error } = await supabase
    .from("scrape_sources")
    .select("*")
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  return {
    ok: true,
    sources: data.length,
  };
}

/* ================= API ================= */

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await run());
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}

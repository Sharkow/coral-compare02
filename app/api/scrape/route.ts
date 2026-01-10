 import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/* ================= ENV ================= */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SCRAPE_SECRET = process.env.SCRAPE_SECRET || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE env vars");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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
  url: string | null; // URL canonique (sans /en/ et sans tracking)
  image_url: string | null;

  price_cad: number | null;
  sale_price_cad: number | null;

  status: "available" | "sold_out";
  variant: string | null; // info (variant choisi) - mais PAS dans l'URL
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

// ✅ enlève /en/, /fr/, /en-ca/ etc au début du path
function stripLocale(raw: string) {
  const u = new URL(raw);
  u.pathname = u.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//i, "/");
  return u.toString();
}

// ✅ normalisation URL (anti doublon)
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

// ✅ url canonique produit (sans query)
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

/* ================= RATE LIMIT HELPERS (NEW, NO REMOVALS) ================= */

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

/* ================= SHOPIFY ================= */

async function fetchShopifyProduct(url: string) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/products\/([^/]+)/);
    if (!m) return null;

    const js = `${u.origin}/products/${m[1]}.js`;
    return await fetchJson(js);
  } catch {
    return null;
  }
}

/**
 * ✅ 1 SEULE LIGNE PAR PRODUIT SHOPIFY (ZÉRO doublon)
 * on choisit le meilleur variant "available" (prix effectif le + bas)
 * et on upsert avec l'URL canonique SANS ?variant
 */
function buildSingleShopifyListing(productUrl: string, product: any, shop_id: string, category: string): Listing | null {
  const titleBase = norm(product?.title || "Untitled");
  const url = canonicalProductUrl(productUrl);

  const variants: any[] = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return null;

  const scored = variants.map((v) => {
    const price = typeof v?.price === "number" ? v.price / 100 : null;
    const compare = typeof v?.compare_at_price === "number" ? v.compare_at_price / 100 : null;

    const price_cad = compare != null && price != null && compare > price ? compare : price;
    const sale_price_cad = compare != null && price != null && compare > price ? price : null;

    const eff = effectivePrice(price_cad, sale_price_cad);

    return {
      v,
      price_cad: safePrice(price_cad),
      sale_price_cad: safePrice(sale_price_cad),
      eff: safePrice(eff),
      available: v?.available === true,
    };
  });

  const availablePool = scored.filter((x) => x.available && x.eff != null);
  const pool = availablePool.length ? availablePool : scored.filter((x) => x.eff != null);
  if (!pool.length) return null;

  pool.sort((a, b) => a.eff! - b.eff!);
  const best = pool[0];

  const variantTitle =
    best.v?.title && String(best.v.title).toLowerCase() !== "default title" ? String(best.v.title) : null;

  return enforceTorch({
    shop_id,
    category,
    title_raw: variantTitle ? `${titleBase} — ${variantTitle}` : titleBase,
    url,
    image_url: best.v?.featured_image?.src || product?.featured_image || product?.images?.[0] || null,
    price_cad: best.price_cad,
    sale_price_cad: best.sale_price_cad,
    status: best.available ? "available" : "sold_out",
    variant: variantTitle,
    sale_mode: null,
    unit_type: null,
    unit_count: null,
  });
}

/* ================= SHOPIFY CATALOG (ReefSolution ONLY) ================= */

function isReefSolutionSource(src: SourceRow) {
  try {
    const u = new URL(src.url);
    return u.hostname.toLowerCase().includes("reefsolution.com");
  } catch {
    return false;
  }
}

function tagsToArray(tags: any): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map((x) => String(x));
  return String(tags)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function productLooksTorch(p: any): boolean {
  const title = String(p?.title || "").toLowerCase();
  const tags = tagsToArray(p?.tags).map((t) => t.toLowerCase());

  if (title.includes("torch") || title.includes("torche")) return true;
  if (tags.some((t) => t.includes("torch"))) return true;

  if (title.includes("glabrescens")) return true;
  if (tags.some((t) => t.includes("glabrescens"))) return true;

  return false;
}

async function fetchShopifyCatalogProducts(origin: string): Promise<any[]> {
  const out: any[] = [];

  // plus doux => moins de 429
  const LIMIT = 100;
  const PER_PAGE_DELAY_MS = 1600;

  for (let page = 1; page < 200; page++) {
    const url = `${origin}/products.json?limit=${LIMIT}&page=${page}`;
    const j = await fetchJson(url);

    const arr = j?.products ?? [];
    if (!arr.length) break;

    out.push(...arr);
    await sleep(PER_PAGE_DELAY_MS + jitterMs(400));
  }

  return out;
}

function buildSingleShopifyListingFromProductsJson(
  origin: string,
  p: any,
  shop_id: string,
  fallbackCategory: string
): Listing | null {
  const titleBase = norm(p?.title || "Untitled");
  const handle = String(p?.handle || "").trim();
  if (!handle) return null;

  const productUrl = `${origin}/products/${handle}`;
  const url = canonicalProductUrl(productUrl);

  const variants: any[] = Array.isArray(p?.variants) ? p.variants : [];
  if (!variants.length) return null;

  const scored = variants.map((v) => {
    const price = v?.price != null ? priceNum(String(v.price)) : null;
    const compare = v?.compare_at_price != null ? priceNum(String(v.compare_at_price)) : null;

    const price_cad = compare != null && price != null && compare > price ? compare : price;
    const sale_price_cad = compare != null && price != null && compare > price ? price : null;

    const eff = effectivePrice(price_cad, sale_price_cad);

    return {
      v,
      price_cad: safePrice(price_cad),
      sale_price_cad: safePrice(sale_price_cad),
      eff: safePrice(eff),
      available: true, // products.json => pas fiable sur availability, on garde available
    };
  });

  const pool = scored.filter((x) => x.eff != null);
  if (!pool.length) return null;

  pool.sort((a, b) => a.eff! - b.eff!);
  const best = pool[0];

  const variantTitle =
    best.v?.title && String(best.v.title).toLowerCase() !== "default title" ? String(best.v.title) : null;

  const imageUrl = p?.image?.src || (Array.isArray(p?.images) ? p.images?.[0]?.src : null) || null;

  const category = productLooksTorch(p) ? "torch" : fallbackCategory;

  return enforceTorch({
    shop_id,
    category,
    title_raw: variantTitle ? `${titleBase} — ${variantTitle}` : titleBase,
    url,
    image_url: imageUrl,
    price_cad: best.price_cad,
    sale_price_cad: best.sale_price_cad,
    status: "available",
    variant: variantTitle,
    sale_mode: null,
    unit_type: null,
    unit_count: null,
  });
}

async function scrapeReefSolutionCatalog(src: SourceRow) {
  const origin = new URL(src.url).origin;

  const products = await fetchShopifyCatalogProducts(origin);

  let found = 0;

  for (const p of products) {
    if (!productLooksTorch(p)) continue;

    const l = buildSingleShopifyListingFromProductsJson(origin, p, src.shop_id, src.category);
    if (await upsertIfValid(l)) found++;

    // mini pause entre produits (évite rafales)
    await sleep(60 + jitterMs(80));
  }

  return { source: `${origin} (catalog)`, found };
}

/* ================= ✅ AJOUT: SHOPIFY CATALOG GÉNÉRIQUE (CandyCorals, etc.) ================= */

async function isShopifyOrigin(origin: string): Promise<boolean> {
  try {
    const url = `${origin}/products.json?limit=1&page=1`;
    const r = await fetchWithRetry(url, 3);
    if (!r.ok) return false;
    const j = await r.json();
    return Array.isArray(j?.products);
  } catch {
    return false;
  }
}

async function scrapeShopifyCatalogGeneric(src: SourceRow) {
  const origin = new URL(src.url).origin;

  const products = await fetchShopifyCatalogProducts(origin);

  let found = 0;

  for (const p of products) {
    const l = buildSingleShopifyListingFromProductsJson(origin, p, src.shop_id, src.category);
    if (await upsertIfValid(l)) found++;
    await sleep(50 + jitterMs(120));
  }

  return { source: `${origin} (shopify catalog)`, found };
}

/* ================= HTML FALLBACK (Shopify + Woo) ================= */

function pickFromSrcset(srcset?: string | null) {
  if (!srcset) return null;
  const first = srcset.split(",")[0]?.trim();
  if (!first) return null;
  return first.split(" ")[0]?.trim() || null;
}
type ShopifyHtmlFallback = {
  title: string;
  imageUrl: string | null;
  price_cad: number | null;
  sale_price_cad: number | null;
  status: "available" | "sold_out";
  variantTitle: string | null;
};

// Shopify fallback HTML robuste (évite prix "from" genre 36)
function parseShopifyHtmlFallback(url: string, html: string): ShopifyHtmlFallback {

  const $ = cheerio.load(html);

  const title = norm($("h1").first().text()) || norm($("title").text()) || "Untitled";

  const imageUrl = $('meta[property="og:image"]').attr("content") || $('meta[name="og:image"]').attr("content") || null;

  // 1) ShopifyAnalytics.meta.product (variants/prix)
  try {
    const scripts = $("script")
      .map((_, el) => $(el).html() || "")
      .get()
      .join("\n");

    const m = scripts.match(/ShopifyAnalytics\.meta\s*=\s*(\{[\s\S]*?\});/);
    if (m?.[1]) {
      const meta = JSON.parse(m[1]);
      const product = meta?.product;

      if (product?.variants?.length) {
        const variants: any[] = product.variants;

        const scored = variants.map((v: any) => {
          const price = typeof v?.price === "number" ? v.price / 100 : null;
          const compare = typeof v?.compare_at_price === "number" ? v.compare_at_price / 100 : null;

          const price_cad = compare != null && price != null && compare > price ? compare : price;
          const sale_price_cad = compare != null && price != null && compare > price ? price : null;

          const eff = effectivePrice(price_cad, sale_price_cad);

          return {
            v,
            price_cad: safePrice(price_cad),
            sale_price_cad: safePrice(sale_price_cad),
            eff: safePrice(eff),
            available: v?.available === true,
          };
        });

        const availablePool = scored.filter((x) => x.available && x.eff != null);
        const pool = availablePool.length ? availablePool : scored.filter((x) => x.eff != null);

        if (pool.length) {
          pool.sort((a, b) => a.eff! - b.eff!);
          const best = pool[0];

          const variantTitle =
            best.v?.title && String(best.v.title).toLowerCase() !== "default title" ? String(best.v.title) : null;

          return {
            title,
            imageUrl,
            price_cad: best.price_cad,
            sale_price_cad: best.sale_price_cad,
            status: best.available ? "available" : "sold_out",
            variantTitle,
          };
        }
      }
    }
  } catch {
    // ignore
  }

  // 2) meta price
  const metaPrice =
    $('meta[property="product:price:amount"]').attr("content") ||
    $('meta[property="og:price:amount"]').attr("content") ||
    $('meta[itemprop="price"]').attr("content") ||
    null;

  const pMeta = metaPrice ? priceNum(metaPrice) : null;

  // 3) JSON-LD offers
  let ldPrice: number | null = null;
  try {
    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).text();
      if (!raw) return;
      const j = JSON.parse(raw);
      const offers = j?.offers;
      const price = Array.isArray(offers) ? offers?.[0]?.price : offers?.price;
      if (price != null && ldPrice == null) ldPrice = priceNum(String(price));
    });
  } catch {}

  // 4) dernier recours: texte
  const textPrice = norm($('[class*="price"]').first().text());
  const pText = textPrice ? priceNum(textPrice) : null;

  const price = safePrice(pMeta ?? ldPrice ?? pText ?? null);

  const lower = html.toLowerCase();
  const status: "available" | "sold_out" = lower.includes("sold out") ? "sold_out" : "available";

  return { title, imageUrl, price_cad: price, sale_price_cad: null as number | null, status, variantTitle: null as string | null };
}

/* ================= ✅ AJOUT: FIX ABC IMAGES (SANS CASSER LES AUTRES) ================= */

function looksLikeBadImg(u: string): boolean {
  const low = u.toLowerCase();
  if (low.includes("logo")) return true;
  if (low.includes("placeholder")) return true;
  if (low.includes("no-image")) return true;
  if (low.includes("favicon")) return true;
  if (low.includes("site-icon")) return true;
  if (low.endsWith(".svg")) return true;
  // thumbnails trop petites
  if (low.includes("-150x") || low.includes("-100x") || low.includes("-80x")) return true;
  return false;
}

function absolutizeImg(urlRaw: string, u: string | null | undefined): string | null {
  if (!u) return null;
  const s = String(u).trim();
  if (!s) return null;
  try {
    const abs = new URL(s, urlRaw).toString();
    if (looksLikeBadImg(abs)) return null;
    return abs;
  } catch {
    return null;
  }
}

// Woo / Fragbox / ABC
function parseHtmlProduct(urlRaw: string, html: string, shop_id: string, category: string): Listing {
  const $ = cheerio.load(html);

  const $product = $("div.product").first().length ? $("div.product").first() : $("body");


  const title =
    norm($product.find("h1.product_title").text()) ||
    norm($product.find("h1").first().text()) ||
    norm($("title").text()) ||
    "Untitled";

  const $summary = $product.find(".summary").length ? $product.find(".summary") : $product;

  const saleText =
    norm($summary.find(".price ins .woocommerce-Price-amount").first().text()) ||
    norm($summary.find(".price ins .amount").first().text()) ||
    norm($summary.find(".price ins").first().text()) ||
    "";

  const regularText =
    norm($summary.find(".price del .woocommerce-Price-amount").first().text()) ||
    norm($summary.find(".price del .amount").first().text()) ||
    norm($summary.find(".price del").first().text()) ||
    "";

  const singleText =
    norm($summary.find(".price .woocommerce-Price-amount").first().text()) ||
    norm($summary.find(".price .amount").first().text()) ||
    norm($summary.find("p.price").first().text()) ||
    "";

  const sale = priceNum(saleText);
  const regular = priceNum(regularText);
  const single = priceNum(singleText);

  const stock = norm($summary.find(".stock").first().text()).toLowerCase();
  const status: "available" | "sold_out" =
    stock.includes("out of stock") || stock.includes("rupture") ? "sold_out" : "available";

  // ✅ AJOUT (sans enlever le comportement): meilleure récupération image produit (évite logo ABC)
  const rawCandidates: Array<string | null | undefined> = [];

  rawCandidates.push($('meta[property="og:image"]').attr("content"));
  rawCandidates.push($('meta[name="og:image"]').attr("content"));

  const img1 = $product.find("img.wp-post-image").first();
  rawCandidates.push(img1.attr("data-src"));
  rawCandidates.push(img1.attr("data-lazy-src"));
  rawCandidates.push(img1.attr("data-original"));
  rawCandidates.push(img1.attr("src"));
  rawCandidates.push(pickFromSrcset(img1.attr("srcset")));

  const galleryImgs = $product.find(".woocommerce-product-gallery img").toArray();
  for (const el of galleryImgs) {
    const im = $(el);
    rawCandidates.push(im.attr("data-src"));
    rawCandidates.push(im.attr("data-lazy-src"));
    rawCandidates.push(im.attr("data-original"));
    rawCandidates.push(im.attr("src"));
    rawCandidates.push(pickFromSrcset(im.attr("srcset")));
  }

  const anyImgs = $product.find("img").toArray();
  for (const el of anyImgs.slice(0, 12)) {
    const im = $(el);
    rawCandidates.push(im.attr("data-src"));
    rawCandidates.push(im.attr("data-lazy-src"));
    rawCandidates.push(im.attr("data-original"));
    rawCandidates.push(im.attr("src"));
    rawCandidates.push(pickFromSrcset(im.attr("srcset")));
  }

  const imageUrl = rawCandidates.map((c) => absolutizeImg(urlRaw, c)).find((x) => x != null) ?? null;

  const price_cad = regular && sale && regular > sale ? regular : sale ?? single ?? regular ?? null;
  const sale_price_cad = regular && sale && regular > sale ? sale : null;

  return enforceTorch({
    shop_id,
    category,
    title_raw: title,
    url: normalizeUrl(urlRaw),
    image_url: imageUrl,
    price_cad: safePrice(price_cad),
    sale_price_cad: safePrice(sale_price_cad),
    status,
    variant: null,
    sale_mode: null,
    unit_type: null,
    unit_count: null,
  });
}

/* ================= SCRAPE ================= */

function extractProductLinks(pageUrl: string, html: string) {
  const $ = cheerio.load(html);
  const out = new Set<string>();

  $("a[href]").each((_, a) => {
    const h = $(a).attr("href");
    if (!h) return;
    try {
      const u = new URL(h, pageUrl);
      const p = u.pathname.toLowerCase();
      if (p.includes("/products/") || p.includes("/product/") || p.includes("/produit/")) {
        out.add(normalizeUrl(u.toString()));
      }
    } catch {}
  });

  return [...out];
}

// ✅ AJOUT: pagination générique (Woo) pour pages category (ABC, etc.)
function makePagedUrl(base: string, n: number) {
  const u = new URL(base);
  u.searchParams.delete("paged");

  const withQuery = new URL(u.toString());
  withQuery.searchParams.set("paged", String(n));

  const withPath = normalizeUrl(`${u.origin}${u.pathname.replace(/\/+$/, "")}/page/${n}/`);

  return { withQuery: withQuery.toString(), withPath };
}

async function extractLinksWithPagination(startUrl: string, maxPages = 80) {
  const all = new Set<string>();
  let pages = 0;

  for (let p = 1; p <= maxPages; p++) {
    pages = p;

    const { withQuery, withPath } = makePagedUrl(startUrl, p);

    let html = "";
    try {
      html = await fetchHtml(withQuery);
    } catch {
      try {
        html = await fetchHtml(withPath);
      } catch {
        break;
      }
    }

    const links = extractProductLinks(startUrl, html);
    const before = all.size;

    for (const l of links) all.add(normalizeUrl(l));

    const added = all.size - before;
    if (added === 0) break;

    await sleep(900 + jitterMs(500));
  }

  return { links: [...all], pages };
}

async function upsertIfValid(l: Listing | null) {
  if (!l) return false;

  // ✅ AJOUT: évite le crash "invalid input syntax for type uuid: \"\""
  if (!l.shop_id || String(l.shop_id).trim() === "") return false;

  if (!l.url || String(l.url).trim() === "") return false;
  if (!l.price_cad || l.price_cad <= 0) return false; // ✅ jamais de 0$

  await supabase.from("listings").upsert(l, { onConflict: "shop_id,url" });
  return true;
}

async function scrapeSource(src: SourceRow) {
  // ✅ IMPORTANT: un shop qui 429 ne doit PLUS faire planter tout le run
  try {
    // ✅ AJOUT: skip si shop_id vide (sinon uuid error)
    if (!src.shop_id || String(src.shop_id).trim() === "") {
      return { source: src.url, found: 0, error: "Missing shop_id" };
    }

    // ✅ ReefSolution uniquement: scrape le catalogue complet Shopify
    if (isReefSolutionSource(src)) {
      return await scrapeReefSolutionCatalog(src);
    }

    // ✅ AJOUT: Shopify catalog générique (CandyCorals, etc.) = coverage max
    const origin = new URL(src.url).origin;
    if (await isShopifyOrigin(origin)) {
      return await scrapeShopifyCatalogGeneric(src);
    }

    // ✅ MODIF MINIMALE: au lieu d’une seule page, on collecte via pagination (Woo)
    const { links, pages } = await extractLinksWithPagination(src.url, 80);

    let found = 0;

    // throttle léger entre produits (évite 429 sur certains shops)
    const PER_PRODUCT_DELAY_MS = 450;

    // ✅ MODIF MINIMALE: on monte la limite pour éviter de couper trop tôt
    for (const rawUrl of links.slice(0, 1800)) {
      try {
        const url = normalizeUrl(rawUrl);

        // Shopify (1 ligne par produit)
        const shopify = await fetchShopifyProduct(url);
        if (shopify) {
          const l = buildSingleShopifyListing(url, shopify, src.shop_id, src.category);
          if (await upsertIfValid(l)) found++;
          await sleep(PER_PRODUCT_DELAY_MS + jitterMs(250));
          continue;
        }

        // Shopify HTML fallback
        if (url.includes("/products/")) {
          const productHtml = await fetchHtml(url);
          const fb = parseShopifyHtmlFallback(url, productHtml);

          const l = enforceTorch({
            shop_id: src.shop_id,
            category: src.category,
            title_raw: fb.variantTitle ? `${fb.title} — ${fb.variantTitle}` : fb.title,
            url: canonicalProductUrl(url),
            image_url: fb.imageUrl,
            price_cad: safePrice(fb.price_cad),
            sale_price_cad: safePrice(fb.sale_price_cad),
            status: fb.status,
            variant: fb.variantTitle,
            sale_mode: null,
            unit_type: null,
            unit_count: null,
          });

          if (await upsertIfValid(l)) found++;
          await sleep(PER_PRODUCT_DELAY_MS + jitterMs(250));
          continue;
        }

        // Woo/HTML
        const h = await fetchHtml(url);
        const l = parseHtmlProduct(url, h, src.shop_id, src.category);
        if (await upsertIfValid(l)) found++;

        await sleep(PER_PRODUCT_DELAY_MS + jitterMs(250));
      } catch {
        // ignore product
      }
    }

    // ✅ AJOUT: on garde source url, et on peut ajouter pages en debug sans casser la structure
    return { source: src.url + (pages > 1 ? ` (pages:${pages})` : ""), found };
  } catch (e: any) {
    return { source: src.url, found: 0, error: e?.message || "Unknown error" };
  }
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

/* ================= API ================= */

async function run() {
  // ✅ AJOUT (sans enlever le reste): reset complet (évite doublons entre runs + évite uuid: "")
  const del = await supabase.from("listings").delete().not("id", "is", null);
  if (del.error) throw new Error(`Reset failed: ${del.error.message}`);

  const { data, error } = await supabase.from("scrape_sources").select("*").eq("is_active", true);
  if (error) throw new Error(error.message);

  const debug: Array<{ source: string; found: number; error?: string }> = [];
  let total = 0;

  for (const s of data as SourceRow[]) {
    const r = await scrapeSource(s);
    debug.push(r);
    total += r.found;

    // ✅ pause entre shops (évite rafales => 429)
    await sleep(1400 + jitterMs(600));
  }

  return { ok: true, inserted_or_updated: total, debug };
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await run());
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await run());
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
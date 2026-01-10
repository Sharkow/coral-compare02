"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

type Listing = {
  id: string;
  shop_id: string;
  title_raw: string;
  url: string | null;
  image_url: string | null;
  price_cad: number | null;
  sale_price_cad: number | null;
  status: string;
  category: string;
  coral_type: string | null;
  variant: string | null;
  sale_mode: string | null;
  unit_type: string | null;
  unit_count: number | null;
  created_at: string;
};

type SortMode = "price_asc" | "price_desc" | "discount_desc";

function slugToVariant(slug: string): string {
  return (slug || "").toLowerCase().replace(/-/g, " ").trim();
}

function variantToSlug(v: string): string {
  return (v || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

function displayPrice(l: Listing): number | null {
  if (l.sale_price_cad != null) return l.sale_price_cad;
  if (l.price_cad != null) return l.price_cad;
  return null;
}

function discountPercent(l: Listing): number | null {
  if (l.price_cad == null || l.sale_price_cad == null) return null;
  if (l.price_cad <= 0) return null;
  const pct = (1 - l.sale_price_cad / l.price_cad) * 100;
  if (!Number.isFinite(pct)) return null;
  if (pct <= 0) return null;
  return Math.round(pct);
}

function formatCad(n: number | null): string {
  if (n == null) return "—";
  return `${n.toFixed(2)} CAD`;
}

function prettyVariantName(v: string): string {
  const raw = (v || "").trim();
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, "");
  if (compact.length > 0 && compact.length <= 4) return compact.toUpperCase();
  return raw
    .toLowerCase()
    .split(/\s+/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function shouldShowVariant(v: string | null | undefined): boolean {
  const raw = (v ?? "").trim();
  if (!raw) return false;
  if (raw === "—") return false;
  const low = raw.toLowerCase();
  if (low === "default title") return false;
  if (low === "default") return false;
  return true;
}

const SELECT_FIELDS =
  "id, shop_id, title_raw, url, image_url, price_cad, sale_price_cad, status, category, coral_type, variant, sale_mode, unit_type, unit_count, created_at";

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}
function normSpace(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function needlesForVariant(name: string): string[] {
  const n = name.trim().toLowerCase();
  const out = new Set<string>([n, normSpace(n), norm(n)]);

  if (n === "hellfire") out.add("hell fire");
  if (n === "holy grail") out.add("holygrail");
  if (n === "dragon soul") out.add("dragonsoul");
  if (n === "dragon tamer") out.add("dragontamer");
  if (n === "indo gold") out.add("indogold");
  if (n === "ny knicks") {
    out.add("nyknicks");
    out.add("knicks");
  }
  if (n === "24k gold") {
    out.add("24k");
    out.add("24 k");
    out.add("24kgold");
  }
  if (n === "sun god") out.add("sungod");
  if (n === "cotton candy") out.add("cottoncandy");
  if (n === "grim reaper") out.add("grimreaper");

  return [...out].filter(Boolean);
}

function buildOrForNeedles(needles: string[]): string {
  const parts: string[] = [];
  for (const nd of needles) {
    const a = normSpace(nd);
    const b = norm(nd);

    if (a) {
      const aEsc = a.replace(/%/g, "\\%");
      parts.push(`title_raw.ilike.%${aEsc}%`);
      parts.push(`variant.ilike.%${aEsc}%`);
    }
    if (b && b !== a) {
      const bEsc = b.replace(/%/g, "\\%");
      parts.push(`title_raw.ilike.%${bEsc}%`);
      parts.push(`variant.ilike.%${bEsc}%`);
    }
  }
  return parts.join(",");
}

/* ---------------- ✅ LOGIQUE TORCH (inclusion/exclusion) ---------------- */

const TORCH_VARIANTS: string[] = [
  "Dragon Soul",
  "Indo Gold",
  "Jester",
  "Hellfire",
  "NY Knicks",
  "Dragon Tamer",
  "24K Gold",
  "Sun God",
  "Holy Grail",
  "Master",
  "Rapunzel",
  "Banana",
  "Green",
  "Black",
  "Cotton Candy",
  "Grim Reaper",
  "Rasta",
  "Miami",
  "Joker",
  "Tiger",
];

const TORCH_INCLUDE_WORDS_BASE = ["torch", "torche"];

const TORCH_EXCLUDE_WORDS = [
  "zoa",
  "zoanthid",
  "zoanthids",
  "zoanthus",
  "acro",
  "acropora",
  "hammer",
  "frogspawn",
  "octospawn",
  "snail",
  "fish",
  "crab",
  "urchin",
];

function textForMatch(l: Listing): string {
  return `${l.title_raw || ""} ${l.variant || ""}`.toLowerCase();
}

function includesAny(hay: string, needles: string[]): boolean {
  for (const n of needles) {
    const s = (n || "").toLowerCase().trim();
    if (!s) continue;
    if (hay.includes(s)) return true;
  }
  return false;
}

function isBlacklistedTorch(hay: string): boolean {
  return includesAny(hay, TORCH_EXCLUDE_WORDS);
}

function allTorchNeedlesForAllPage(): string[] {
  const out = new Set<string>();
  for (const w of TORCH_INCLUDE_WORDS_BASE) out.add(w);
  for (const v of TORCH_VARIANTS) for (const n of needlesForVariant(v)) out.add(n);
  return [...out];
}

function torchPassesFilter(l: Listing, mode: "all" | "variant", variantName: string): boolean {
  const hay = textForMatch(l);

  // 1) blacklist prioritaire
  if (isBlacklistedTorch(hay)) return false;

  // 2) inclusion
  if (mode === "all") {
    // All = torch/torche OU variantes
    return includesAny(hay, allTorchNeedlesForAllPage());
  }

  // ✅ VARIANT = UNIQUEMENT mots-clés de cette variante (PAS "torch/torche")
  const v = (variantName || "").trim();
  if (!v) return false;

  const needles = needlesForVariant(v);
  return includesAny(hay, needles);
}

/* ---------------- shop name via domain ---------------- */

const SHOP_LABEL_BY_DOMAIN: Record<string, string> = {
  "candycorals.ca": "Candy Corals",
  "fragbox.ca": "Fragbox",
  "reefsolution.com": "Reef Solution",
  "abcaquaplus.ca": "ABC AquaPlus",
  "saltwaterpros.ca": "Saltwater Pros",
  "ragingreef.com": "Raging Reef",
  "reefparadise.ca": "Reef Paradise",
};

function domainFromUrl(u: string | null): string {
  if (!u) return "";
  try {
    const url = new URL(u);
    return (url.hostname || "").toLowerCase().replace(/^www\./, "");
  } catch {
    const m = String(u).toLowerCase().match(/https?:\/\/([^/]+)/);
    const host = (m?.[1] || "").replace(/^www\./, "");
    return host;
  }
}

function shopNameFromListing(l: Listing): string {
  const d = domainFromUrl(l.url);
  if (d && SHOP_LABEL_BY_DOMAIN[d]) return SHOP_LABEL_BY_DOMAIN[d];
  if (d) return d;
  return "Shop";
}

export default function CompareTorchVariantPage() {
  const router = useRouter();
  const params = useParams<{ variant: string }>();

  const variantSlug = params?.variant || "";
  const variant = useMemo(() => slugToVariant(variantSlug), [variantSlug]);

  const isAll = useMemo(() => (variantSlug || "").trim().toLowerCase() === "all", [variantSlug]);

  const [variantListings, setVariantListings] = useState<Listing[]>([]);
  const [variantLoading, setVariantLoading] = useState(true);

  const [searchResults, setSearchResults] = useState<Listing[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterTerm, setFilterTerm] = useState("");

  const [suggestions, setSuggestions] = useState<Listing[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const [sortMode, setSortMode] = useState<SortMode>("price_asc");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setVariantLoading(true);
      setMsg(null);

      let q = supabase.from("listings").select(SELECT_FIELDS);

      if (isAll) {
        q = q.order("created_at", { ascending: false }).limit(3000);
      } else {
        const v = variant.trim();
        if (!v) {
          setVariantListings([]);
          setVariantLoading(false);
          return;
        }

        // ✅ préfiltre SQL UNIQUEMENT sur la variante (sinon "torch" pollue toutes les pages)
        const needles = needlesForVariant(v);
        q = q.or(buildOrForNeedles(needles))
          .order("created_at", { ascending: false })
          .limit(2000);
      }

      const { data, error } = await q;

      if (cancelled) return;

      if (error) {
        setMsg("Erreur chargement listings: " + error.message);
        setVariantListings([]);
      } else {
        const raw = (data as Listing[]) ?? [];

        const filtered = isAll
          ? raw.filter((l) => torchPassesFilter(l, "all", ""))
          : raw.filter((l) => torchPassesFilter(l, "variant", variant));

        setVariantListings(filtered);
      }

      setVariantLoading(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [variant, isAll]);

  useEffect(() => {
    let cancelled = false;
    const q = search.trim().toLowerCase();

    if (!q) {
      setSuggestions([]);
      return;
    }

    const t = setTimeout(async () => {
      setSuggestLoading(true);

      const [byTitle, byVariant] = await Promise.all([
        supabase
          .from("listings")
          .select(SELECT_FIELDS)
          .ilike("title_raw", `%${q}%`)
          .order("created_at", { ascending: false })
          .limit(40),

        supabase
          .from("listings")
          .select(SELECT_FIELDS)
          .not("variant", "is", null)
          .ilike("variant", `%${q}%`)
          .order("created_at", { ascending: false })
          .limit(40),
      ]);

      if (cancelled) return;

      const merged: Listing[] = [];
      const seen = new Set<string>();

      const pushUniq = (arr: any[] | null | undefined) => {
        for (const it of (arr as Listing[]) ?? []) {
          if (!it?.id) continue;
          if (seen.has(it.id)) continue;
          seen.add(it.id);
          merged.push(it);
        }
      };

      if (!byTitle.error) pushUniq(byTitle.data as any[]);
      if (!byVariant.error) pushUniq(byVariant.data as any[]);

      const filtered = merged.filter((l) => torchPassesFilter(l, "all", ""));
      setSuggestions(filtered.slice(0, 12));
      setSuggestLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const q = filterTerm.trim().toLowerCase();
      if (!q) {
        setSearchResults([]);
        setSearchLoading(false);
        return;
      }

      setSearchLoading(true);

      const [byTitle, byVariant] = await Promise.all([
        supabase
          .from("listings")
          .select(SELECT_FIELDS)
          .ilike("title_raw", `%${q}%`)
          .order("created_at", { ascending: false })
          .limit(800),

        supabase
          .from("listings")
          .select(SELECT_FIELDS)
          .not("variant", "is", null)
          .ilike("variant", `%${q}%`)
          .order("created_at", { ascending: false })
          .limit(800),
      ]);

      if (cancelled) return;

      const merged: Listing[] = [];
      const seen = new Set<string>();
      const pushUniq = (arr: any[] | null | undefined) => {
        for (const it of (arr as Listing[]) ?? []) {
          if (!it?.id) continue;
          if (seen.has(it.id)) continue;
          seen.add(it.id);
          merged.push(it);
        }
      };

      if (!byTitle.error) pushUniq(byTitle.data as any[]);
      if (!byVariant.error) pushUniq(byVariant.data as any[]);

      const filtered = merged.filter((l) => torchPassesFilter(l, "all", ""));
      setSearchResults(filtered);
      setSearchLoading(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [filterTerm]);

  const showingGlobalSearch = filterTerm.trim().length > 0;
  const baseList = showingGlobalSearch ? searchResults : variantListings;
  const loading = showingGlobalSearch ? searchLoading : variantLoading;

  const best = useMemo(() => {
    let bestPrice: number | null = null;
    let bestDiscount: number | null = null;

    for (const l of baseList) {
      const p = displayPrice(l);
      if (p != null) {
        if (bestPrice == null || p < bestPrice) bestPrice = p;
      }
      const d = discountPercent(l);
      if (d != null) {
        if (bestDiscount == null || d > bestDiscount) bestDiscount = d;
      }
    }

    return { bestPrice, bestDiscount };
  }, [baseList]);

  const sorted = useMemo(() => {
    const arr = [...baseList];

    arr.sort((a, b) => {
      const aSO = a.status === "sold_out" ? 1 : 0;
      const bSO = b.status === "sold_out" ? 1 : 0;
      if (aSO !== bSO) return aSO - bSO;

      if (sortMode === "discount_desc") {
        const da = discountPercent(a);
        const db = discountPercent(b);

        if (da == null && db == null) {
          const pa = displayPrice(a);
          const pb = displayPrice(b);
          if (pa == null && pb == null) return 0;
          if (pa == null) return 1;
          if (pb == null) return -1;
          return pa - pb;
        }
        if (da == null) return 1;
        if (db == null) return -1;
        if (db !== da) return db - da;

        const pa = displayPrice(a);
        const pb = displayPrice(b);
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pa - pb;
      }

      const pa = displayPrice(a);
      const pb = displayPrice(b);
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      if (sortMode === "price_desc") return pb - pa;
      return pa - pb;
    });

    return arr;
  }, [baseList, sortMode]);

  const applySearch = (q: string) => {
    const v = q.trim();
    setFilterTerm(v);
    setSuggestions([]);
  };

  const clearSearch = () => {
    setSearch("");
    setFilterTerm("");
    setSuggestions([]);
  };

  const applyFromSuggestion = (l: Listing) => {
    const t = (l.title_raw || "").trim();
    if (!t) return;
    setSearch(t);
    applySearch(t);
  };

  const Badge = ({
    children,
    tone = "neutral",
  }: {
    children: ReactNode;
    tone?: "neutral" | "green" | "gold";
  }) => {
    const styles =
      tone === "green"
        ? { background: "#0f2a18", border: "1px solid #1f6b3a", color: "#c9ffd9" }
        : tone === "gold"
        ? { background: "#2a220f", border: "1px solid #7a5f1f", color: "#ffe7b0" }
        : { background: "#141421", border: "1px solid #2a2a33", color: "#f5f5f7" };

    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderRadius: 999,
          fontSize: 12,
          ...styles,
        }}
      >
        {children}
      </span>
    );
  };

  const unitLabel = (l: Listing): string => {
    if (l.sale_mode !== "per_unit") return "WYSIWYG";

    const t = (l.unit_type || "").trim();
    const n = l.unit_count;

    if (t === "head" && (n == null || Number.isNaN(n as any))) return "unit: 1+ head";

    const qty = n == null ? "?" : String(n);
    const suffix = t ? ` ${t}` : "";
    return `unit: ${qty}${suffix}`;
  };

  const actionBtnStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid #3a3a44",
    color: "#ffffff",
    textDecoration: "none",
    background: "#6f6f78",
    cursor: "pointer",
    fontWeight: 700,
  };

  const backBtnStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #2a2a33",
    background: "#101018",
    color: "#f5f5f7",
    cursor: "pointer",
    fontWeight: 800,
  };

  return (
    <main style={{ minHeight: "100vh", background: "#0b0b0f", color: "#f5f5f7", padding: 20 }}>
      {/* ✅ Barre top : bouton retour (et on a supprimé le titre "Comparaison — Torch — ...") */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button type="button" onClick={() => router.push("/compare/torch")} style={backBtnStyle}>
          ← Retour Torch
        </button>

        {/* Optionnel: petit rappel discret de la variante (tu peux l’enlever si tu veux 0 texte) */}
        <div style={{ opacity: 0.65, fontWeight: 800, fontSize: 12 }}>{variantSlug}</div>
      </div>

      <div style={{ opacity: 0.75, marginBottom: 10 }}>
        {loading ? "Chargement…" : `${sorted.length} résultat(s) affiché(s).`}
      </div>

      {!loading && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <Badge tone="gold">
            Meilleur prix: <b>{formatCad(best.bestPrice)}</b>
          </Badge>
          <Badge tone="green">
            Meilleure promo: <b>{best.bestDiscount != null ? `-${best.bestDiscount}%` : "—"}</b>
          </Badge>
          {filterTerm.trim() ? (
            <Badge>
              Recherche: <b>{filterTerm.trim()}</b>
            </Badge>
          ) : null}
        </div>
      )}

      {msg ? (
        <div
          style={{
            background: "#2a1e1e",
            border: "1px solid #5a2a2a",
            padding: 10,
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          {msg}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <div style={{ position: "relative", width: 520, maxWidth: "100%" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Recherche globale (ex: "tor", "gold", "meteor") puis Enter'
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #2a2a33",
              background: "#111118",
              color: "#f5f5f7",
              outline: "none",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") applySearch(search);
              if (e.key === "Escape") setSuggestions([]);
            }}
          />

          {search.trim() && (suggestLoading || suggestions.length > 0) ? (
            <div
              style={{
                position: "absolute",
                zIndex: 50,
                top: "110%",
                left: 0,
                right: 0,
                background: "#0f0f15",
                border: "1px solid #2a2a33",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {suggestLoading ? <div style={{ padding: 10, opacity: 0.8 }}>Recherche…</div> : null}

              {!suggestLoading &&
                suggestions.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => applyFromSuggestion(l)}
                    style={{
                      width: "100%",
                      display: "block",
                      textAlign: "left",
                      padding: "10px 12px",
                      background: "transparent",
                      border: "none",
                      color: "#f5f5f7",
                      cursor: "pointer",
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <div style={{ fontWeight: 700 }}>{l.title_raw}</div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>
                      {shouldShowVariant(l.variant) ? <>variant: {l.variant} • </> : null}
                      prix: {formatCad(displayPrice(l))}
                    </div>
                  </button>
                ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => applySearch(search)}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #2a2a33",
            background: "#141421",
            color: "#f5f5f7",
            cursor: "pointer",
          }}
        >
          Rechercher
        </button>

        <button
          type="button"
          onClick={clearSearch}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #2a2a33",
            background: "#101018",
            color: "#f5f5f7",
            cursor: "pointer",
            opacity: 0.9,
          }}
        >
          Effacer
        </button>

        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #2a2a33",
            background: "#111118",
            color: "#f5f5f7",
          }}
        >
          <option value="price_asc">Prix (croissant)</option>
          <option value="price_desc">Prix (décroissant)</option>
          <option value="discount_desc">Meilleure promo (%)</option>
        </select>
      </div>

      {loading ? (
        <div style={{ opacity: 0.8 }}>Chargement…</div>
      ) : sorted.length === 0 ? (
        <div style={{ opacity: 0.8 }}>0 résultat(s).</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, 220px)",
            gap: 12,
            justifyContent: "center",
          }}
        >
          {sorted.map((l) => {
            const base = l.price_cad;
            const sale = l.sale_price_cad;
            const shown = displayPrice(l);
            const pct = discountPercent(l);

            const showV = shouldShowVariant(l.variant);
            const vName = l.variant ? prettyVariantName(l.variant) : "";

            const isSoldOut = l.status === "sold_out";
            const shopName = shopNameFromListing(l);

            return (
              <div
                key={l.id}
                style={{
                  background: "#101018",
                  border: "1px solid #242432",
                  borderRadius: 16,
                  overflow: "hidden",
                }}
              >
                <div style={{ position: "relative" }}>
                  {l.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.image_url} alt={l.title_raw} style={{ width: "100%", height: 180, objectFit: "cover" }} />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: 180,
                        background: "#151523",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.7,
                      }}
                    >
                      Pas d’image
                    </div>
                  )}

                  <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {pct != null ? <Badge tone="green">-{pct}%</Badge> : null}
                  </div>
                </div>

                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{l.title_raw}</div>

                  <div style={{ marginBottom: 8, opacity: 0.9 }}>
                    <span style={{ fontWeight: 800 }}>{formatCad(shown)}</span>
                    {sale != null && base != null ? (
                      <span style={{ marginLeft: 10, opacity: 0.75 }}>
                        <s>{formatCad(base)}</s>
                      </span>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", opacity: 0.8 }}>
                    {showV ? <span>variant: {l.variant}</span> : null}
                    <span>{unitLabel(l)}</span>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {l.url ? (
                      <a href={l.url} target="_blank" rel="noreferrer" style={actionBtnStyle}>
                        Voir sur le shop
                      </a>
                    ) : null}

                    {showV && l.variant ? (
                      <button
                        type="button"
                        onClick={() => router.push(`/compare/torch/${variantToSlug(l.variant!)}`)}
                        style={actionBtnStyle}
                        title="Ouvrir la page de comparaison de ce variant"
                      >
                        {vName || "Variant"}
                      </button>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.9 }}>{shopName}</div>
                    {isSoldOut ? <div style={{ fontSize: 12, fontWeight: 900, color: "#ff4d4d" }}>SOLD OUT</div> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";
import { supabase } from "../lib/supabaseClient";

/* ===================== TYPES ===================== */

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

const SELECT_FIELDS =
  "id, shop_id, title_raw, url, image_url, price_cad, sale_price_cad, status, category, coral_type, variant, sale_mode, unit_type, unit_count, created_at";

/* ===================== UTILS PRIX ===================== */

function formatCad(n: number | null): string {
  if (n == null) return "—";
  return `${n.toFixed(2)} CAD`;
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
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return Math.round(pct);
}

/* ===================== MATCHING MOT-CLÉ ===================== */

function normSpace(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * ✅ IMPORTANT (DEMANDÉ) :
 * Recherche UNIQUEMENT sur les lettres du TITRE (title_raw)
 * => pas variant, pas category, pas shop_id, pas unit, etc.
 */
function titleForSearch(l: Listing): string {
  return normSpace(`${l.title_raw || ""}`);
}

function matchesKeywordTitleOnly(l: Listing, q: string): boolean {
  const k = normSpace(q);
  if (!k) return true;
  return titleForSearch(l).includes(k);
}

/* ===================== SHOP NAME (via URL domain) ===================== */

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
  return l.shop_id || "Shop";
}

/* ===================== UNIT LABEL ===================== */

function unitLabel(l: Listing): string {
  if (l.sale_mode !== "per_unit") return "WYSIWYG";

  const t = (l.unit_type || "").trim();
  const n = l.unit_count;

  if (t === "head" && (n == null || Number.isNaN(n as any))) return "1+ head";

  const qty = n == null ? "?" : String(n);
  const suffix = t ? ` ${t}` : "";
  return `${qty}${suffix}`.trim();
}

/* ===================== PAGE ===================== */

export default function HomePage() {
  // ---------- Styles ----------
  const page: React.CSSProperties = {
    minHeight: "100vh",
    color: "#f5f5f7",
    backgroundColor: "#0b0b0f",
    backgroundImage:
      "radial-gradient(1200px 700px at 10% 0%, rgba(60,120,255,0.18), transparent 60%), url('/backgrounds/home-bg.png')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    display: "flex",
    flexDirection: "column",
    padding: 18,
    gap: 88,
  };

  const container: React.CSSProperties = {
    width: "100%",
    maxWidth: 1200,
    margin: "0 auto",
  };

  const glassBar: React.CSSProperties = {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(5, 10, 20, 0.55)",
    backdropFilter: "blur(10px)",
    padding: 16,
  };

  const topBar: React.CSSProperties = {
    ...glassBar,
    display: "flex",
    alignItems: "center",
    gap: 18,
  };

  const taglineWrap: React.CSSProperties = {
    flex: 1,
    textAlign: "center",
    lineHeight: 1.45,
    fontSize: 18,
    opacity: 0.96,
    padding: "0 10px",
  };

  const sectionTitle: React.CSSProperties = {
    textAlign: "center",
    fontSize: 20,
    fontWeight: 900,
    marginTop: 10,
    marginBottom: 10,
    textShadow: "0 2px 12px rgba(0,0,0,0.35)",
  };

  const searchBarWrap: React.CSSProperties = {
    ...glassBar,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
    position: "relative", // ✅ pour ancrer les dropdowns
    zIndex: 50, // ✅ crée un contexte au-dessus
  };

  const inputStyle: React.CSSProperties = {
    width: 460,
    maxWidth: "92vw",
    height: 40,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.55)",
    color: "#f5f5f7",
    padding: "0 14px",
    outline: "none",
    fontSize: 13,
  };

  const btn: React.CSSProperties = {
    height: 40,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.55)",
    color: "#f5f5f7",
    padding: "0 14px",
    fontSize: 13,
    cursor: "pointer",
    transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease",
  };

  const select: React.CSSProperties = {
    height: 40,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.55)",
    color: "#f5f5f7",
    padding: "0 12px",
    fontSize: 13,
    cursor: "pointer",
  };

  const logoSize = 120;
  const iconSize = 106;

  // ---------- Résultats styles ----------
  const resultsWrap: React.CSSProperties = {
    ...glassBar,
    padding: 18,
    position: "relative",
    zIndex: 1, // ✅ en dessous des dropdowns
  };

  const resultsHeader: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  };

  const pillRow: React.CSSProperties = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  };

  const pill: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.35)",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    opacity: 0.95,
  };

  // ✅ grille cartes uniformes
  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 240px))",
    gap: 14,
    justifyContent: "center",
    marginTop: 14,
  };

  const resultCardWrap: React.CSSProperties = {
    position: "relative",
    width: 240,
    height: 360,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.38)",
    overflow: "hidden",
    transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
    boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
    textDecoration: "none",
    color: "#f5f5f7",
    display: "flex",
    flexDirection: "column",
  };

  const resultTitle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 13,
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(0,0,0,0.25)",
    lineHeight: 1.2,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    minHeight: 44,
  };

  const imgArea: React.CSSProperties = {
    width: "100%",
    height: 190,
    background: "rgba(0,0,0,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  };

  const infoArea: React.CSSProperties = {
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    flex: 1,
  };

  const priceRow: React.CSSProperties = {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
  };

  const priceMain: React.CSSProperties = { fontWeight: 900, fontSize: 16 };

  const oldPrice: React.CSSProperties = {
    opacity: 0.65,
    textDecoration: "line-through",
    fontSize: 13,
  };

  const lineSmall: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.9,
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
  };

  const badgePct: React.CSSProperties = {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 5,
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 900,
    background: "rgba(20,80,40,0.85)",
    border: "1px solid rgba(40,160,80,0.9)",
    color: "#c9ffd9",
    boxShadow: "0 10px 18px rgba(0,0,0,0.25)",
  };

  const statusSold: React.CSSProperties = { fontWeight: 900, color: "#ff4d4d" };
  const statusOk: React.CSSProperties = { fontWeight: 900, color: "#c9ffd9" };

  // ---------- Hover ----------
  const onHoverResultCard = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget as HTMLElement;
    el.style.transform = "translateY(-2px)";
    el.style.boxShadow = "0 18px 55px rgba(0,0,0,0.35)";
    el.style.borderColor = "rgba(140, 170, 255, 0.22)";
  };

  const onLeaveResultCard = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget as HTMLElement;
    el.style.transform = "translateY(0px)";
    el.style.boxShadow = "0 10px 30px rgba(0,0,0,0.28)";
    el.style.borderColor = "rgba(255,255,255,0.10)";
  };

  // ---------- ✅ Dropdown styles ----------
  const dropdownBtn: React.CSSProperties = {
    ...btn,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
  };

  const dropdownPanel: React.CSSProperties = {
    position: "absolute",
    top: 52,
    minWidth: 260,
    maxWidth: 360,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(10, 14, 22, 0.96)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 22px 70px rgba(0,0,0,0.55)",
    padding: 12,
    zIndex: 9999, // ✅ AU PREMIER PLAN
  };

  const dropdownTitle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 13,
    marginBottom: 10,
    opacity: 0.95,
  };

  const checksWrap: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    maxHeight: 320,
    overflow: "auto",
    paddingRight: 4,
  };

  const checkRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.35)",
    borderRadius: 12,
    padding: "8px 10px",
    cursor: "pointer",
    userSelect: "none",
  };

  const checkboxStyle: React.CSSProperties = {
    width: 16,
    height: 16,
    accentColor: "#7aa2ff",
  };

  const dropdownActions: React.CSSProperties = {
    display: "flex",
    gap: 10,
    marginTop: 12,
    justifyContent: "flex-end",
  };

  const tinyBtn: React.CSSProperties = {
    ...btn,
    height: 34,
    borderRadius: 10,
    padding: "0 12px",
    fontSize: 12,
  };

  // ---------- State (recherche + data) ----------
  const [q, setQ] = React.useState("");
  const [submittedQ, setSubmittedQ] = React.useState("");
  const [showResults, setShowResults] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [sortMode, setSortMode] = React.useState<"price_asc" | "price_desc" | "sale_first" | "new_first">(
    "price_asc"
  );

  const [allListings, setAllListings] = React.useState<Listing[]>([]);
  const [results, setResults] = React.useState<Listing[]>([]);
  const [lastFetched, setLastFetched] = React.useState<Listing[]>([]);

  // ---------- ✅ Filtres state ----------
  const SHOP_DOMAIN_LIST = React.useMemo(() => Object.keys(SHOP_LABEL_BY_DOMAIN), []);

  const [shopFilter, setShopFilter] = React.useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const d of Object.keys(SHOP_LABEL_BY_DOMAIN)) init[d] = false;
    return init;
  });

  const [typeFilter, setTypeFilter] = React.useState<{ zoa: boolean; acro: boolean; torch: boolean }>(() => ({
    zoa: false,
    acro: false,
    torch: false,
  }));

  const [openTypeDropdown, setOpenTypeDropdown] = React.useState(false);
  const [openShopDropdown, setOpenShopDropdown] = React.useState(false);

  function anyShopChecked(): boolean {
    return Object.values(shopFilter).some(Boolean);
  }

  function anyTypeChecked(): boolean {
    return typeFilter.zoa || typeFilter.acro || typeFilter.torch;
  }

  function listingMatchesShop(l: Listing): boolean {
    if (!anyShopChecked()) return true;
    const d = domainFromUrl(l.url);
    if (!d) return false;
    return shopFilter[d] === true;
  }

  function listingMatchesType(l: Listing): boolean {
    if (!anyTypeChecked()) return true;

    const title = normSpace(l.title_raw || "");

    const zoaOK = title.includes("zoa");
    const acroOK = title.includes("acro");

    const torchKeywords = [
      "torch",
      "rapunzel",
      "holy grail",
      "indo",
      "gold",
      "austie",
      "dragon soul",
      "tips",
      "joker",
      "banana",
    ].map((x) => normSpace(x));

    const torchOK = torchKeywords.some((k) => title.includes(k));

    const okZ = typeFilter.zoa ? zoaOK : false;
    const okA = typeFilter.acro ? acroOK : false;
    const okT = typeFilter.torch ? torchOK : false;

    return okZ || okA || okT;
  }

  function filterWithShopAndType(list: Listing[]): Listing[] {
    return list.filter((l) => listingMatchesShop(l)).filter((l) => listingMatchesType(l));
  }

  // ---------- Load Supabase listings (une fois) ----------
  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("listings")
        .select(SELECT_FIELDS)
        .order("created_at", { ascending: false })
        .limit(6000); // ✅ on monte pour éviter d’en perdre

      if (cancelled) return;

      if (error) {
        setErr(`Erreur Supabase: ${error.message}`);
        setAllListings([]);
        setLoading(false);
        return;
      }

      setAllListings(((data as Listing[]) ?? []).filter(Boolean));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function isOnSale(l: Listing): boolean {
    return l.sale_price_cad != null && l.price_cad != null && l.sale_price_cad < l.price_cad;
  }

  function sortListings(items: Listing[]): Listing[] {
    const copy = [...items];

    // sold_out en bas (peu importe le tri)
    copy.sort((a, b) => {
      const aSO = a.status === "sold_out" ? 1 : 0;
      const bSO = b.status === "sold_out" ? 1 : 0;
      return aSO - bSO;
    });

    if (sortMode === "price_asc") {
      copy.sort((a, b) => {
        const aSO = a.status === "sold_out" ? 1 : 0;
        const bSO = b.status === "sold_out" ? 1 : 0;
        if (aSO !== bSO) return aSO - bSO;
        return (displayPrice(a) ?? 999999) - (displayPrice(b) ?? 999999);
      });
    } else if (sortMode === "price_desc") {
      copy.sort((a, b) => {
        const aSO = a.status === "sold_out" ? 1 : 0;
        const bSO = b.status === "sold_out" ? 1 : 0;
        if (aSO !== bSO) return aSO - bSO;
        return (displayPrice(b) ?? -1) - (displayPrice(a) ?? -1);
      });
    } else if (sortMode === "sale_first") {
      copy.sort((a, b) => {
        const aSO = a.status === "sold_out" ? 1 : 0;
        const bSO = b.status === "sold_out" ? 1 : 0;
        if (aSO !== bSO) return aSO - bSO;

        const da = discountPercent(a) ?? 0;
        const db = discountPercent(b) ?? 0;
        if (db !== da) return db - da;

        return (displayPrice(a) ?? 999999) - (displayPrice(b) ?? 999999);
      });
    } else {
      // new_first : basé sur created_at desc (mais on garde sold_out en bas)
      copy.sort((a, b) => {
        const aSO = a.status === "sold_out" ? 1 : 0;
        const bSO = b.status === "sold_out" ? 1 : 0;
        if (aSO !== bSO) return aSO - bSO;

        const ta = new Date(a.created_at).getTime();
        const tb = new Date(b.created_at).getTime();
        return tb - ta;
      });
    }

    return copy;
  }

  // ✅ AJOUT: échappe % et _ pour ilike
  function escapeIlike(s: string) {
    return s.replace(/[%_]/g, (m) => `\\${m}`);
  }

  /**
   * ✅ Recherche SUPABASE UNIQUEMENT sur title_raw (lettres tapées)
   * puis application filtres shop/type + tri
   */
  async function runSearch(nextQ?: string) {
    const query = (nextQ ?? q).trim();
    setSubmittedQ(query);

    if (!query) {
      setShowResults(false);
      setResults([]);
      setErr(null);
      return;
    }

    setShowResults(true);
    setLoading(true);
    setErr(null);

    try {
      const pat = `%${escapeIlike(query)}%`;

      const { data, error } = await supabase
        .from("listings")
        .select(SELECT_FIELDS)
        .ilike("title_raw", pat) // ✅ TITRE SEULEMENT
        .order("created_at", { ascending: false })
        .limit(6000);

      if (error) {
        setErr(`Erreur Supabase: ${error.message}`);
        setResults([]);
        setLoading(false);
        return;
      }

      const rows = ((data as Listing[]) ?? []).filter(Boolean);

      // ✅ Double sécurité: filtre côté client (titre seulement)
      const titleFiltered = rows.filter((l) => matchesKeywordTitleOnly(l, query));

      // ✅ Filtres shop/type
      const fullyFiltered = filterWithShopAndType(titleFiltered);

      setLastFetched(titleFiltered); // base pour recalcul si filtres changent
      setResults(sortListings(fullyFiltered));
      setLoading(false);
    } catch (e: any) {
      // fallback sur cache local si jamais
      const fallback = allListings.filter((l) => matchesKeywordTitleOnly(l, query));
      const fullyFiltered = filterWithShopAndType(fallback);
      setLastFetched(fallback);
      setResults(sortListings(fullyFiltered));
      setErr(`Erreur recherche (fallback utilisé): ${e?.message || "Unknown error"}`);
      setLoading(false);
    }
  }

  function clearSearch() {
    setQ("");
    setSubmittedQ("");
    setShowResults(false);
    setResults([]);
    setLastFetched([]);
    setErr(null);
  }

  function onKeyDownInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      clearSearch();
    }
  }

  // re-trier quand on change le select
  React.useEffect(() => {
    if (!showResults) return;
    setResults((prev) => sortListings(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode]);

  // ✅ Si filtres changent et on a une recherche active => recalcul sans refaire Supabase
  React.useEffect(() => {
    if (!showResults) return;
    if (!submittedQ.trim()) return;

    const base = lastFetched.length ? lastFetched : allListings.filter((l) => matchesKeywordTitleOnly(l, submittedQ));
    const fullyFiltered = filterWithShopAndType(base);
    setResults(sortListings(fullyFiltered));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopFilter, typeFilter]);

  // ✅ Click outside to close dropdowns
  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;

      const insideDropdown = t.closest("[data-dd='1']");
      if (!insideDropdown) {
        setOpenShopDropdown(false);
        setOpenTypeDropdown(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function resetShopFilter() {
    setShopFilter((prev) => {
      const next: Record<string, boolean> = {};
      for (const k of Object.keys(prev)) next[k] = false;
      return next;
    });
  }

  function resetTypeFilter() {
    setTypeFilter({ zoa: false, acro: false, torch: false });
  }

  // ---------- Page ----------
  return (
    <main style={page}>
      {/* Bandeau top */}
      <div style={container}>
        <div style={topBar}>
          <Link href="/">
            <Image
              src="/branding/coralcompare-logo02.png"
              alt="CoralCompare"
              width={logoSize}
              height={logoSize}
              priority
            />
          </Link>

          <div style={taglineWrap}>
            <div>Compare facilement les prix et les disponibilités de coraux dans les boutiques canadiennes.</div>
            <div>
              +2000 coraux et +30 shops à travers le Canada. Mise à jour des coraux, des prix et des soldes 2 fois par
              jour.
            </div>
          </div>
        </div>
      </div>

      {/* Recherche mot-clé */}
      <div style={container}>
        <div style={sectionTitle}>Recherche par lettres du titre (ex: t, tor, rapunzel...)</div>

        <div style={searchBarWrap} data-dd="1">
          <input
            style={inputStyle}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDownInput}
            placeholder='Tape des lettres (ex: "t", "tor", "rapunzel") puis Enter'
          />

          <button style={btn} onClick={() => runSearch()}>
            Rechercher
          </button>

          {/* ✅ Boutons dropdown comme ton image */}
          <button
            style={dropdownBtn}
            onClick={() => {
              setOpenTypeDropdown((v) => !v);
              setOpenShopDropdown(false);
            }}
            type="button"
          >
            Filtrer par coraux
          </button>

          <button
            style={dropdownBtn}
            onClick={() => {
              setOpenShopDropdown((v) => !v);
              setOpenTypeDropdown(false);
            }}
            type="button"
          >
            Filtrer par magasin
          </button>

          <button style={btn} onClick={clearSearch}>
            Effacer
          </button>

          <select style={select} value={sortMode} onChange={(e) => setSortMode(e.target.value as any)}>
            <option value="price_asc">Prix (croissant)</option>
            <option value="price_desc">Prix (décroissant)</option>
            <option value="sale_first">Soldes d’abord</option>
            <option value="new_first">Nouveautés</option>
          </select>

          {/* ✅ Dropdown CORAUX (z-index MAX) */}
          {openTypeDropdown ? (
            <div
              style={{
                ...dropdownPanel,
                left: 0,
              }}
              data-dd="1"
            >
              <div style={dropdownTitle}>Types de coraux</div>

              <div style={checksWrap}>
                <label style={checkRow}>
                  <input
                    type="checkbox"
                    style={checkboxStyle}
                    checked={typeFilter.acro}
                    onChange={() => setTypeFilter((p) => ({ ...p, acro: !p.acro }))}
                  />
                  <div>
                    <div style={{ fontWeight: 900 }}>Acropora</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>Titre contient “acro”</div>
                  </div>
                </label>

                <label style={checkRow}>
                  <input
                    type="checkbox"
                    style={checkboxStyle}
                    checked={typeFilter.zoa}
                    onChange={() => setTypeFilter((p) => ({ ...p, zoa: !p.zoa }))}
                  />
                  <div>
                    <div style={{ fontWeight: 900 }}>Zoa</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>Titre contient “zoa”</div>
                  </div>
                </label>

                <label style={checkRow}>
                  <input
                    type="checkbox"
                    style={checkboxStyle}
                    checked={typeFilter.torch}
                    onChange={() => setTypeFilter((p) => ({ ...p, torch: !p.torch }))}
                  />
                  <div>
                    <div style={{ fontWeight: 900 }}>Torch</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      torch / rapunzel / holy grail / indo / gold / austie / dragon soul / tips / joker / banana
                    </div>
                  </div>
                </label>
              </div>

              <div style={dropdownActions}>
                <button
                  style={tinyBtn}
                  onClick={() => {
                    resetTypeFilter();
                  }}
                  type="button"
                >
                  Reset
                </button>
                <button style={tinyBtn} onClick={() => setOpenTypeDropdown(false)} type="button">
                  OK
                </button>
              </div>
            </div>
          ) : null}

          {/* ✅ Dropdown MAGASIN (z-index MAX) */}
          {openShopDropdown ? (
            <div
              style={{
                ...dropdownPanel,
                left: 170, // position sympa à côté
              }}
              data-dd="1"
            >
              <div style={dropdownTitle}>Magasins</div>

              <div style={checksWrap}>
                {SHOP_DOMAIN_LIST.map((domain) => {
                  const label = SHOP_LABEL_BY_DOMAIN[domain] || domain;
                  const checked = shopFilter[domain] === true;

                  return (
                    <label key={domain} style={checkRow} title={domain}>
                      <input
                        type="checkbox"
                        style={checkboxStyle}
                        checked={checked}
                        onChange={() =>
                          setShopFilter((prev) => ({
                            ...prev,
                            [domain]: !prev[domain],
                          }))
                        }
                      />
                      <div style={{ fontWeight: 900 }}>{label}</div>
                    </label>
                  );
                })}
              </div>

              <div style={dropdownActions}>
                <button
                  style={tinyBtn}
                  onClick={() => {
                    resetShopFilter();
                  }}
                  type="button"
                >
                  Reset
                </button>
                <button style={tinyBtn} onClick={() => setOpenShopDropdown(false)} type="button">
                  OK
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Résultats */}
      {showResults ? (
        <div style={container}>
          <div style={resultsWrap}>
            <div style={resultsHeader}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>
                Résultats pour : <span style={{ opacity: 0.9 }}>{submittedQ}</span>
              </div>

              <div style={pillRow}>
                <div style={pill}>{loading ? "Chargement…" : `${results.length} résultat(s)`}</div>
                <div style={pill}>
                  Tri :{" "}
                  {sortMode === "price_asc"
                    ? "Prix (croissant)"
                    : sortMode === "price_desc"
                    ? "Prix (décroissant)"
                    : sortMode === "sale_first"
                    ? "Soldes d’abord"
                    : "Nouveautés"}
                </div>
              </div>
            </div>

            {err ? <div style={{ opacity: 0.85, fontSize: 13, marginTop: 10 }}>{err}</div> : null}

            {!loading && results.length === 0 ? (
              <div style={{ opacity: 0.85, fontSize: 13, marginTop: 12 }}>
                Aucun résultat. Essaie d’autres lettres (ex: “tor”, “rap”, “ham”, etc.).
              </div>
            ) : (
              <div style={grid}>
                {results.map((l) => {
                  const onSale = isOnSale(l);
                  const pct = discountPercent(l);
                  const shopName = shopNameFromListing(l);
                  const availability = l.status === "sold_out" ? "SOLD OUT" : "DISPONIBLE";

                  const cardNode = (
                    <div style={resultCardWrap} onMouseEnter={onHoverResultCard} onMouseLeave={onLeaveResultCard}>
                      {onSale && pct != null ? <div style={badgePct}>-{pct}%</div> : null}

                      <div style={resultTitle}>{l.title_raw || "Sans titre"}</div>

                      <div style={imgArea}>
                        {l.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={l.image_url}
                            alt={l.title_raw}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <div style={{ opacity: 0.75, fontWeight: 800 }}>Pas d’image</div>
                        )}
                      </div>

                      <div style={infoArea}>
                        <div style={priceRow}>
                          <div style={priceMain}>{formatCad(displayPrice(l))}</div>
                          {onSale ? <div style={oldPrice}>{formatCad(l.price_cad)}</div> : null}
                        </div>

                        <div style={lineSmall}>
                          <span style={{ opacity: 0.85 }}>Disponibilité</span>
                          <span style={l.status === "sold_out" ? statusSold : statusOk}>{availability}</span>
                        </div>

                        <div style={lineSmall}>
                          <span style={{ opacity: 0.85 }}>Format</span>
                          <span style={{ fontWeight: 900 }}>{unitLabel(l)}</span>
                        </div>

                        <div style={lineSmall}>
                          <span style={{ opacity: 0.85 }}>Magasin</span>
                          <span style={{ fontWeight: 900, textAlign: "right" }}>{shopName}</span>
                        </div>
                      </div>
                    </div>
                  );

                  return l.url ? (
                    <a
                      key={l.id}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "none" }}
                    >
                      {cardNode}
                    </a>
                  ) : (
                    <div key={l.id}>{cardNode}</div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

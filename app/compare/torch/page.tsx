"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../../lib/supabaseClient";

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

/* ---------------- utils prix ---------------- */

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

/* ---------------- variants ---------------- */

/**
 * ⚠️ Noms UI
 * - "Indo Gold" → "Indo"
 * - "Master" → "Master Torch"
 */
const TORCH_VARIANTS: string[] = [
  "Dragon Soul",
  "Indo",
  "Jester",
  "Hellfire",
  "NY Knicks",
  "Dragon Tamer",
  "24K Gold",
  "Sun God",
  "Holy Grail",
  "Master Torch",
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
  "All",
];

function variantToSlug(v: string): string {
  return (v || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
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

/* ---------------- matching ---------------- */

function normSpace(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function needlesForVariant(name: string): string[] {
  const n = name.trim().toLowerCase();
  const out = new Set<string>([n, normSpace(n)]);

  if (n === "hellfire") out.add("hell fire");
  if (n === "holy grail") out.add("holygrail");
  if (n === "dragon soul") out.add("dragonsoul");
  if (n === "dragon tamer") out.add("dragontamer");

  if (n === "indo") {
    out.add("indo gold");
    out.add("indogold");
  }

  if (n === "master torch") {
    out.add("master");
    out.add("master torch");
  }

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

/* ---------------- torch filter ---------------- */

/**
 * ✅ ajout de "glabrescens"
 * pour capturer des torches qui n'ont pas "torch" dans le titre/catégorie
 */
const TORCH_INCLUDE_WORDS_BASE = ["torch", "torche", "glabrescens"];

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
    if (hay.includes(n.toLowerCase())) return true;
  }
  return false;
}

function isBlacklistedTorch(hay: string): boolean {
  return includesAny(hay, TORCH_EXCLUDE_WORDS);
}

function allTorchNeedlesForAllPage(): string[] {
  const out = new Set<string>();
  for (const w of TORCH_INCLUDE_WORDS_BASE) out.add(w);
  for (const v of TORCH_VARIANTS) {
    if (v === "All") continue;
    for (const n of needlesForVariant(v)) out.add(n);
  }
  return [...out];
}

function torchPassesFilterAllPage(l: Listing): boolean {
  const hay = textForMatch(l);
  if (isBlacklistedTorch(hay)) return false;
  return includesAny(hay, allTorchNeedlesForAllPage());
}

/* ---------------- UI (mock-like) ---------------- */

const headerBtnStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(16,16,24,0.65)",
  color: "#f5f5f7",
  cursor: "pointer",
  fontWeight: 900,
};

const pageBg: React.CSSProperties = {
  minHeight: "100vh",
  background: "radial-gradient(1200px 700px at 25% 10%, #141421 0%, #0b0b0f 55%, #07070a 100%)",
  color: "#f5f5f7",
  padding: 20,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 18,
  maxWidth: 980,
  marginTop: 22,
};

const cardStyle: React.CSSProperties = {
  background: "rgba(16,16,24,0.70)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 18,
  padding: 14,
  cursor: "pointer",
  color: "#f5f5f7",
  textAlign: "center",
  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  backdropFilter: "blur(10px)",
  transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
};

const iconWrap: React.CSSProperties = {
  width: 118,
  height: 118,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(10,10,16,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: "10px auto 12px",
  overflow: "hidden",
};

export default function CompareTorchPage() {
  const router = useRouter();

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(true);

  // ✅ ton icône actuelle (garde EXACTEMENT le même nom que ton fichier dans /public)
  const TORCH_ICON_SRC = "/variants/torch/torch-defaultv3.png";
  // si tu renommes: "/variants/torch/torch-default-v2.png"

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoadingCounts(true);

      const { data } = await supabase
        .from("listings")
        .select(SELECT_FIELDS)
        .order("created_at", { ascending: false })
        .limit(4000);

      if (cancelled) return;

      const raw = (data as Listing[]) ?? [];
      const onlyTorch = raw.filter((l) => torchPassesFilterAllPage(l));

      const next: Record<string, number> = {};
      for (const v of TORCH_VARIANTS) next[v] = 0;

      next["All"] = onlyTorch.length;

      for (const v of TORCH_VARIANTS) {
        if (v === "All") continue;
        const needles = needlesForVariant(v);
        next[v] = onlyTorch.filter((l) => includesAny(textForMatch(l), needles)).length;
      }

      setCounts(next);
      setLoadingCounts(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const Badge = ({ children }: { children: ReactNode }) => (
    <span
      style={{
        background: "rgba(15,42,24,0.75)",
        border: "1px solid rgba(31,107,58,0.9)",
        color: "#c9ffd9",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        display: "inline-block",
        marginTop: 10,
      }}
    >
      {children}
    </span>
  );

  return (
    <main style={pageBg}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <button onClick={() => router.push("/compare")} style={headerBtnStyle}>
          Home
        </button>
        <div style={{ fontSize: 18, fontWeight: 900, opacity: 0.95 }}>Torch</div>
      </div>

      {/* Variants cards */}
      <div style={gridStyle}>
        {TORCH_VARIANTS.map((v) => (
          <button
            key={v}
            onClick={() => router.push(`/compare/torch/${variantToSlug(v)}`)}
            style={cardStyle}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 16px 40px rgba(0,0,0,0.45)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.16)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0px)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.10)";
            }}
          >
            <div style={iconWrap}>
              <Image
                src={TORCH_ICON_SRC}
                alt={`${prettyVariantName(v)} icon`}
                width={96}
                height={96}
                style={{ width: 96, height: 96, objectFit: "contain" }}
                priority
              />
            </div>

            <div style={{ fontWeight: 900, fontSize: 14 }}>{prettyVariantName(v)}</div>

            <Badge>{loadingCounts ? "…" : `${counts[v] ?? 0} items`}</Badge>
          </button>
        ))}
      </div>
    </main>
  );
}

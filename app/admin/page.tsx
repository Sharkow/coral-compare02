"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Shop = {
  id: string;
  name: string;
  website_url: string | null;
};

type Listing = {
  id: string;
  shop_id: string;
  title_raw: string;
  url: string | null;
  price_cad: number | null;
  sale_price_cad: number | null;
  status: string;
  category: string;
  coral_type: string | null;
  variant: string | null;
  image_url: string | null;

  sale_mode: string | null; // "wysiwyg" | "per_unit"
  unit_type: string | null; // "head" | "polyp" | "frag"
  unit_count: number | null;

  created_at: string;
};

type SaleMode = "wysiwyg" | "per_unit";
type UnitType = "head" | "polyp" | "frag";

export default function AdminPage() {
  // =========================
  // AUTH
  // =========================
  const [authorized, setAuthorized] = useState(false);
  const [password, setPassword] = useState("");

  // =========================
  // UI STATE
  // =========================
  const [msg, setMsg] = useState<string | null>(null);

  // =========================
  // SHOPS
  // =========================
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopName, setShopName] = useState("");
  const [shopUrl, setShopUrl] = useState("");

  // =========================
  // LISTINGS
  // =========================
  const [listings, setListings] = useState<Listing[]>([]);

  // Form (ADD + EDIT)
  const [editingListingId, setEditingListingId] = useState<string | null>(null);

  const [selectedShopId, setSelectedShopId] = useState("");
  const [titleRaw, setTitleRaw] = useState("");
  const [variant, setVariant] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [priceCad, setPriceCad] = useState("");
  const [salePriceCad, setSalePriceCad] = useState("");
  const [category, setCategory] = useState("torch");
  const [status, setStatus] = useState("available");

  // WYSIWYG / per-unit
  const [saleMode, setSaleMode] = useState<SaleMode>("wysiwyg");
  const [unitType, setUnitType] = useState<UnitType>("head");
  const [unitCount, setUnitCount] = useState("");

  const shopsById = useMemo(() => {
    const m = new Map<string, Shop>();
    shops.forEach((s) => m.set(s.id, s));
    return m;
  }, [shops]);

  // =========================
  // LOADERS
  // =========================
  const loadShops = async () => {
    const { data, error } = await supabase
      .from("shops")
      .select("id, name, website_url")
      .order("created_at", { ascending: false });

    if (error) {
      setMsg("Erreur shops: " + error.message);
      return;
    }

    setShops(data ?? []);
    if (!selectedShopId && data && data.length > 0) setSelectedShopId(data[0].id);
  };

  const loadListings = async () => {
    const { data, error } = await supabase
      .from("listings")
      .select(
        "id, shop_id, title_raw, url, price_cad, sale_price_cad, status, category, coral_type, variant, image_url, sale_mode, unit_type, unit_count, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setMsg("Erreur listings: " + error.message);
      return;
    }

    setListings((data as Listing[]) ?? []);
  };

  const refreshAll = async () => {
    setMsg(null);
    await loadShops();
    await loadListings();
  };

  useEffect(() => {
    if (!authorized) return;
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  // =========================
  // LOGIN
  // =========================
  if (!authorized) {
    return (
      <main style={{ padding: 40 }}>
        <h1>Admin</h1>
        <p>Mot de passe requis</p>
        <input
          type="password"
          placeholder="Mot de passe admin"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          onClick={() => {
            const expected = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
            if (!expected) {
              alert("NEXT_PUBLIC_ADMIN_PASSWORD manquant");
              return;
            }
            if (password === expected) setAuthorized(true);
            else alert("Mot de passe incorrect");
          }}
          style={{ marginLeft: 8 }}
        >
          Entrer
        </button>
      </main>
    );
  }

  // =========================
  // HELPERS
  // =========================
  const saleLabel = (l: Listing) => {
    if (l.sale_mode === "wysiwyg") return "WYSIWYG";
    if (l.sale_mode === "per_unit") {
      const count = l.unit_count ?? null;
      const type = l.unit_type ?? "unit";
      return count ? `${count} ${type}(s)` : `par ${type}`;
    }
    return "—";
  };

  const resetForm = () => {
    setEditingListingId(null);
    setTitleRaw("");
    setVariant("");
    setImageUrl("");
    setListingUrl("");
    setPriceCad("");
    setSalePriceCad("");
    setCategory("torch");
    setStatus("available");
    setSaleMode("wysiwyg");
    setUnitType("head");
    setUnitCount("");

    if (shops.length > 0) {
      setSelectedShopId((prev) => prev || shops[0].id);
    }
  };

  const parseNumberOrNull = (s: string) => {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const parseIntOrNull = (s: string) => {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    const i = Math.trunc(n);
    return i > 0 ? i : null;
  };

  // =========================
  // SHOPS ACTIONS
  // =========================
  const addShop = async () => {
    setMsg(null);
    if (!shopName.trim()) return;

    const { error } = await supabase.from("shops").insert({
      name: shopName.trim(),
      website_url: shopUrl.trim() || null,
    });

    if (error) {
      setMsg("Erreur (add shop): " + error.message);
      return;
    }

    setShopName("");
    setShopUrl("");
    await loadShops();
  };

  const deleteShop = async (id: string) => {
    setMsg(null);
    const { error } = await supabase.from("shops").delete().eq("id", id);
    if (error) {
      setMsg("Erreur (delete shop): " + error.message);
      return;
    }
    await refreshAll();
  };

  // =========================
  // LISTINGS ACTIONS
  // =========================
  const addListing = async () => {
    setMsg(null);
    if (!selectedShopId || !titleRaw.trim()) return;

    const price = parseNumberOrNull(priceCad);
    const salePrice = parseNumberOrNull(salePriceCad);

    const unitCountNum =
      saleMode === "per_unit" ? parseIntOrNull(unitCount) : null;

    const { error } = await supabase.from("listings").insert({
      shop_id: selectedShopId,
      title_raw: titleRaw.trim(),
      url: listingUrl.trim() || null,
      price_cad: price,
      sale_price_cad: salePrice,
      category,
      status,
      coral_type: "torch",
      variant: variant.trim().toLowerCase() || null,
      image_url: imageUrl.trim() || null,
      sale_mode: saleMode,
      unit_type: saleMode === "per_unit" ? unitType : null,
      unit_count: saleMode === "per_unit" ? unitCountNum : null,
    });

    if (error) {
      setMsg("Erreur (add listing): " + error.message);
      return;
    }

    resetForm();
    await loadListings();
  };

  const startEdit = (l: Listing) => {
    setMsg(null);
    setEditingListingId(l.id);

    setSelectedShopId(l.shop_id);
    setTitleRaw(l.title_raw ?? "");
    setVariant(l.variant ?? "");
    setImageUrl(l.image_url ?? "");
    setListingUrl(l.url ?? "");
    setPriceCad(l.price_cad != null ? String(l.price_cad) : "");
    setSalePriceCad(l.sale_price_cad != null ? String(l.sale_price_cad) : "");
    setCategory(l.category ?? "torch");
    setStatus(l.status ?? "available");

    const sm: SaleMode = l.sale_mode === "per_unit" ? "per_unit" : "wysiwyg";
    setSaleMode(sm);

    const ut: UnitType =
      l.unit_type === "polyp"
        ? "polyp"
        : l.unit_type === "frag"
        ? "frag"
        : "head";
    setUnitType(ut);

    setUnitCount(l.unit_count != null ? String(l.unit_count) : "");

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const updateListing = async () => {
    setMsg(null);
    if (!editingListingId) return;
    if (!selectedShopId || !titleRaw.trim()) return;

    const price = parseNumberOrNull(priceCad);
    const salePrice = parseNumberOrNull(salePriceCad);

    const unitCountNum =
      saleMode === "per_unit" ? parseIntOrNull(unitCount) : null;

    const payload = {
      shop_id: selectedShopId,
      title_raw: titleRaw.trim(),
      url: listingUrl.trim() || null,
      price_cad: price,
      sale_price_cad: salePrice,
      category,
      status,
      coral_type: "torch",
      variant: variant.trim().toLowerCase() || null,
      image_url: imageUrl.trim() || null,
      sale_mode: saleMode,
      unit_type: saleMode === "per_unit" ? unitType : null,
      unit_count: saleMode === "per_unit" ? unitCountNum : null,
    };

    const { error } = await supabase
      .from("listings")
      .update(payload)
      .eq("id", editingListingId);

    if (error) {
      setMsg("Erreur (update listing): " + error.message);
      return;
    }

    resetForm();
    await loadListings();
  };

  const deleteListing = async (id: string) => {
    setMsg(null);
    const { error } = await supabase.from("listings").delete().eq("id", id);
    if (error) {
      setMsg("Erreur (delete listing): " + error.message);
      return;
    }
    if (editingListingId === id) resetForm();
    await loadListings();
  };

  // =========================
  // UI
  // =========================
  return (
    <main style={{ padding: 24 }}>
      <h1>Admin</h1>

      {msg && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: "#fff3cd",
            borderRadius: 8,
          }}
        >
          {msg}
        </div>
      )}

      <hr style={{ margin: "20px 0" }} />

      <h2>Shops</h2>
      <input
        placeholder="Nom"
        value={shopName}
        onChange={(e) => setShopName(e.target.value)}
      />
      <input
        placeholder="URL"
        value={shopUrl}
        onChange={(e) => setShopUrl(e.target.value)}
      />
      <button onClick={addShop}>Ajouter shop</button>

      <ul style={{ marginTop: 12 }}>
        {shops.map((s) => (
          <li key={s.id}>
            <b>{s.name}</b>{" "}
            {s.website_url ? (
              <span style={{ opacity: 0.7 }}>— {s.website_url}</span>
            ) : null}{" "}
            <button onClick={() => deleteShop(s.id)}>❌</button>
          </li>
        ))}
      </ul>

      <hr style={{ margin: "20px 0" }} />

      <h2>{editingListingId ? "Modifier un corail" : "Ajouter un corail"}</h2>

      {editingListingId ? (
        <div
          style={{
            marginBottom: 10,
            padding: 10,
            background: "#e7f1ff",
            borderRadius: 8,
          }}
        >
          Mode édition ✅ (ID: <code>{editingListingId}</code>)
          <button onClick={resetForm} style={{ marginLeft: 8 }}>
            Annuler
          </button>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          value={selectedShopId}
          onChange={(e) => setSelectedShopId(e.target.value)}
        >
          <option value="">Choisir un shop</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <input
          placeholder="Titre brut (ex: Holy Grail Torch 2 heads)"
          value={titleRaw}
          onChange={(e) => setTitleRaw(e.target.value)}
          style={{ minWidth: 280 }}
        />

        <input
          placeholder="Variant (ex: holy grail)"
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
          style={{ minWidth: 180 }}
        />

        <input
          placeholder="Image URL"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          style={{ minWidth: 280 }}
        />

        <input
          placeholder="URL produit"
          value={listingUrl}
          onChange={(e) => setListingUrl(e.target.value)}
          style={{ minWidth: 280 }}
        />

        <input
          placeholder="Prix CAD"
          value={priceCad}
          onChange={(e) => setPriceCad(e.target.value)}
          style={{ width: 120 }}
        />

        <input
          placeholder="Prix soldé (optionnel)"
          value={salePriceCad}
          onChange={(e) => setSalePriceCad(e.target.value)}
          style={{ width: 170 }}
        />

        <select
          value={saleMode}
          onChange={(e) => setSaleMode(e.target.value as SaleMode)}
        >
          <option value="wysiwyg">WYSIWYG (pièce exacte)</option>
          <option value="per_unit">Vendu à l’unité</option>
        </select>

        {saleMode === "per_unit" ? (
          <>
            <select
              value={unitType}
              onChange={(e) => setUnitType(e.target.value as UnitType)}
            >
              <option value="head">par head</option>
              <option value="polyp">par polyp</option>
              <option value="frag">par frag</option>
            </select>

            <input
              placeholder="Nb unités (ex: 2)"
              value={unitCount}
              onChange={(e) => setUnitCount(e.target.value)}
              style={{ width: 140 }}
            />
          </>
        ) : null}

        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="torch">torch</option>
          <option value="acropora">acropora</option>
          <option value="zoa">zoa</option>
        </select>

        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="available">available</option>
          <option value="sold">sold</option>
          <option value="archived">archived</option>
        </select>

        {!editingListingId ? (
          <button onClick={addListing}>Ajouter corail</button>
        ) : (
          <button onClick={updateListing}>💾 Enregistrer</button>
        )}

        <button onClick={refreshAll}>Rafraîchir</button>
      </div>

      <h2 style={{ marginTop: 24 }}>Derniers listings</h2>
      <ul style={{ marginTop: 12 }}>
        {listings.map((l) => {
          const shop = shopsById.get(l.shop_id);
          return (
            <li key={l.id} style={{ marginBottom: 10 }}>
              <div>
                <b>{l.title_raw}</b>{" "}
                <span style={{ opacity: 0.7 }}>
                  — variant: {l.variant ?? "—"} — {shop?.name ?? l.shop_id} —{" "}
                  {l.category} — {l.status} — {saleLabel(l)}
                </span>
              </div>

              <div style={{ opacity: 0.9 }}>
                Prix: {l.price_cad ?? "—"} CAD
                {l.sale_price_cad != null ? ` (soldé: ${l.sale_price_cad} CAD)` : ""}

                {l.url ? (
                  <>
                    {" "}
                    —{" "}
                    <a href={l.url} target="_blank" rel="noreferrer">
                      lien
                    </a>
                  </>
                ) : null}

                {l.image_url ? (
                  <>
                    {" "}
                    —{" "}
                    <a href={l.image_url} target="_blank" rel="noreferrer">
                      image
                    </a>
                  </>
                ) : null}

                {" "}
                <button onClick={() => startEdit(l)}>✏️</button>{" "}
                <button onClick={() => deleteListing(l.id)}>❌</button>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

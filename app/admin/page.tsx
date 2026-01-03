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
  created_at: string;
};

export default function AdminPage() {
  // ---------- Shops ----------
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopName, setShopName] = useState("");
  const [shopUrl, setShopUrl] = useState("");

  // ---------- Listings ----------
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>("");
  const [titleRaw, setTitleRaw] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [priceCad, setPriceCad] = useState("");
  const [salePriceCad, setSalePriceCad] = useState("");
  const [category, setCategory] = useState("torch");
  const [status, setStatus] = useState("available");

  const [msg, setMsg] = useState<string | null>(null);

  const shopsById = useMemo(() => {
    const m = new Map<string, Shop>();
    shops.forEach((s) => m.set(s.id, s));
    return m;
  }, [shops]);

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
    // auto-select first shop for listings form
    if (!selectedShopId && data && data.length > 0) setSelectedShopId(data[0].id);
  };

  const loadListings = async () => {
    const { data, error } = await supabase
      .from("listings")
      .select("id, shop_id, title_raw, url, price_cad, sale_price_cad, status, category, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setMsg("Erreur listings: " + error.message);
      return;
    }
    setListings((data as Listing[]) ?? []);
  };

  useEffect(() => {
    loadShops();
    loadListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addShop = async () => {
    setMsg(null);
    if (!shopName.trim()) return;

    const { error } = await supabase.from("shops").insert({
      name: shopName.trim(),
      website_url: shopUrl.trim() || null,
    });

    if (error) {
      setMsg("Erreur Supabase (add shop): " + error.message);
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
      setMsg("Erreur Supabase (delete shop): " + error.message);
      return;
    }
    await loadShops();
    await loadListings();
  };

  const addListing = async () => {
    setMsg(null);
    if (!selectedShopId) {
      setMsg("Choisis un shop.");
      return;
    }
    if (!titleRaw.trim()) {
      setMsg("Titre obligatoire.");
      return;
    }

    const price = priceCad.trim() ? Number(priceCad) : null;
    const salePrice = salePriceCad.trim() ? Number(salePriceCad) : null;

    if (priceCad.trim() && Number.isNaN(price)) {
      setMsg("Prix invalide.");
      return;
    }
    if (salePriceCad.trim() && Number.isNaN(salePrice)) {
      setMsg("Prix promo invalide.");
      return;
    }

    const { error } = await supabase.from("listings").insert({
      shop_id: selectedShopId,
      title_raw: titleRaw.trim(),
      url: listingUrl.trim() || null,
      price_cad: price,
      sale_price_cad: salePrice,
      category,
      status,
    });

    if (error) {
      setMsg("Erreur Supabase (add listing): " + error.message);
      return;
    }

    setTitleRaw("");
    setListingUrl("");
    setPriceCad("");
    setSalePriceCad("");
    setCategory("torch");
    setStatus("available");
    await loadListings();
  };

  const deleteListing = async (id: string) => {
    setMsg(null);
    const { error } = await supabase.from("listings").delete().eq("id", id);
    if (error) {
      setMsg("Erreur Supabase (delete listing): " + error.message);
      return;
    }
    await loadListings();
  };

  return (
    <main style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Admin</h1>

      {msg && (
        <div style={{ marginTop: 12, padding: 10, background: "#fff3cd", borderRadius: 8 }}>
          {msg}
        </div>
      )}

      <hr style={{ margin: "20px 0" }} />

      <h2>Shops</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <input
          placeholder="Nom du shop"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
        />
        <input
          placeholder="URL (optionnel)"
          value={shopUrl}
          onChange={(e) => setShopUrl(e.target.value)}
        />
        <button onClick={addShop}>Ajouter shop</button>
        <button onClick={() => { loadShops(); loadListings(); }}>Rafraîchir</button>
      </div>

      <ul style={{ marginTop: 12 }}>
        {shops.map((s) => (
          <li key={s.id} style={{ marginBottom: 8 }}>
            <b>{s.name}</b>{" "}
            {s.website_url ? (
              <a href={s.website_url} target="_blank" rel="noreferrer">
                {s.website_url}
              </a>
            ) : null}{" "}
            <button onClick={() => deleteShop(s.id)}>❌</button>
          </li>
        ))}
      </ul>

      <hr style={{ margin: "20px 0" }} />

      <h2>Ajouter un corail (listing)</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <select value={selectedShopId} onChange={(e) => setSelectedShopId(e.target.value)}>
          <option value="">-- Choisir un shop --</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <input
          placeholder="Titre brut (ex: Gold Torch 2 heads)"
          value={titleRaw}
          onChange={(e) => setTitleRaw(e.target.value)}
          style={{ minWidth: 280 }}
        />

        <input
          placeholder="URL (optionnel)"
          value={listingUrl}
          onChange={(e) => setListingUrl(e.target.value)}
          style={{ minWidth: 260 }}
        />

        <input
          placeholder="Prix CAD (ex: 149.99)"
          value={priceCad}
          onChange={(e) => setPriceCad(e.target.value)}
          style={{ width: 140 }}
        />

        <input
          placeholder="Prix promo (optionnel)"
          value={salePriceCad}
          onChange={(e) => setSalePriceCad(e.target.value)}
          style={{ width: 160 }}
        />

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

        <button onClick={addListing}>Ajouter corail</button>
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
                  ({shop ? shop.name : l.shop_id}) — {l.category} — {l.status}
                </span>
              </div>
              <div style={{ opacity: 0.85 }}>
                {l.price_cad != null ? `${l.price_cad} CAD` : "—"}
                {l.sale_price_cad != null ? ` (sale: ${l.sale_price_cad} CAD)` : ""}
                {l.url ? (
                  <>
                    {" "}
                    —{" "}
                    <a href={l.url} target="_blank" rel="noreferrer">
                      lien
                    </a>
                  </>
                ) : null}
                {" "}
                <button onClick={() => deleteListing(l.id)}>❌</button>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

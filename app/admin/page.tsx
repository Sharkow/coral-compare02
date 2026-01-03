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
  // ✅ TOUS LES HOOKS D’ABORD (sinon erreur React 310)
  const [authorized, setAuthorized] = useState(false);
  const [password, setPassword] = useState("");

  const [shops, setShops] = useState<Shop[]>([]);
  const [shopName, setShopName] = useState("");
  const [shopUrl, setShopUrl] = useState("");

  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedShopId, setSelectedShopId] = useState("");
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
    if (!authorized) return;
    loadShops();
    loadListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  // ✅ UI LOGIN (après hooks)
  if (!authorized) {
    return (
      <main style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
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
              alert("NEXT_PUBLIC_ADMIN_PASSWORD manquant sur Vercel (ajoute-le puis redeploy).");
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
    loadShops();
  };

  const deleteShop = async (id: string) => {
    setMsg(null);
    const { error } = await supabase.from("shops").delete().eq("id", id);
    if (error) {
      setMsg("Erreur (delete shop): " + error.message);
      return;
    }
    loadShops();
    loadListings();
  };

  const addListing = async () => {
    setMsg(null);
    if (!selectedShopId || !titleRaw.trim()) return;

    const price = priceCad.trim() ? Number(priceCad) : null;
    const salePrice = salePriceCad.trim() ? Number(salePriceCad) : null;

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
      setMsg("Erreur (add listing): " + error.message);
      return;
    }

    setTitleRaw("");
    setListingUrl("");
    setPriceCad("");
    setSalePriceCad("");
    loadListings();
  };

  const deleteListing = async (id: string) => {
    setMsg(null);
    const { error } = await supabase.from("listings").delete().eq("id", id);
    if (error) {
      setMsg("Erreur (delete listing): " + error.message);
      return;
    }
    loadListings();
  };

  return (
    <main style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1>Admin sécurisé</h1>

      {msg && (
        <div style={{ marginTop: 12, padding: 10, background: "#fff3cd", borderRadius: 8 }}>
          {msg}
        </div>
      )}

      <hr style={{ margin: "20px 0" }} />

      <h2>Shops</h2>
      <input placeholder="Nom" value={shopName} onChange={(e) => setShopName(e.target.value)} />
      <input placeholder="URL" value={shopUrl} onChange={(e) => setShopUrl(e.target.value)} />
      <button onClick={addShop}>Ajouter shop</button>

      <ul style={{ marginTop: 12 }}>
        {shops.map((s) => (
          <li key={s.id}>
            <b>{s.name}</b> <button onClick={() => deleteShop(s.id)}>❌</button>
          </li>
        ))}
      </ul>

      <hr style={{ margin: "20px 0" }} />

      <h2>Ajouter un corail</h2>
      <select value={selectedShopId} onChange={(e) => setSelectedShopId(e.target.value)}>
        <option value="">Choisir un shop</option>
        {shops.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <input placeholder="Titre" value={titleRaw} onChange={(e) => setTitleRaw(e.target.value)} />
      <input placeholder="URL" value={listingUrl} onChange={(e) => setListingUrl(e.target.value)} />
      <input placeholder="Prix" value={priceCad} onChange={(e) => setPriceCad(e.target.value)} />
      <input
        placeholder="Prix promo"
        value={salePriceCad}
        onChange={(e) => setSalePriceCad(e.target.value)}
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

      <h2 style={{ marginTop: 24 }}>Derniers listings</h2>
      <ul style={{ marginTop: 12 }}>
        {listings.map((l) => {
          const shop = shopsById.get(l.shop_id);
          return (
            <li key={l.id}>
              <b>{l.title_raw}</b> — {shop ? shop.name : l.shop_id} — {l.category} — {l.status}{" "}
              <button onClick={() => deleteListing(l.id)}>❌</button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

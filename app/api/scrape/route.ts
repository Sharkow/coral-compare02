function parseHtmlProduct(urlRaw: string, html: string, shop_id: string, category: string): Listing {
  const $ = cheerio.load(html);

  // ✅ FIX VERCEL / TYPESCRIPT (AUCUNE LOGIQUE CHANGÉE)
  const $product = (
    $("div.product").first().length ? $("div.product").first() : $.root()
  ) as cheerio.Cheerio<cheerio.Element>;

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

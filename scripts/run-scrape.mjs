// scripts/run-scrape.mjs
import { Agent, setGlobalDispatcher } from "undici";

// ✅ enlève les timeouts "headersTimeout" et "bodyTimeout" d'undici (sinon crash si ça prend 15 min)
setGlobalDispatcher(
  new Agent({
    headersTimeout: 0,
    bodyTimeout: 0,
  })
);

const BASE = process.env.SITE_URL;        // ex: http://localhost:3000 ou https://compare-coral.ca
const SECRET = process.env.SCRAPE_SECRET; // le même que dans ton .env.local / Vercel

if (!BASE) {
  console.error("Missing SITE_URL env");
  process.exit(1);
}
if (!SECRET) {
  console.error("Missing SCRAPE_SECRET env");
  process.exit(1);
}

const url = `${BASE}/api/scrape?secret=${encodeURIComponent(SECRET)}`;

console.log("Calling:", url);

const res = await fetch(url, { method: "GET" });
const text = await res.text();

console.log("Status:", res.status);
console.log(text);

if (!res.ok) process.exit(1);

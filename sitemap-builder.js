const fs = require("fs");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
require('dotenv').config();

const SHEET_URL = process.env.GOOGLE_SCRIPT_CATALOG_URL;

const BASE_URL = "https://www.indigostores.com";

async function buildSitemap() {
  try {
    if (!SHEET_URL) {
      throw new Error('GOOGLE_SCRIPT_CATALOG_URL environment variable is not set');
    }
    const response = await fetch(SHEET_URL);
    const text = await response.text();

    let products;
    try {
      products = JSON.parse(text);
    } catch (err) {
      console.error("Failed to parse JSON. Raw response was:\n", text.slice(0, 300));
      return;
    }

    let urls = [];

    // Home
    urls.push({
      loc: `${BASE_URL}/?page=home`,
      priority: "1.0",
    });

    // Categories
    const categories = [...new Set(products.map((p) => p.Category.trim()))];
    categories.forEach((cat) => {
      if (cat) {
        urls.push({
          loc: `${BASE_URL}/?page=category&name=${encodeURIComponent(cat)}`,
          priority: "0.9",
        });
      }
    });

    // Collections
    const collections = [...new Set(products.map((p) => p.Collection.trim()))];
    collections.forEach((col) => {
      if (col) {
        urls.push({
          loc: `${BASE_URL}/?page=collection&name=${encodeURIComponent(col)}`,
          priority: "0.8",
        });
      }
    });

    // Products
    products.forEach((prod) => {
      urls.push({
        loc: `${BASE_URL}/?page=product&product=${prod.ItemID}`,
        priority: "0.7",
      });
    });

    // Build XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `
  <url>
    <loc>${u.loc}</loc>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

    fs.writeFileSync("sitemap.xml", xml, "utf8");
    console.log(`sitemap.xml generated with ${urls.length} URLs`);
  } catch (error) {
    console.error("Error building sitemap:", error);
  }
}

buildSitemap();

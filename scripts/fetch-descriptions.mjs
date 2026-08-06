// Every book in the library gets a description, and the description comes
// from the people who made the edition.
//
// Standard Ebooks writes a description for each of its editions and puts it
// on the edition's own page. Those pages are public, and Standard Ebooks
// dedicates its contributions to the public domain under CC0, so the text is
// free to carry. This script walks content/catalogue/index-v1.json, works out
// each book's page from its id, and lifts the description paragraphs into
// content/catalogue/descriptions-v1.json.
//
// It is run by hand, not by the build -- the descriptions are committed like
// the rest of the catalogue, so a build never reaches the network. Re-running
// it is safe: anything already in the output file is kept and skipped, so an
// interrupted run picks up where it stopped.
//
//   node scripts/fetch-descriptions.mjs [--force]
//
// Be kind to their server: one request at a time, with a pause between.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const indexPath = join(root, "content", "catalogue", "index-v1.json");
const outPath = join(root, "content", "catalogue", "descriptions-v1.json");

const UA = "superb-catalogue/1.0 (+https://superb.works; one-off description sync)";
const PAUSE_MS = 900;
const force = process.argv.includes("--force");

/** `a-a-milne_the-red-house-mystery` -> the edition's own page. The id is
 *  built from the same slugs Standard Ebooks uses in its URLs, joined with
 *  underscores, so splitting them apart gives the path back.
 *
 *  Except where a book has more than one author or translator: Standard
 *  Ebooks joins *those* with underscores too, inside a single path segment,
 *  and the id cannot tell the two kinds of underscore apart. Every plausible
 *  split is tried in turn, longest author run last, and the first page that
 *  exists wins. Eleven books in the library need this — the Federalist
 *  Papers, the Communist Manifesto, Lyrical Ballads and the like. */
function pagesFor(id) {
  const parts = id.split("_");
  if (parts.length <= 2) return ["https://standardebooks.org/ebooks/" + parts.join("/")];
  const candidates = [];
  for (let authors = 1; authors < parts.length; authors++) {
    const head = parts.slice(0, authors).join("_");
    const tail = parts.slice(authors);
    candidates.push("https://standardebooks.org/ebooks/" + [head, ...tail].join("/"));
    if (tail.length > 1) {
      // The trailing segments are translators, which are joined the same way.
      candidates.push("https://standardebooks.org/ebooks/" + [head, tail[0], tail.slice(1).join("_")].join("/"));
    }
  }
  return candidates;
}

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

function unescapeHtml(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m);
}

/** Standard Ebooks runs fundraising drives, and while one is on, its appeal
 *  is printed inside the description section itself. It is their page and
 *  their appeal, and it belongs there — but it is not what the book is, so it
 *  does not come with the description. Whether a given fetch sees it is a
 *  matter of when the fetch happened, which is exactly the kind of thing that
 *  should not decide what 239 of our book pages say. */
const APPEAL = [
  /rely on your support/i,
  /support our efforts with a donation/i,
  /free, and unrestricted editions of literature/i,
  /^\s*(donate|support us)\b/i,
];

/** The description section, as plain paragraphs. Their markup nests links and
 *  <i> inside the prose; none of that survives into our copy, because a book
 *  page here sets the description as running text and nothing more. */
function extractDescription(html) {
  const start = html.indexOf('<section id="description"');
  if (start === -1) return null;
  const end = html.indexOf("</section>", start);
  if (end === -1) return null;
  const block = html.slice(start, end);
  const paragraphs = [];
  for (const m of block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
    const text = unescapeHtml(m[1].replace(/<[^>]+>/g, ""))
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    if (APPEAL.some((pattern) => pattern.test(text))) continue;
    paragraphs.push(text);
  }
  return paragraphs.length ? paragraphs : null;
}

async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const index = JSON.parse(readFileSync(indexPath, "utf-8"));
const existing =
  !force && existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf-8")) : { version: 1, descriptions: {} };
const out = existing.descriptions ?? {};

let fetched = 0;
let skipped = 0;
const missing = [];

for (const [i, book] of index.books.entries()) {
  if (out[book.id]) {
    skipped += 1;
    continue;
  }
  const candidates = pagesFor(book.id);
  let paragraphs = null;
  let why = "no candidate URL";
  for (const url of candidates) {
    try {
      paragraphs = extractDescription(await get(url));
      if (paragraphs) break;
      why = "no description section";
    } catch (err) {
      why = String(err.message ?? err);
      if (candidates.length > 1) await sleep(PAUSE_MS);
    }
  }
  if (paragraphs) {
    out[book.id] = paragraphs;
    fetched += 1;
  } else {
    missing.push({ id: book.id, why });
  }
  if ((i + 1) % 25 === 0 || i === index.books.length - 1) {
    writeFileSync(
      outPath,
      JSON.stringify({ version: 1, source: "https://standardebooks.org", licence: "CC0 1.0", descriptions: out }, null, 0),
    );
    console.log(`${i + 1}/${index.books.length} — ${fetched} fetched, ${skipped} already had one, ${missing.length} without`);
  }
  await sleep(PAUSE_MS);
}

writeFileSync(
  outPath,
  JSON.stringify({ version: 1, source: "https://standardebooks.org", licence: "CC0 1.0", descriptions: out }, null, 0),
);

console.log(`\ndone — ${Object.keys(out).length} of ${index.books.length} books have a description`);
if (missing.length) {
  console.log(`${missing.length} without one:`);
  for (const m of missing.slice(0, 30)) console.log(`  ${m.id} — ${m.why}`);
}

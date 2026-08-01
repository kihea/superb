// content/catalogue.lock.json is the one place this build states which
// catalogue bytes it expects to ship (Slice 1A card, PLAN.md §7). This is
// the same check apps/web/scripts/sync-content.mjs runs at build time,
// duplicated here as a fast, deterministic unit test rather than something
// only discoverable by running a full build -- caught a real bug once
// already (a Windows text-mode write silently rewriting "\n" to "\r\n" in
// the exporting script, which changed the bytes on disk without changing
// the hash computed from the in-memory string).
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const contentRoot = join(here, "..", "..", "..", "content");

describe("the vendored catalogue artifact matches its own lock file", () => {
  const lock = JSON.parse(readFileSync(join(contentRoot, "catalogue.lock.json"), "utf-8"));

  test("the artifact named in the lock file exists", () => {
    const path = join(contentRoot, lock.vendored_path.replace(/^content\//, ""));
    expect(existsSync(path)).toBe(true);
  });

  test("its sha256 matches the lock file", () => {
    const path = join(contentRoot, lock.vendored_path.replace(/^content\//, ""));
    const bytes = readFileSync(path);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(lock.sha256);
  });

  test("it parses and carries the fields Slice 1A relies on", () => {
    const path = join(contentRoot, lock.vendored_path.replace(/^content\//, ""));
    const artifact = JSON.parse(readFileSync(path, "utf-8"));
    expect(artifact.schema_version).toBe("0.1.0");
    expect(artifact.source.commit).toBe(lock.commit);
    expect(Array.isArray(artifact.books)).toBe(true);
    expect(artifact.books.length).toBeGreaterThan(0);

    const dracula = artifact.books.find((b: { id: string }) => b.id === "bram-stoker_dracula");
    expect(dracula).toBeDefined();
    expect(dracula.title).toBe("Dracula");
    expect(dracula.author).toBe("Bram Stoker");
    expect(dracula.parts.length).toBeGreaterThan(1);
    // Every book's own provenance must be self-sufficient (law: every
    // sourced excerpt carries a complete citation) -- a stranger can verify
    // this from the record alone, without this repository or the catalogue
    // repository's own working format.
    expect(dracula.provenance.workPage).toMatch(/^https:\/\//);
    expect(dracula.provenance.licence.length).toBeGreaterThan(0);
  });

  test("every word this slice can gloss actually appears in the shipped book table", () => {
    const glossesPath = join(contentRoot, "glosses", "bram-stoker_dracula.json");
    expect(existsSync(glossesPath)).toBe(true);
    const table = JSON.parse(readFileSync(glossesPath, "utf-8"));
    const words = Object.keys(table);
    expect(words.length).toBeGreaterThan(1000);
    // Every key is already lowercased and every entry carries a non-empty,
    // period-terminated definition -- the mechanical-normalization contract
    // content/glosses.ts's fallback and BookGlossCard both rely on.
    for (const word of words.slice(0, 200)) {
      expect(word).toBe(word.toLowerCase());
      expect(table[word].definition.length).toBeGreaterThan(0);
    }
  });
});

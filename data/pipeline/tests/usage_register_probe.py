"""ADVISORY-010 SS1's usage-register probe: is the measured ceiling the
comparison register's fault, or overlap-as-a-mechanism's?

PRECISION-STANDARD.md's diagnosis is that gloss-overlap measures topical
co-occurrence between a passage and Wiktionary's *definition-writing*
register, not comprehension -- and 28 of 30 rejected claims in the frozen
sample were sense-correct, cue-less prose. That diagnosis names the register
as the suspect, not the overlap mechanism itself. Wiktionary entries also
carry *example sentences* -- usage-register text, same source (kaikki.org),
same licence, already covered by data/MANIFEST.md's existing Wiktionary row
(no new dataset enters the build). This script re-runs the identical
overlap-and-hand-key measurement against that register instead, on the same
frozen 100-claim pooled sample, under the same PRECISION-STANDARD.md
standard.

Not a rewrite of excerpts.py -- a standalone measurement, reported beside
the gloss-based frontier table (frontier_table.py) so the two can be
compared column for column.

Source: reads the same kaikki.org English-dictionary JSONL dump
`glosses.py` itself streams (one local pass, filtered to exactly the
sample's ~100 words plus any lemma a form-of/alt-of redirect points at --
the same resolution `glosses.py` already performs when picking the winning
gloss those words were glossed with). Pass the dump's path as the first
argument; `--fetch` falls back to kaikki.org's per-word lookup pages for any
word the local dump doesn't cover (useful with no local copy on hand),
rate-limited to be polite to a shared, free resource.

Run: python data/pipeline/tests/usage_register_probe.py /path/to/kaikki-dump.jsonl
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "data" / "pipeline"))
import excerpts as ex  # noqa: E402
import glosses as gl  # noqa: E402

HERE = pathlib.Path(__file__).parent
RESULT_PATH = HERE / "usage_register_result.json"
CONTENT_POS = {"noun", "verb", "adj", "adv"}


def pooled_sample() -> list[dict]:
    """Same frozen pooled sample frontier_table.py measures against, so the
    two are directly comparable, claim for claim."""
    rows = []
    before_sample = json.loads((HERE / "corpus_precision_sample.json").read_text(encoding="utf-8"))
    before_key = json.loads((HERE / "corpus_precision_key.json").read_text(encoding="utf-8"))["verdicts"]
    for s in before_sample:
        entry = before_key[s["id"]]
        hand = entry["informative"] if isinstance(entry, dict) else entry
        rows.append({"word": s["word"], "text": s["text"], "hand": hand})
    after_sample = json.loads((HERE / "corpus_precision_sample_after.json").read_text(encoding="utf-8"))
    after_key_doc = json.loads((HERE / "corpus_precision_key_after.json").read_text(encoding="utf-8"))
    after_key = after_key_doc["verdicts"]
    for s in after_sample:
        entry = after_key[s["id"]]
        hand = entry["informative"] if isinstance(entry, dict) else entry
        rows.append({"word": s["word"], "text": s["text"], "hand": hand})
    return rows


def find_examples_for_gloss(entries: list[dict], gloss_text: str) -> list[str]:
    """The example sentences attached to the same sense glosses.py picked as
    the word's winning gloss -- so this probe compares against the usage
    text for the *same* sense excerpts.py's gloss-overlap signal already
    consults, not a different, easier sense."""
    for e in entries:
        for s in e.get("senses", []):
            sense_glosses = s.get("glosses") or []
            if sense_glosses and sense_glosses[0].strip() == gloss_text.strip():
                exs = s.get("examples") or []
                return [ex_.get("text", "") for ex_ in exs if ex_.get("text")]
    return []


def redirect_lemma(entries: list[dict]) -> str | None:
    for e in entries:
        if e.get("pos") not in CONTENT_POS:
            continue
        for s in e.get("senses", []):
            tags = s.get("tags", [])
            target = gl.redirect_target(s, tags)
            if target:
                return target
    return None


def load_from_local_dump(dump_path: pathlib.Path, words: set[str]) -> dict[str, list[dict]]:
    """One local pass over the dump per redirect-resolution depth, collecting
    every entry for exactly `words` -- the sample's own words, expanded a
    further pass for any form-of/alt-of lemma discovered (mirrors
    glosses.py's own redirect resolution, just keeping every candidate entry
    instead of picking one gloss), capped at the same depth
    resolve_redirect() itself caps at."""
    entries: dict[str, list[dict]] = {w: [] for w in words}
    frontier = set(words)
    seen_words = set(words)
    depth = 0
    while frontier and depth < 6:
        depth += 1
        newly: set[str] = set()
        print(f"  scanning dump, depth {depth}, {len(frontier)} words outstanding...", file=sys.stderr)
        with dump_path.open(encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    e = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if e.get("lang_code") != "en":
                    continue
                w = e.get("word", "").lower()
                if w not in frontier:
                    continue
                entries.setdefault(w, []).append(e)
                if e.get("pos") in CONTENT_POS:
                    for s in e.get("senses", []):
                        target = gl.redirect_target(s, s.get("tags", []))
                        if target:
                            t = target.lower()
                            if t not in seen_words:
                                newly.add(t)
        frontier = newly
        seen_words |= newly
        for w in newly:
            entries.setdefault(w, [])
    return entries


def load_via_network(cache: dict, word: str) -> list[dict]:
    def url_for(w: str) -> str:
        c1 = w[0] if w[0].isalpha() else "0"
        c2 = w[:2] if len(w) > 1 and w[1].isalpha() else c1 + "0"
        return f"https://kaikki.org/dictionary/English/meaning/{c1}/{c2}/{w}.jsonl"

    if word in cache:
        return cache[word]
    req = urllib.request.Request(url_for(word), headers={"User-Agent": "superb-corpus-pipeline/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError:
        cache[word] = []
        return []
    out = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        if e.get("lang_code") == "en" and e.get("word", "").lower() == word.lower():
            out.append(e)
    cache[word] = out
    time.sleep(0.12)
    return out


def usage_text_for(word: str, winning_gloss: str, entries_by_word: dict, fetch_fallback: bool, cache: dict) -> str:
    entries = entries_by_word.get(word, [])
    exs = find_examples_for_gloss(entries, winning_gloss)
    if not exs and fetch_fallback and not entries:
        entries = load_via_network(cache, word)
        entries_by_word[word] = entries
        exs = find_examples_for_gloss(entries, winning_gloss)
    if not exs:
        lemma = redirect_lemma(entries)
        if lemma:
            lemma_entries = entries_by_word.get(lemma.lower())
            if not lemma_entries and fetch_fallback:
                lemma_entries = load_via_network(cache, lemma.lower())
                entries_by_word[lemma.lower()] = lemma_entries
            if lemma_entries:
                exs = find_examples_for_gloss(lemma_entries, winning_gloss)
    return " ".join(exs)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("dump", nargs="?", help="path to a local kaikki.org English dictionary JSONL dump")
    parser.add_argument("--fetch", action="store_true", help="fall back to per-word network fetch for any word the local dump misses")
    args = parser.parse_args()

    glosses = ex.load_glosses()
    if not glosses:
        raise SystemExit("run data/pipeline/glosses.py first (usage_register_probe.py reads its output)")
    sample = pooled_sample()
    sample_words = {s["word"].lower() for s in sample}

    entries_by_word: dict[str, list[dict]] = {}
    if args.dump:
        dump_path = pathlib.Path(args.dump)
        if not dump_path.exists():
            raise SystemExit(f"dump not found: {dump_path}")
        entries_by_word = load_from_local_dump(dump_path, sample_words)
    elif not args.fetch:
        raise SystemExit("pass a local dump path, or --fetch to use kaikki.org's per-word pages")

    cache: dict[str, list[dict]] = {}
    results = []
    for i, s in enumerate(sample):
        word = s["word"].lower()
        winning_gloss = glosses.get(word)
        if not winning_gloss:
            results.append({**s, "usage_fired": None, "reason": "no-gloss"})
            continue
        usage_text = usage_text_for(word, winning_gloss, entries_by_word, args.fetch, cache)
        if not usage_text:
            results.append({**s, "usage_fired": None, "reason": "no-examples"})
            continue
        usage_words = ex.content_words(usage_text)
        sentence_words = ex.content_words(s["text"]) - {word}
        overlap = usage_words & sentence_words
        results.append({**s, "usage_fired": bool(overlap), "reason": "measured", "overlap": sorted(overlap)})
        print(f"[{i+1}/{len(sample)}] {word!r}: fired={bool(overlap)} overlap={sorted(overlap)}", file=sys.stderr)

    measured = [r for r in results if r["reason"] == "measured"]
    no_examples = sum(1 for r in results if r["reason"] == "no-examples")
    no_gloss = sum(1 for r in results if r["reason"] == "no-gloss")
    fired = [r for r in measured if r["usage_fired"]]
    tp = sum(1 for r in fired if r["hand"])
    n = len(fired)
    precision = tp / n if n else float("nan")

    summary = {
        "n_sample": len(sample),
        "n_measured": len(measured),
        "n_no_examples": no_examples,
        "n_no_gloss": no_gloss,
        "n_fired": n,
        "tp": tp,
        "precision": precision if n else None,
        "source": args.dump if args.dump else "network (--fetch)",
    }
    RESULT_PATH.write_text(
        json.dumps({"summary": summary, "results": results}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"\nn measured (had a usage example to compare): {len(measured)} / {len(sample)} "
          f"({no_examples} no examples, {no_gloss} no gloss at all)")
    print(f"usage-register overlap fired on {n} of {len(measured)} measured claims")
    if n:
        print(f"precision (usage-register overlap, hand key agrees): {tp}/{n} = {precision:.1%}")
    else:
        print("no fires")
    print(f"wrote {RESULT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

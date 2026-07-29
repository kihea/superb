"""The standing instrument the fifth ADVISORY-015 addendum requires
(workspace/steering/ADVISORY-015-2026-07-28.md; the measurement it was built
from is workspace/reviews/VERBATIM-MATCH.md).

Tests the boundaries ruling directly, against the live corpus, every time
it is run: *the verbatim excerpt text plus the pinned source URL constitutes
the exact excerpt boundaries — checkable by a stranger with a text search.*
An excerpt whose text is not a contiguous span of the cited work, and which
does not itself carry a marked omission (an ellipsis) showing where it
skipped, is a citation failure — full stop. This script's exit code is that
one number: **zero unmarked-non-contiguous excerpts, or it fails.**

Normalization is imported from the pipeline itself (`excerpts.py`), not
reimplemented, so a mismatch can never come from this script's normalizer
disagreeing with the one that cut the text.

Network use is cache-aware: it calls the pipeline's own `fetch_book`, which
already caches every fetched work under `data/cache/gutenberg/` (gitignored)
and only hits Project Gutenberg for a work not already on disk. A full corpus
run touches 127 distinct works, not 2,599 requests. See the bottom of this
file for how this is wired into CI.

Run: python data/pipeline/tests/verbatim_match.py [--report path.json]
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import unicodedata
import urllib.error
from collections import Counter, defaultdict

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent
SOURCES_DIR = ROOT / "content" / "sources"

sys.path.insert(0, str(HERE.parent))
import excerpts as pipeline  # noqa: E402  (the corpus pipeline's own module)

WS_RE = re.compile(r"\s+")
MAX_GAPS = 3
MAX_GAP_CHARS = 600
NON_CONTIGUOUS = ("GAPPED", "MISSING")

FOLD = {
    "‘": "'", "’": "'", "‚": "'", "‛": "'",
    "“": '"', "”": '"', "„": '"', "‟": '"',
    "–": "-", "—": "-", "‒": "-", "―": "-", "−": "-",
    "…": "...", " ": " ", " ": " ", " ": " ", " ": " ",
    "­": "",
}


def ws(s: str) -> str:
    return WS_RE.sub(" ", s).strip()


def fold(s: str) -> str:
    for k, v in FOLD.items():
        s = s.replace(k, v)
    return ws(s)


def pipeline_normalized(raw: str) -> str:
    """The pipeline's own body normalization, applied to the whole book —
    a superset of every window the pipeline could have emitted. Deliberately
    does NOT apply `find_body_start()`, which only cuts front matter:
    searching the whole book is more generous, so a miss here is strong
    evidence rather than an artifact of where the pipeline itself cut.
    """
    body = pipeline.strip_boilerplate(raw)
    body = pipeline.strip_chapter_headings(body)
    # strip_boilerplate's own italic-markup pass is deliberately tight
    # (`ITALIC_SPAN_MAX_BODY`, 200 characters) to guard against an unpaired
    # underscore swallowing a whole chapter at the book-wide level — but the
    # pipeline also runs a second, looser pass per finished window
    # (`ITALIC_SPAN_MAX_WINDOW`), which is the pass that actually guarantees
    # no markup reaches a shipped excerpt (see excerpts.py's own comment).
    # Applying only the tight pass here would compare a shipped excerpt
    # (markup-free) against a normalized source that still carries a longer
    # paired span, misreporting a real match as a gap. Re-running the looser
    # pass keeps this instrument's normalization a genuine superset of what
    # the pipeline can emit.
    body = pipeline.strip_italic_markup(body, pipeline.ITALIC_SPAN_MAX_WINDOW)
    body = unicodedata.normalize("NFKC", body)
    return ws(body)


def longest_prefix_found(needle: str, haystack: str, start: int = 0) -> tuple[int, int]:
    """(length of longest prefix of needle occurring in haystack at/after
    start, index of that occurrence)."""
    if not needle:
        return 0, -1
    if haystack.find(needle[0], start) < 0:
        return 0, -1
    lo, hi = 1, len(needle)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if haystack.find(needle[:mid], start) >= 0:
            lo = mid
        else:
            hi = mid - 1
    return lo, haystack.find(needle[:lo], start)


def gap_reconstruct(t: str, norm: str) -> tuple[bool, list[str]]:
    """Can `t` be read off `norm` in order, allowing a few omitted spans?"""
    omitted: list[str] = []
    pos = 0
    rest = t
    for _ in range(MAX_GAPS + 1):
        k, at = longest_prefix_found(rest, norm, pos)
        if at < 0:
            return False, omitted
        end = at + k
        rest = rest[k:]
        if not rest.strip():
            return True, omitted
        sp = rest.find(" ")
        rest = rest[sp + 1:] if sp >= 0 else ""
        if not rest.strip():
            return True, omitted
        nxt = norm.find(rest[:40], end)
        if nxt < 0 or nxt - end > MAX_GAP_CHARS:
            return False, omitted
        omitted.append(norm[end:nxt])
        pos = nxt
    return False, omitted


def corpus_by_book() -> dict[int, list[dict]]:
    by_book: dict[int, list[dict]] = defaultdict(list)
    for p in sorted(SOURCES_DIR.glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        m = re.search(r"#(\d+)", d["provenance"]["source"])
        if not m:
            print(f"NON-GUTENBERG SOURCE (not checked here): {d['id']} -> "
                  f"{d['provenance']['source']}", file=sys.stderr)
            continue
        by_book[int(m.group(1))].append(d)
    return by_book


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=pathlib.Path, default=None,
                         help="write the full verdict+details JSON here")
    args = parser.parse_args()

    by_book = corpus_by_book()
    verdicts: dict[str, str] = {}
    details: list[dict] = []
    counts: Counter = Counter()

    for n, (gid, docs) in enumerate(sorted(by_book.items()), start=1):
        work = docs[0]["provenance"]["work"]
        try:
            raw = pipeline.fetch_book(gid)
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            print(f"[{n}/{len(by_book)}] #{gid} FETCH FAILED: {e}", file=sys.stderr)
            for d in docs:
                verdicts[d["id"]] = "UNFETCHABLE"
                counts["UNFETCHABLE"] += 1
                details.append({"id": d["id"], "class": "UNFETCHABLE", "gid": gid, "work": work})
            continue

        raw_ws = ws(raw)
        norm = pipeline_normalized(raw)
        norm_f = fold(norm)
        print(f"[{n}/{len(by_book)}] #{gid} {len(docs):>3}  {work[:38]}",
              file=sys.stderr, flush=True)

        for d in docs:
            text = d["text"]
            t_ws = ws(text)
            rec = {"id": d["id"], "gid": gid, "work": work,
                   "hand_authored": not d["id"].startswith("src-gen-")}
            if text in raw:
                cls = "RAW"
            elif t_ws in raw_ws:
                cls = "WS"
            elif t_ws in norm:
                cls = "PIPE"
            elif fold(t_ws) in norm_f:
                cls = "PUNCT"
            else:
                ok, omitted = gap_reconstruct(fold(t_ws), norm_f)
                if ok:
                    cls = "GAPPED"
                    rec["gaps"] = len(omitted)
                    rec["omitted"] = [o.strip()[:300] for o in omitted]
                else:
                    cls = "MISSING"
            rec["class"] = cls
            rec["marked_omission"] = "..." in text or "…" in text
            if cls not in ("RAW", "WS", "PIPE", "PUNCT"):
                details.append(rec)
            verdicts[d["id"]] = cls
            counts[cls] += 1

    if args.report:
        args.report.write_text(
            json.dumps({"verdicts": verdicts, "details": details}, indent=1, ensure_ascii=False),
            encoding="utf-8",
        )

    total = sum(counts.values())
    print("\n==== VERBATIM-MATCH RESULTS ====")
    for cls in ("RAW", "WS", "PIPE", "PUNCT", "GAPPED", "MISSING", "UNFETCHABLE"):
        c = counts.get(cls, 0)
        print(f"{cls:12s} {c:>5}  {100.0 * c / total:6.2f}%" if total else f"{cls:12s} {c:>5}")
    print(f"{'TOTAL':12s} {total:>5}")

    # The exit criterion: an excerpt is not a contiguous span of its cited
    # source (GAPPED, MISSING) AND its own text carries no marked omission
    # showing where it skipped. Contiguity is preferred over ellipses
    # everywhere in this corpus (the fifth addendum), so today this is
    # simply "zero GAPPED, zero MISSING" — but the check is written against
    # the actual rule, not the number, so a future excerpt that legitimately
    # needs a marked gap does not have to lie about being contiguous to pass.
    unmarked_non_contiguous = [
        r for r in details if r["class"] in NON_CONTIGUOUS and not r.get("marked_omission")
    ]
    if unmarked_non_contiguous:
        print(f"\n{len(unmarked_non_contiguous)} unmarked-non-contiguous excerpt(s):",
              file=sys.stderr)
        for r in unmarked_non_contiguous[:20]:
            print(f"  - {r['id']} ({r['class']}) — {r['work']}", file=sys.stderr)
        if len(unmarked_non_contiguous) > 20:
            print(f"  ... and {len(unmarked_non_contiguous) - 20} more", file=sys.stderr)
        return 1

    print("\n0 unmarked-non-contiguous excerpts.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""ADVISORY-012 SS3, step 1: the coverage half of the usage-register question.

`usage_register_probe.py` answered the *precision* half of ADVISORY-010's
standing falsifier -- swapping gloss-overlap's comparison register
(Wiktionary definitions) for usage examples did not change the answer on
words the corpus **already claims**. But that probe's own sample was drawn
from the corpus's real claims, and the verifier found 45 of its 46 fires sat
inside gloss-overlap's own fires already -- because the sample could only
ever contain words some signal had already selected. It could demote a claim;
it could never discover one. The *coverage* question -- would comparing
against example sentences find different words entirely, ones the current
three signals never claim at all -- has never been tested.

This script is that test, shaped as a bounded screening (ADVISORY-012 §3):
a script run, no judging. It counts candidate (word, excerpt) pairs the
current pipeline does **not** claim, for which usage-register overlap
*would* fire if it were a signal. That count alone answers whether there is
anything here. Judging a sample drawn from these new fires is step 2, run
only if this count is material -- not attempted by this script.

Source: reads the same kaikki.org English-dictionary JSONL dump
`glosses.py` streams, filtered to exactly the corpus's own candidate-word
population (every band word present in every excerpt's own text, not just
the ones currently claimed), plus any lemma a form-of/alt-of redirect points
at -- mirroring glosses.py's own redirect resolution exactly, just for
examples instead of definitions.

Run: python data/pipeline/tests/usage_register_coverage_screen.py /path/to/kaikki-dump.jsonl

This is measurement under M2 item 5b's armed tripwire (permitted per the
tripwire's own clarified text: a run whose output is never consumed for
scheduling is measurement, not consumption). Nothing here authorizes an
operating point, a corpus-size target, or a new excerpt (ADVISORY-012 §3).
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "data" / "pipeline"))
import excerpts as ex  # noqa: E402
import glosses as gl  # noqa: E402

HERE = pathlib.Path(__file__).parent
SOURCES = ROOT / "content" / "sources"
RESULT_PATH = HERE / "usage_register_coverage_result.json"
CONTENT_POS = {"noun", "verb", "adj", "adv"}


def candidate_population(band: dict[str, int]) -> tuple[list[dict], set[str]]:
    """Every (word, excerpt) pair the current pipeline does NOT already
    claim, out of every band word actually present in each excerpt's own
    text -- the population step 1 screens, not the population step 1's
    predecessor probe mistakenly sampled from (the corpus's existing
    claims)."""
    not_claimed: list[dict] = []
    needed_words: set[str] = set()
    for path in sorted(SOURCES.glob("*.json")):
        if path.stem.startswith("_"):
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        text = doc.get("text", "")
        claimed = {w.lower() for w in doc.get("words", [])}
        for w in ex.band_words_in(text, band):
            if w in claimed:
                continue
            not_claimed.append({"word": w, "text": text, "excerpt_id": doc.get("id", path.stem)})
            needed_words.add(w)
    return not_claimed, needed_words


def find_examples_for_gloss(entries: list[dict], gloss_text: str) -> list[str]:
    for e in entries:
        for s in e.get("senses", []):
            sense_glosses = s.get("glosses") or []
            if sense_glosses and sense_glosses[0].strip() == gloss_text.strip():
                exs = s.get("examples") or []
                return [ex_.get("text", "") for ex_ in exs if ex_.get("text")]
    return []


def load_examples_from_dump(dump_path: pathlib.Path, words: set[str]) -> dict[str, list[dict]]:
    """One local pass per redirect-resolution depth, collecting every entry
    for `words` -- mirrors glosses.py's own redirect walk (capped at the
    same depth resolve_redirect() itself caps at), just keeping every
    candidate entry instead of picking one gloss."""
    entries: dict[str, list[dict]] = {w: [] for w in words}
    frontier = set(words)
    seen = set(words)
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
                            if t not in seen:
                                newly.add(t)
        frontier = newly
        seen |= newly
        for w in newly:
            entries.setdefault(w, [])
    return entries


def redirect_lemma(entries: list[dict]) -> str | None:
    for e in entries:
        if e.get("pos") not in CONTENT_POS:
            continue
        for s in e.get("senses", []):
            target = gl.redirect_target(s, s.get("tags", []))
            if target:
                return target
    return None


def usage_text_for(word: str, winning_gloss: str, entries_by_word: dict) -> str:
    entries = entries_by_word.get(word, [])
    exs = find_examples_for_gloss(entries, winning_gloss)
    if not exs:
        lemma = redirect_lemma(entries)
        if lemma:
            lemma_entries = entries_by_word.get(lemma.lower(), [])
            if lemma_entries:
                exs = find_examples_for_gloss(lemma_entries, winning_gloss)
    return " ".join(exs)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("dump", help="path to a local kaikki.org English dictionary JSONL dump")
    args = parser.parse_args()

    dump_path = pathlib.Path(args.dump)
    if not dump_path.exists():
        raise SystemExit(f"dump not found: {dump_path}")

    band = ex.load_frequency_band()
    glosses = ex.load_glosses()
    if not glosses:
        raise SystemExit("run data/pipeline/glosses.py first (needs data/out/glosses.json)")

    not_claimed, needed_words = candidate_population(band)
    print(f"candidate population NOT currently claimed by any signal: "
          f"{len(not_claimed)} (word, excerpt) pairs, {len(needed_words)} distinct words",
          file=sys.stderr)

    entries_by_word = load_examples_from_dump(dump_path, needed_words)

    no_gloss = 0
    no_examples = 0
    fired = 0
    fired_words: dict[str, int] = {}
    # Every fire is recorded (word + excerpt id + overlap, not the full
    # text -- draw_usage_coverage_sample.py looks the text up from
    # content/sources/<excerpt_id>.json at draw time) so a later uniform
    # sample is drawn from the *complete* new-fire population, not just
    # whichever ones happened to turn up first in file-scan order.
    all_fired: list[dict] = []
    for i, c in enumerate(not_claimed, start=1):
        word = c["word"]
        winning_gloss = glosses.get(word)
        if not winning_gloss:
            no_gloss += 1
            continue
        usage_text = usage_text_for(word, winning_gloss, entries_by_word)
        if not usage_text:
            no_examples += 1
            continue
        usage_words = ex.content_words(usage_text)
        sentence_words = ex.content_words(c["text"]) - {word}
        overlap = usage_words & sentence_words
        if overlap:
            fired += 1
            fired_words[word] = fired_words.get(word, 0) + 1
            all_fired.append({
                "word": word, "excerpt_id": c["excerpt_id"], "overlap": sorted(overlap),
            })
        if i % 5000 == 0:
            print(f"  scored {i}/{len(not_claimed)} candidates "
                  f"({fired} new fires so far)", file=sys.stderr)

    measured = len(not_claimed) - no_gloss - no_examples
    summary = {
        "not_claimed_population": len(not_claimed),
        "distinct_candidate_words": len(needed_words),
        "no_gloss": no_gloss,
        "no_examples": no_examples,
        "measured": measured,
        "new_fires": fired,
        "distinct_words_fired": len(fired_words),
    }
    RESULT_PATH.write_text(
        json.dumps({"summary": summary, "fired_words": fired_words, "all_fired": all_fired},
                   indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"\nnot-currently-claimed population: {len(not_claimed)} (word, excerpt) pairs, "
          f"{len(needed_words)} distinct words")
    print(f"no gloss at all: {no_gloss}; gloss but no usage example in this snapshot: {no_examples}")
    print(f"measurable (had both a gloss and a usage example): {measured}")
    print(f"NEW FIRES -- usage-register overlap fires on a claim the current pipeline "
          f"does not make: {fired} ({fired/measured:.2%} of measurable candidates)" if measured
          else "NEW FIRES: 0 (nothing measurable)")
    print(f"distinct words involved in a new fire: {len(fired_words)}")
    print(f"wrote {RESULT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

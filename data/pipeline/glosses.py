"""Gloss table — writes data/out/glosses.json.

Source: the English-language extract of Wiktionary produced by `wiktextract`
(Tatu Ylonen, code MIT) and published at kaikki.org. The extraction code is
MIT; the extracted text is Wiktionary's own content, CC BY-SA 4.0 (or GFDL,
contributor's choice) — see data/NOTICE.md for the full attribution this
build-time use is required to carry, and honour it wherever a gloss reaches
a reader (Settings -> About, per ADR-008).

This script extracts *raw* dictionary glosses only. Rewriting a gloss into
the project's plain-language register, and the thorny-case panel review
ADR-012 requires before anything ships, are downstream of this file and are
not attempted here — this is a data pipeline, not the review pipeline.

Deterministic within a pinned snapshot: the source URL is a live document
that Kaikki regenerates periodically, so byte-identical output is only
guaranteed run-to-run against the same upstream snapshot. `retrieved.txt`
records the date this was last run against; re-running after an upstream
update is expected to change bytes, which is why frequency.py and
pseudowords.py (whose inputs are pinned package versions) do not share this
caveat.

Deliberately conservative about network cost: this streams the ~3 GB
upstream file once, filtering as it goes, rather than holding it on disk.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "out"
SOURCE_URL = "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl"
CONTENT_POS = {"noun", "verb", "adj", "adv"}
# Glosses that only point somewhere else teach nothing on their own.
SKIP_TAGS = {"alt-of", "abbreviation", "form-of"}


def target_words(limit: int = 30_000) -> set[str]:
    """The words this build cares about: the same band frequency.py writes."""
    freq_path = OUT_DIR / "frequency.json"
    if not freq_path.exists():
        raise SystemExit("run data/pipeline/frequency.py first (glosses.py reads its output)")
    table = json.loads(freq_path.read_text(encoding="utf-8"))
    return {row["word"] for row in table[:limit]}


def best_gloss(existing: str | None, candidate_tags: list[str], candidate_glosses: list[str]) -> str | None:
    if not candidate_glosses:
        return None
    if any(tag in SKIP_TAGS for tag in candidate_tags):
        return existing
    gloss = candidate_glosses[0].strip()
    if not gloss:
        return existing
    # First substantive gloss wins; deterministic because line order in the
    # upstream file is stable within one snapshot.
    return existing if existing is not None else gloss


def redirect_target(sense: dict, tags: list[str]) -> str | None:
    """The lemma a `form-of` or `alt-of` sense points at, e.g. "shook" ->
    "shake" ("simple past of shake", tags ["form-of", "past"]).

    M2 item 5b's diagnosis: this pipeline's target words are drawn purely by
    *surface-form frequency* (frequency.py's own comment: "running" is its own
    entry, distinct from "run"), so a huge share of them are inflections —
    and wiktextract lists an inflected form's entry as its own dictionary
    headword, sitting in the same file, at the same POS tier, as any
    unrelated word that happens to share the spelling. "shook" is the
    concrete case that surfaced this: etymology 1 gives a rare dialectal
    noun/verb ("a set of pieces for making a cask or box, usually wood" /
    "to pack ... in a shook") and etymology 2 gives the ordinary "simple past
    of shake" — in this snapshot the rare pair is listed first, so the old
    first-substantive-sense rule glossed the frequency band's "shook" as a
    cask term, and `excerpts.py`'s gloss-overlap signal fired on excerpts
    where a passage's own unrelated words ("wood", "set") happened to
    coincide with that wrong gloss's vocabulary — a false claim of teaching,
    not a merely-lossy one (docs/seams.md §Seam 2).

    A `tags` entry of "form-of"/"alt-of" is wiktextract's own annotation that
    a surface form is (at least also) an inflection or alternate spelling of
    a more basic word. For a frequency-drawn surface form that is close to
    certain to be the dominant real-world reading, and it is a *structural*
    signal already present in the data — not a guess about which sense a
    given excerpt intends — so `build()` below lets it override any homograph
    entry for the same spelling, wherever in the file that homograph sits.
    """
    if "form-of" in tags:
        refs = sense.get("form_of") or []
    elif "alt-of" in tags:
        refs = sense.get("alt_of") or []
    else:
        return None
    for ref in refs:
        target = ref.get("word") if isinstance(ref, dict) else None
        if target:
            return target
    return None


def resolve_redirect(word: str, result: dict[str, str], redirect: dict[str, str], depth: int = 0) -> str | None:
    """Follow `word`'s redirect chain (capped, in case a lemma is itself
    redirected — not observed but cheap to guard) to a substantive gloss."""
    if word in result:
        return result[word]
    if depth < 5 and word in redirect:
        return resolve_redirect(redirect[word], result, redirect, depth + 1)
    return None


def build(words: set[str], source) -> dict[str, str]:
    result: dict[str, str] = {}
    # Surface word -> the lemma its form-of/alt-of sense names. Populated
    # from whichever entry names it first (deterministic: line order is
    # stable within a snapshot) and never overwritten once set.
    redirect: dict[str, str] = {}
    for raw_line in source:
        line = raw_line.decode("utf-8", errors="ignore") if isinstance(raw_line, bytes) else raw_line
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if entry.get("lang_code") != "en":
            continue
        word = entry.get("word", "")
        # No early-exit on len(result) >= len(words): a word already holding
        # a substantive gloss from one homograph entry can still be
        # overridden by a redirect discovered in a later entry (see
        # redirect_target's docstring), so every entry for a target word
        # must be seen. This never shortened a real run anyway — the shipped
        # snapshot never reached the old break condition (18,452 of 30,000
        # target words found after a full pass), so nothing measured is
        # given up by removing it.
        if word not in words or word in redirect:
            continue
        if entry.get("pos") not in CONTENT_POS:
            continue
        for sense in entry.get("senses", []):
            tags = sense.get("tags", [])
            target = redirect_target(sense, tags)
            if target and word not in redirect:
                redirect[word] = target
            if word in redirect:
                break  # a redirect beats any homograph sense in this entry too
            gloss = best_gloss(result.get(word), tags, sense.get("glosses", []))
            if gloss is not None:
                result[word] = gloss
                break

    for surface, lemma in redirect.items():
        # Drop whatever homograph gloss a same-spelling entry set for
        # `surface` before its redirect was discovered ("shook" picked up
        # the cask noun's gloss from the entry that precedes "simple past
        # of shake" in this snapshot). Once a redirect exists, that leftover
        # value must not survive as a silent fallback — it is exactly the
        # wrong-sense claim item 5b diagnosed, and resolve_redirect below
        # looks the lemma up under its own key, which `pop` does not touch.
        result.pop(surface, None)
        resolved = resolve_redirect(lemma, result, redirect)
        if resolved is not None:
            result[surface] = resolved
        # else: the lemma never resolved to a substantive gloss either.
        # Leave `surface` unglossed rather than fall back to the homograph
        # the redirect exists to reject — an absent gloss only disables the
        # gloss-overlap signal for this word (a coverage cost
        # `is_informative` already tolerates via its other two gating
        # signals); a wrong one corrupts a claim, which is item 5b's whole
        # subject.
    return result


def write(glosses: dict[str, str]) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "glosses.json"
    ordered = dict(sorted(glosses.items()))
    out_path.write_text(
        json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return out_path


if __name__ == "__main__":
    words = target_words()
    print(f"streaming {SOURCE_URL} for {len(words)} target words...", file=sys.stderr)
    with urllib.request.urlopen(SOURCE_URL) as response:
        glosses = build(words, response)
    path = write(glosses)
    print(f"wrote {path} ({len(glosses)} of {len(words)} target words found)")
